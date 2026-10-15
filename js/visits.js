/**
 * Gestão de Solicitação de Visitas — Congregação Batista Nova Aurora
 * - Formulário de cadastro: Nome, Data (seleção no calendário interativo) e Endereço com Ponto de Referência
 * - Bloqueio automático no calendário para dias que já possuem eventos ou visitas agendadas (e datas passadas)
 * - Sincronização em tempo real via Cloud Firestore e suporte Offline (localStorage)
 */

import { db } from './firebase-config.js';
import {
  collection,
  addDoc,
  onSnapshot,
  deleteDoc,
  doc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const STORAGE_KEY_VISITS = 'nova_aurora_visitas_agendadas_v1';
const STORAGE_KEY_EVENTS = 'nova_aurora_eventos_v1';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

let scheduledVisits = [];
let scheduledEvents = [];
let selectedDateISO = ''; // YYYY-MM-DD
let currentCalendarMonth = new Date().getMonth();
let currentCalendarYear = new Date().getFullYear();
let currentTab = 'form'; // 'form' | 'list'

// Referências DOM
let visitsScreen = null;
let btnVisitsBack = null;
let tabVisitForm = null;
let tabVisitList = null;
let countScheduledVisits = null;
let visitFormView = null;
let visitListView = null;
let visitCardsContainer = null;

let formVisitRequest = null;
let inputVisitName = null;
let inputVisitDateDisplay = null;
let inputVisitAddress = null;
let calendarGridDays = null;
let calendarMonthYearLabel = null;
let btnCalPrev = null;
let btnCalNext = null;
let calendarFeedbackMsg = null;

function loadLocalVisits() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_VISITS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('Erro ao ler cache de visitas agendadas:', e);
  }
  return [];
}

function saveLocalVisits(list) {
  try {
    localStorage.setItem(STORAGE_KEY_VISITS, JSON.stringify(list));
  } catch (e) {
    console.warn('Erro ao salvar cache de visitas agendadas:', e);
  }
}

function loadLocalEvents() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_EVENTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('Erro ao ler cache de eventos:', e);
  }
  return [];
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function toISODateString(year, month, day) {
  const y = String(year);
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatISOToBR(isoStr) {
  if (!isoStr || !isoStr.includes('-')) return isoStr || '';
  const [y, m, d] = isoStr.split('-');
  return `${d}/${m}/${y}`;
}

function normalizeDateToISO(dateVal) {
  if (!dateVal) return '';
  const str = String(dateVal).trim();
  // Se já estiver em YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  // Se estiver em DD/MM/YYYY
  const brMatch = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  }
  return '';
}

function getTodayISO() {
  const now = new Date();
  return toISODateString(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Retorna um Mapa de todas as datas ocupadas (YYYY-MM-DD -> motivo)
 * verificando tanto visitas agendadas quanto eventos/programações
 */
function getOccupiedDatesMap() {
  const map = new Map();

  // 1. Eventos cadastrados
  scheduledEvents.forEach((ev) => {
    const iso = normalizeDateToISO(ev.dataISO || ev.data);
    if (iso) {
      map.set(iso, {
        type: 'event',
        label: ev.titulo || ev.nome || 'Evento agendado'
      });
    }
  });

  // 2. Visitas agendadas
  scheduledVisits.forEach((v) => {
    const iso = normalizeDateToISO(v.dataISO || v.data);
    if (iso) {
      const existing = map.get(iso);
      map.set(iso, {
        type: existing ? 'both' : 'visit',
        label: existing ? 'Evento e visita agendados' : 'Visita já agendada neste dia'
      });
    }
  });

  return map;
}

/**
 * Renderiza o calendário mensal interativo bloqueando datas passadas
 * e dias que já possuem eventos ou visitas agendadas.
 */
function renderCalendar() {
  if (!calendarGridDays || !calendarMonthYearLabel) return;

  calendarMonthYearLabel.textContent = `${MONTH_NAMES[currentCalendarMonth]} ${currentCalendarYear}`;

  const firstDayOfMonth = new Date(currentCalendarYear, currentCalendarMonth, 1).getDay();
  const daysInMonth = new Date(currentCalendarYear, currentCalendarMonth + 1, 0).getDate();
  const todayISO = getTodayISO();
  const occupiedMap = getOccupiedDatesMap();

  // Se a data selecionada passou a ficar ocupada por outra pessoa em tempo real, limpa seleção
  if (selectedDateISO && occupiedMap.has(selectedDateISO)) {
    selectedDateISO = '';
    updateSelectedDateInput();
    showCalendarNotice('A data selecionada acabou de ser preenchida. Por favor, escolha outro dia livre.');
  }

  let html = '';

  // Células vazias antes do 1º dia do mês
  for (let i = 0; i < firstDayOfMonth; i++) {
    html += `<div class="cal-day cal-day-empty" aria-hidden="true"></div>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const iso = toISODateString(currentCalendarYear, currentCalendarMonth, day);
    const isPast = iso < todayISO;
    const isToday = iso === todayISO;
    const occupiedInfo = occupiedMap.get(iso);
    const isOccupied = Boolean(occupiedInfo);
    const isSelected = iso === selectedDateISO;

    let classes = ['cal-day'];
    if (isToday) classes.push('is-today');
    if (isPast) classes.push('is-past');
    if (isOccupied) classes.push('is-occupied');
    if (isSelected && !isOccupied && !isPast) classes.push('is-selected');

    const isDisabled = isPast || isOccupied;
    let titleText = `Selecionar ${formatISOToBR(iso)}`;
    if (isOccupied) {
      titleText = `Indisponível (${occupiedInfo.label})`;
    } else if (isPast) {
      titleText = 'Data já passou';
    }

    html += `
      <button
        type="button"
        class="${classes.join(' ')}"
        data-iso="${iso}"
        data-occupied="${isOccupied ? 'true' : 'false'}"
        data-past="${isPast ? 'true' : 'false'}"
        ${isDisabled ? 'aria-disabled="true"' : ''}
        title="${escapeHtml(titleText)}"
      >
        <span class="cal-day-number">${day}</span>
        ${isOccupied ? '<span class="cal-day-dot" aria-hidden="true"></span>' : ''}
      </button>
    `;
  }

  calendarGridDays.innerHTML = html;

  // Listeners nos dias do calendário
  calendarGridDays.querySelectorAll('.cal-day:not(.cal-day-empty)').forEach((btn) => {
    btn.addEventListener('click', () => {
      const iso = btn.getAttribute('data-iso');
      const isOccupied = btn.getAttribute('data-occupied') === 'true';
      const isPast = btn.getAttribute('data-past') === 'true';

      if (isOccupied) {
        const info = occupiedMap.get(iso);
        showCalendarNotice(`O dia ${formatISOToBR(iso)} já possui ${info && info.type === 'event' ? 'evento agendado' : 'visita ou evento agendado'} e não está disponível.`);
        return;
      }

      if (isPast) {
        showCalendarNotice('Não é possível agendar visitas em datas passadas.');
        return;
      }

      hideCalendarNotice();
      selectedDateISO = iso;
      updateSelectedDateInput();
      renderCalendar();
    });
  });
}

function updateSelectedDateInput() {
  if (!inputVisitDateDisplay) return;
  if (selectedDateISO) {
    inputVisitDateDisplay.value = formatISOToBR(selectedDateISO);
    inputVisitDateDisplay.classList.add('has-value');
  } else {
    inputVisitDateDisplay.value = '';
    inputVisitDateDisplay.classList.remove('has-value');
  }
}

function showCalendarNotice(msg) {
  if (!calendarFeedbackMsg) return;
  calendarFeedbackMsg.textContent = msg;
  calendarFeedbackMsg.style.display = 'block';
}

function hideCalendarNotice() {
  if (!calendarFeedbackMsg) return;
  calendarFeedbackMsg.textContent = '';
  calendarFeedbackMsg.style.display = 'none';
}

/**
 * Alterna entre a aba de Cadastro e a aba de Visitas Agendadas
 */
function switchVisitTab(tab) {
  currentTab = tab;
  if (tab === 'form') {
    if (tabVisitForm) tabVisitForm.classList.add('is-active');
    if (tabVisitList) tabVisitList.classList.remove('is-active');
    if (visitFormView) visitFormView.style.display = 'block';
    if (visitListView) visitListView.style.display = 'none';
    renderCalendar();
  } else {
    if (tabVisitForm) tabVisitForm.classList.remove('is-active');
    if (tabVisitList) tabVisitList.classList.add('is-active');
    if (visitFormView) visitFormView.style.display = 'none';
    if (visitListView) visitListView.style.display = 'block';
    renderScheduledVisitsList();
  }
}

/**
 * Renderiza a lista de solicitações de visitas agendadas
 */
function renderScheduledVisitsList() {
  if (countScheduledVisits) {
    countScheduledVisits.textContent = scheduledVisits.length;
  }

  if (!visitCardsContainer) return;

  if (scheduledVisits.length === 0) {
    visitCardsContainer.innerHTML = `
      <div class="visitor-empty-state">
        <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.32)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
        <p>Nenhuma visita agendada no momento.</p>
        <span>Use a aba "Agendar Visita" para escolher uma data livre no calendário.</span>
      </div>
    `;
    return;
  }

  // Ordena pelas datas agendadas (mais próximas primeiro)
  const sorted = [...scheduledVisits].sort((a, b) => {
    const isoA = normalizeDateToISO(a.dataISO || a.data) || '9999-99-99';
    const isoB = normalizeDateToISO(b.dataISO || b.data) || '9999-99-99';
    return isoA.localeCompare(isoB);
  });

  visitCardsContainer.innerHTML = sorted.map((item) => {
    const displayDate = item.data || formatISOToBR(item.dataISO);
    return `
      <div class="visit-scheduled-card" data-id="${escapeHtml(item.id)}">
        <div class="visit-scheduled-top">
          <div class="visit-scheduled-name-wrap">
            <span class="visit-scheduled-name">${escapeHtml(item.nome)}</span>
            <span class="visit-date-pill">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
              ${escapeHtml(displayDate)}
            </span>
          </div>
          <button type="button" class="btn-cancel-visit" data-action="delete-visit" data-id="${escapeHtml(item.id)}" title="Cancelar agendamento e liberar data">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
        <div class="visit-scheduled-address">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ffaa33" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0; margin-top:2px;">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
            <circle cx="12" cy="10" r="3"></circle>
          </svg>
          <span>${escapeHtml(item.endereco)}</span>
        </div>
      </div>
    `;
  }).join('');

  visitCardsContainer.querySelectorAll('[data-action="delete-visit"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      handleDeleteVisit(id);
    });
  });
}

/**
 * Salva nova solicitação de visita
 */
async function handleVisitRequestSubmit(e) {
  e.preventDefault();

  const nome = (inputVisitName ? inputVisitName.value : '').trim();
  const endereco = (inputVisitAddress ? inputVisitAddress.value : '').trim();

  if (!nome) {
    alert('Por favor, informe o seu nome.');
    if (inputVisitName) inputVisitName.focus();
    return;
  }

  if (!selectedDateISO) {
    showCalendarNotice('Por favor, selecione uma data disponível no calendário.');
    return;
  }

  const occupiedMap = getOccupiedDatesMap();
  if (occupiedMap.has(selectedDateISO)) {
    showCalendarNotice('Esta data já possui um evento ou visita agendada. Escolha outro dia disponível.');
    renderCalendar();
    return;
  }

  if (!endereco) {
    alert('Por favor, informe o endereço com ponto de referência.');
    if (inputVisitAddress) inputVisitAddress.focus();
    return;
  }

  const newVisit = {
    nome,
    dataISO: selectedDateISO,
    data: formatISOToBR(selectedDateISO),
    endereco,
    timestamp: Date.now()
  };

  const tempId = 'temp-visit-' + Date.now();
  scheduledVisits.push({ id: tempId, ...newVisit });
  saveLocalVisits(scheduledVisits);

  // Limpa campos do formulário
  if (inputVisitName) inputVisitName.value = '';
  if (inputVisitAddress) inputVisitAddress.value = '';
  selectedDateISO = '';
  updateSelectedDateInput();
  hideCalendarNotice();
  renderCalendar();

  if (countScheduledVisits) {
    countScheduledVisits.textContent = scheduledVisits.length;
  }

  // Alterna para a lista para confirmar visualmente o agendamento
  switchVisitTab('list');

  // Persiste no Cloud Firestore
  try {
    if (db) {
      const docRef = await addDoc(collection(db, 'solicitacoes_visita'), {
        nome: newVisit.nome,
        dataISO: newVisit.dataISO,
        data: newVisit.data,
        endereco: newVisit.endereco,
        timestamp: serverTimestamp()
      });
      const item = scheduledVisits.find((v) => v.id === tempId);
      if (item) item.id = docRef.id;
      saveLocalVisits(scheduledVisits);
      renderScheduledVisitsList();
    }
  } catch (err) {
    console.warn('Erro ao salvar visita no Firestore (salva localmente):', err);
  }
}

async function handleDeleteVisit(visitId) {
  const item = scheduledVisits.find((v) => String(v.id) === String(visitId));
  if (!item) return;

  if (!confirm(`Deseja cancelar a visita agendada de "${item.nome}" no dia ${item.data}?`)) {
    return;
  }

  scheduledVisits = scheduledVisits.filter((v) => String(v.id) !== String(visitId));
  saveLocalVisits(scheduledVisits);
  renderScheduledVisitsList();
  renderCalendar();

  if (!String(visitId).startsWith('temp-')) {
    try {
      if (db) {
        await deleteDoc(doc(db, 'solicitacoes_visita', String(visitId)));
      }
    } catch (err) {
      console.warn('Erro ao remover visita no Firestore:', err);
    }
  }
}

/**
 * Sincronização em tempo real com Firestore (Visitas + Eventos/Programações)
 */
function subscribeToVisitsAndEvents() {
  if (!db) return;

  // 1. Escuta Visitas Agendadas
  try {
    onSnapshot(collection(db, 'solicitacoes_visita'), (snapshot) => {
      const remoteVisits = [];
      snapshot.forEach((d) => {
        const data = d.data();
        const iso = normalizeDateToISO(data.dataISO || data.data);
        remoteVisits.push({
          id: d.id,
          nome: data.nome || '',
          dataISO: iso,
          data: data.data || formatISOToBR(iso),
          endereco: data.endereco || '',
          timestamp: Date.now()
        });
      });

      const pendingLocals = scheduledVisits.filter((v) => String(v.id).startsWith('temp-'));
      scheduledVisits = [...pendingLocals, ...remoteVisits];
      saveLocalVisits(scheduledVisits);

      if (countScheduledVisits) {
        countScheduledVisits.textContent = scheduledVisits.length;
      }
      renderCalendar();
      if (currentTab === 'list') {
        renderScheduledVisitsList();
      }
    }, (err) => {
      console.warn('Aviso no listener de solicitacoes_visita:', err);
    });
  } catch (e) {
    console.warn('Erro ao assinar solicitacoes_visita:', e);
  }

  // 2. Escuta Eventos / Programações para bloquear as datas correspondentes no calendário
  let eventsFromProg = [];
  let eventsFromEv = [];
  const syncMergedEvents = () => {
    scheduledEvents = [...eventsFromProg, ...eventsFromEv];
    try {
      localStorage.setItem(STORAGE_KEY_EVENTS, JSON.stringify(scheduledEvents));
    } catch (_) {}
    renderCalendar();
  };

  try {
    onSnapshot(collection(db, 'programacoes'), (snapshot) => {
      eventsFromProg = [];
      snapshot.forEach((d) => {
        const data = d.data();
        const iso = normalizeDateToISO(data.dataISO || data.data);
        if (iso) {
          eventsFromProg.push({
            id: d.id,
            titulo: data.titulo || data.nome || 'Programação da Congregação',
            dataISO: iso
          });
        }
      });
      syncMergedEvents();
    }, () => {});
  } catch (_) {}

  try {
    onSnapshot(collection(db, 'eventos'), (snapshot) => {
      eventsFromEv = [];
      snapshot.forEach((d) => {
        const data = d.data();
        const iso = normalizeDateToISO(data.dataISO || data.data);
        if (iso) {
          eventsFromEv.push({
            id: d.id,
            titulo: data.titulo || data.nome || 'Evento da Congregação',
            dataISO: iso
          });
        }
      });
      syncMergedEvents();
    }, () => {});
  } catch (_) {}
}

export function openVisitsScreen() {
  if (visitsScreen) {
    visitsScreen.classList.add('is-active');
    visitsScreen.setAttribute('aria-hidden', 'false');
    renderCalendar();
    if (currentTab === 'list') {
      renderScheduledVisitsList();
    }
  }
}

export function closeVisitsScreen() {
  if (visitsScreen) {
    visitsScreen.classList.remove('is-active');
    visitsScreen.setAttribute('aria-hidden', 'true');
  }
}

export function initVisits() {
  scheduledVisits = loadLocalVisits();
  scheduledEvents = loadLocalEvents();

  visitsScreen = document.getElementById('visitsScreen');
  btnVisitsBack = document.getElementById('btnVisitsBack');
  tabVisitForm = document.getElementById('tabVisitForm');
  tabVisitList = document.getElementById('tabVisitList');
  countScheduledVisits = document.getElementById('countScheduledVisits');
  visitFormView = document.getElementById('visitFormView');
  visitListView = document.getElementById('visitListView');
  visitCardsContainer = document.getElementById('visitCardsContainer');

  formVisitRequest = document.getElementById('formVisitRequest');
  inputVisitName = document.getElementById('visitRequestName');
  inputVisitDateDisplay = document.getElementById('visitRequestDateDisplay');
  inputVisitAddress = document.getElementById('visitRequestAddress');
  calendarGridDays = document.getElementById('visitCalendarDays');
  calendarMonthYearLabel = document.getElementById('visitCalMonthYear');
  btnCalPrev = document.getElementById('btnVisitCalPrev');
  btnCalNext = document.getElementById('btnVisitCalNext');
  calendarFeedbackMsg = document.getElementById('visitCalendarFeedback');

  if (btnVisitsBack) {
    btnVisitsBack.addEventListener('click', closeVisitsScreen);
  }

  if (tabVisitForm) {
    tabVisitForm.addEventListener('click', () => switchVisitTab('form'));
  }

  if (tabVisitList) {
    tabVisitList.addEventListener('click', () => switchVisitTab('list'));
  }

  if (btnCalPrev) {
    btnCalPrev.addEventListener('click', () => {
      currentCalendarMonth--;
      if (currentCalendarMonth < 0) {
        currentCalendarMonth = 11;
        currentCalendarYear--;
      }
      renderCalendar();
    });
  }

  if (btnCalNext) {
    btnCalNext.addEventListener('click', () => {
      currentCalendarMonth++;
      if (currentCalendarMonth > 11) {
        currentCalendarMonth = 0;
        currentCalendarYear++;
      }
      renderCalendar();
    });
  }

  if (formVisitRequest) {
    formVisitRequest.addEventListener('submit', handleVisitRequestSubmit);
  }

  if (countScheduledVisits) {
    countScheduledVisits.textContent = scheduledVisits.length;
  }

  renderCalendar();
  subscribeToVisitsAndEvents();
}
