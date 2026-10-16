/**
 * Gestão de Solicitação de Visitas — Congregação Batista Nova Aurora
 * - Formulário de cadastro: Nome, Data (marcar no calendário), Horário e Endereço com Ponto de Referência
 * - Regras de disponibilidade:
 *   * Domingos e Segundas desabilitados para visitas
 *   * Quintas-feiras à noite (18:00 e 20:00) desabilitadas (horário de culto)
 *   * Horários organizados a cada 2h: 09:00, 14:00, 16:00, 18:00, 20:00 (exceto intervalo de almoço 12:00 às 14:00)
 *   * Bloqueio automático de dias e horários com visitas ou eventos já agendados
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

// Horários disponíveis organizados a cada 2 horas (09:00 às 21:00, exceto 12:00 às 14:00)
const ALL_TIME_SLOTS = ['09:00', '14:00', '16:00', '18:00', '20:00'];
const THURSDAY_NIGHT_SLOTS = ['18:00', '20:00'];

let scheduledVisits = [];
let scheduledEvents = [];
let selectedDateISO = ''; // YYYY-MM-DD
let selectedTimeSlot = ''; // HH:MM
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
let inputVisitAddress = null;
let calendarGridDays = null;
let calendarMonthYearLabel = null;
let btnCalPrev = null;
let btnCalNext = null;
let calendarFeedbackMsg = null;

let visitTimeSelectorWrap = null;
let visitTimeSelectedDate = null;
let visitTimeSlotsGrid = null;

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
    const rawProg = localStorage.getItem('nova_aurora_programacoes_v1');
    if (rawProg) {
      const parsed = JSON.parse(rawProg);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
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
 * Verifica se um horário de visita entra em conflito com eventos da igreja
 */
function checkEventConflict(slot, eventsOnDate) {
  if (!eventsOnDate || eventsOnDate.length === 0) return null;
  const [sH, sM] = slot.split(':').map(Number);
  const slotMinutes = sH * 60 + sM;

  for (const ev of eventsOnDate) {
    if (!ev.horario || ev.horario.trim() === '' || ev.horario.toLowerCase().includes('dia todo')) {
      return ev; // Evento de dia inteiro ou sem horário bloqueia o dia
    }
    const timeMatch = ev.horario.match(/(\d{1,2}):(\d{2})/);
    if (!timeMatch) return ev;
    const evH = parseInt(timeMatch[1], 10);
    const evM = parseInt(timeMatch[2], 10);
    const evMinutes = evH * 60 + evM;

    // Conflito de horário: se a visita (com duração de 1h30 a 2h)
    // ou o evento (com duração de 1h30 a 2h) se sobrepõem (janela menor que 110 minutos)
    if (Math.abs(slotMinutes - evMinutes) < 110) {
      return ev;
    }
  }
  return null;
}

/**
 * Retorna os detalhes de disponibilidade dos horários para uma determinada data (YYYY-MM-DD)
 */
function getSlotsStatusForDate(iso) {
  if (!iso) return [];
  const [y, m, d] = iso.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const dayOfWeek = dateObj.getDay();

  // Domingos (0) e Segundas (1)
  if (dayOfWeek === 0 || dayOfWeek === 1) {
    return [];
  }

  const todayISO = getTodayISO();
  if (iso < todayISO) {
    return [];
  }

  // Verifica eventos da congregação nesta data
  const eventsOnDate = scheduledEvents.filter(
    (ev) => normalizeDateToISO(ev.dataISO || ev.data) === iso
  );

  // Se houver evento cadastrado como dia inteiro ou sem horário, bloqueia todos os horários do dia
  const hasFullDayEvent = eventsOnDate.some(
    (ev) => !ev.horario || ev.horario.trim() === '' || ev.horario.toLowerCase().includes('dia todo')
  );
  if (hasFullDayEvent) {
    return [];
  }

  const isThursday = dayOfWeek === 4;

  // Visitas cadastradas nesta data
  const visitsOnDate = scheduledVisits.filter(
    (v) => normalizeDateToISO(v.dataISO || v.data) === iso
  );

  // Se houver visita antiga sem horário, considera o dia inteiro ocupado
  const hasFullDayBooking = visitsOnDate.some((v) => !v.horario);
  if (hasFullDayBooking) {
    return [];
  }

  const bookedSlots = new Set(visitsOnDate.map((v) => v.horario).filter(Boolean));

  return ALL_TIME_SLOTS.map((slot) => {
    const isThursdayNight = isThursday && THURSDAY_NIGHT_SLOTS.includes(slot);
    const isBooked = bookedSlots.has(slot);
    const conflictingEvent = checkEventConflict(slot, eventsOnDate);
    const isEventConflict = Boolean(conflictingEvent);
    let isPastTime = false;

    // Se a data selecionada for o dia de hoje, desabilita horários já passados
    if (iso === todayISO) {
      const now = new Date();
      const [slotH, slotM] = slot.split(':').map(Number);
      if (now.getHours() > slotH || (now.getHours() === slotH && now.getMinutes() >= slotM)) {
        isPastTime = true;
      }
    }

    const isAvailable = !isThursdayNight && !isBooked && !isPastTime && !isEventConflict;
    let reason = '';
    if (isEventConflict) {
      reason = `Programação: ${conflictingEvent.titulo || 'Evento da Igreja'}`;
    } else if (isThursdayNight) {
      reason = 'Quinta à noite (Culto)';
    } else if (isBooked) {
      reason = 'Horário já reservado';
    } else if (isPastTime) {
      reason = 'Horário já passou';
    }

    return {
      slot,
      isAvailable,
      reason,
      isThursdayNight,
      isBooked,
      isPastTime,
      isEventConflict,
      conflictingEvent
    };
  });
}

/**
 * Retorna as informações de bloqueio de uma data para o calendário
 */
function getDayBlockInfo(year, month, day) {
  const iso = toISODateString(year, month, day);
  const dateObj = new Date(year, month, day);
  const dayOfWeek = dateObj.getDay();
  const todayISO = getTodayISO();

  // 1. Domingo ou Segunda
  if (dayOfWeek === 0) {
    return { isBlocked: true, type: 'sunday', label: 'Domingos não disponíveis para visitas' };
  }
  if (dayOfWeek === 1) {
    return { isBlocked: true, type: 'monday', label: 'Segundas-feiras não disponíveis para visitas' };
  }

  // 2. Data no passado
  if (iso < todayISO) {
    return { isBlocked: true, type: 'past', label: 'Data no passado' };
  }

  // 3. Verifica horários disponíveis considerando visitas, cultos e programações
  const slots = getSlotsStatusForDate(iso);
  const availableCount = slots.filter((s) => s.isAvailable).length;
  if (availableCount === 0) {
    const isThursday = dayOfWeek === 4;
    const churchEvent = scheduledEvents.find((ev) => normalizeDateToISO(ev.dataISO || ev.data) === iso);
    let fullLabel = 'Todos os horários preenchidos';
    if (churchEvent) {
      fullLabel = `Programação: ${churchEvent.titulo || 'Evento na congregação'}`;
    } else if (isThursday) {
      fullLabel = 'Horários preenchidos (Quinta à noite indisponível)';
    }

    return {
      isBlocked: true,
      type: churchEvent ? 'event' : 'full',
      label: fullLabel
    };
  }

  return { isBlocked: false, type: 'free', label: 'Disponível' };
}

/**
 * Renderiza o calendário mensal interativo
 */
function renderCalendar() {
  if (!calendarGridDays || !calendarMonthYearLabel) return;

  calendarMonthYearLabel.textContent = `${MONTH_NAMES[currentCalendarMonth]} ${currentCalendarYear}`;

  const firstDayOfMonth = new Date(currentCalendarYear, currentCalendarMonth, 1).getDay();
  const daysInMonth = new Date(currentCalendarYear, currentCalendarMonth + 1, 0).getDate();
  const todayISO = getTodayISO();

  // Validação em tempo real da seleção atual
  if (selectedDateISO) {
    const [selY, selM, selD] = selectedDateISO.split('-').map(Number);
    const selBlock = getDayBlockInfo(selY, selM - 1, selD);
    if (selBlock.isBlocked) {
      selectedDateISO = '';
      selectedTimeSlot = '';
      hideTimeSelector();
      showCalendarNotice('A data selecionada não está mais disponível. Por favor, escolha outro dia livre.');
    } else if (selectedTimeSlot) {
      // Verifica se o horário selecionado ainda está vago
      const currentSlots = getSlotsStatusForDate(selectedDateISO);
      const chosenSlotObj = currentSlots.find((s) => s.slot === selectedTimeSlot);
      if (!chosenSlotObj || !chosenSlotObj.isAvailable) {
        selectedTimeSlot = '';
        renderTimeSlots(selectedDateISO);
        showCalendarNotice('O horário selecionado acabou de ser preenchido. Por favor, escolha outro horário.');
      }
    }
  }

  let html = '';

  // Células vazias antes do 1º dia do mês
  for (let i = 0; i < firstDayOfMonth; i++) {
    html += `<div class="cal-day cal-day-empty" aria-hidden="true"></div>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const iso = toISODateString(currentCalendarYear, currentCalendarMonth, day);
    const dateObj = new Date(currentCalendarYear, currentCalendarMonth, day);
    const dayOfWeek = dateObj.getDay();
    const isSunday = dayOfWeek === 0;
    const isMonday = dayOfWeek === 1;
    const isToday = iso === todayISO;
    const blockInfo = getDayBlockInfo(currentCalendarYear, currentCalendarMonth, day);
    const isPast = blockInfo.type === 'past';
    const isOccupied = blockInfo.isBlocked && !isPast && !isSunday && !isMonday;
    const isSelected = iso === selectedDateISO;

    let classes = ['cal-day'];
    if (isToday) classes.push('is-today');
    if (isPast) classes.push('is-past');
    if (isSunday || isMonday) classes.push('is-blocked-weekday');
    if (isOccupied) classes.push('is-occupied');
    if (isSelected && !blockInfo.isBlocked) classes.push('is-selected');

    let titleText = `Selecionar ${formatISOToBR(iso)}`;
    if (isSunday) {
      titleText = 'Domingos não disponíveis para visitas';
    } else if (isMonday) {
      titleText = 'Segundas-feiras não disponíveis para visitas';
    } else if (isOccupied) {
      titleText = `Indisponível (${blockInfo.label})`;
    } else if (isPast) {
      titleText = 'Data no passado';
    }

    html += `
      <button
        type="button"
        class="${classes.join(' ')}"
        data-iso="${iso}"
        data-day="${day}"
        data-dow="${dayOfWeek}"
        data-blocked="${blockInfo.isBlocked ? 'true' : 'false'}"
        data-block-type="${blockInfo.type}"
        ${blockInfo.isBlocked ? 'aria-disabled="true"' : ''}
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
      const isBlocked = btn.getAttribute('data-blocked') === 'true';
      const blockType = btn.getAttribute('data-block-type');

      if (isBlocked) {
        if (blockType === 'sunday') {
          showCalendarNotice('Visitas não são realizadas aos domingos.');
        } else if (blockType === 'monday') {
          showCalendarNotice('Visitas não são realizadas às segundas-feiras.');
        } else if (blockType === 'past') {
          showCalendarNotice('Não é possível agendar visitas em datas passadas.');
        } else if (blockType === 'event') {
          showCalendarNotice(`O dia ${formatISOToBR(iso)} possui evento na congregação e não está disponível.`);
        } else {
          showCalendarNotice(`O dia ${formatISOToBR(iso)} já está com todos os horários preenchidos.`);
        }
        return;
      }

      hideCalendarNotice();
      selectedDateISO = iso;
      selectedTimeSlot = ''; // Reseta horário ao trocar de dia
      renderCalendar();
      renderTimeSlots(iso);
    });
  });
}

/**
 * Renderiza a lista de horários disponíveis para o dia selecionado
 */
function renderTimeSlots(iso) {
  if (!visitTimeSelectorWrap || !visitTimeSlotsGrid) return;

  if (!iso) {
    hideTimeSelector();
    return;
  }

  const slots = getSlotsStatusForDate(iso);
  if (slots.length === 0) {
    hideTimeSelector();
    return;
  }

  if (visitTimeSelectedDate) {
    visitTimeSelectedDate.textContent = formatISOToBR(iso);
  }

  let html = '';
  slots.forEach((item) => {
    const isSelected = item.slot === selectedTimeSlot;
    let btnClasses = ['btn-time-slot'];
    if (isSelected) btnClasses.push('is-selected');
    if (!item.isAvailable) btnClasses.push('is-disabled');

    let subLabel = '';
    if (item.isEventConflict) {
      subLabel = '<span class="slot-status-tag slot-tag-event">Programação</span>';
    } else if (item.isThursdayNight) {
      subLabel = '<span class="slot-status-tag">Quinta à noite</span>';
    } else if (item.isBooked) {
      subLabel = '<span class="slot-status-tag">Ocupado</span>';
    } else if (item.isPastTime) {
      subLabel = '<span class="slot-status-tag">Encerrado</span>';
    }

    html += `
      <button
        type="button"
        class="${btnClasses.join(' ')}"
        data-slot="${item.slot}"
        data-available="${item.isAvailable ? 'true' : 'false'}"
        ${!item.isAvailable ? 'disabled aria-disabled="true"' : ''}
        title="${escapeHtml(item.reason || `Escolher horário ${item.slot}`)}"
      >
        <span class="slot-time-text">${item.slot}</span>
        ${subLabel}
      </button>
    `;
  });

  visitTimeSlotsGrid.innerHTML = html;
  visitTimeSelectorWrap.style.display = 'block';

  // Listeners dos botões de horário
  visitTimeSlotsGrid.querySelectorAll('.btn-time-slot[data-available="true"]').forEach((slotBtn) => {
    slotBtn.addEventListener('click', () => {
      selectedTimeSlot = slotBtn.getAttribute('data-slot');
      hideCalendarNotice();

      // Atualiza visualmente o botão selecionado
      visitTimeSlotsGrid.querySelectorAll('.btn-time-slot').forEach((b) => {
        b.classList.remove('is-selected');
      });
      slotBtn.classList.add('is-selected');
    });
  });
}

function hideTimeSelector() {
  if (visitTimeSelectorWrap) {
    visitTimeSelectorWrap.style.display = 'none';
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
    if (selectedDateISO) {
      renderTimeSlots(selectedDateISO);
    }
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
        <span>Use a aba "Agendar Visita" para escolher uma data e horário livres no calendário.</span>
      </div>
    `;
    return;
  }

  // Ordena pelas datas agendadas e horários (mais próximos primeiro)
  const sorted = [...scheduledVisits].sort((a, b) => {
    const isoA = (normalizeDateToISO(a.dataISO || a.data) || '9999-99-99') + ' ' + (a.horario || '00:00');
    const isoB = (normalizeDateToISO(b.dataISO || b.data) || '9999-99-99') + ' ' + (b.horario || '00:00');
    return isoA.localeCompare(isoB);
  });

  visitCardsContainer.innerHTML = sorted.map((item) => {
    const displayDate = item.data || formatISOToBR(item.dataISO);
    const displaySchedule = item.horario ? `${displayDate} às ${item.horario}` : displayDate;

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
              ${escapeHtml(displaySchedule)}
            </span>
          </div>
          <button type="button" class="btn-cancel-visit" data-action="delete-visit" data-id="${escapeHtml(item.id)}" title="Cancelar agendamento e liberar horário">
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

  if (!selectedTimeSlot) {
    showCalendarNotice('Por favor, clique em um dos horários disponíveis para a visita.');
    if (visitTimeSlotsGrid) {
      visitTimeSlotsGrid.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    return;
  }

  // Validação final de horário disponível
  const availableSlots = getSlotsStatusForDate(selectedDateISO);
  const currentSlotStatus = availableSlots.find((s) => s.slot === selectedTimeSlot);
  if (!currentSlotStatus || !currentSlotStatus.isAvailable) {
    showCalendarNotice('Este horário não está mais disponível. Por favor, escolha outro horário.');
    renderTimeSlots(selectedDateISO);
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
    horario: selectedTimeSlot,
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
  selectedTimeSlot = '';
  hideCalendarNotice();
  hideTimeSelector();
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
        horario: newVisit.horario,
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

  const msgTime = item.horario ? ` às ${item.horario}` : '';
  if (!confirm(`Deseja cancelar o agendamento de "${item.nome}" no dia ${item.data}${msgTime}?`)) {
    return;
  }

  scheduledVisits = scheduledVisits.filter((v) => String(v.id) !== String(visitId));
  saveLocalVisits(scheduledVisits);
  renderScheduledVisitsList();
  renderCalendar();
  if (selectedDateISO) {
    renderTimeSlots(selectedDateISO);
  }

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
          horario: data.horario || '',
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
      if (selectedDateISO) {
        renderTimeSlots(selectedDateISO);
      }
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
    if (selectedDateISO) {
      renderTimeSlots(selectedDateISO);
    }
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
            dataISO: iso,
            horario: data.horario || ''
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
            dataISO: iso,
            horario: data.horario || ''
          });
        }
      });
      syncMergedEvents();
    }, () => {});
  } catch (_) {}

  // Escuta atualizações locais disparadas pelo events.js
  window.addEventListener('novaAuroraEventsUpdated', (e) => {
    if (Array.isArray(e.detail)) {
      eventsFromProg = e.detail.map((ev) => ({
        id: ev.id,
        titulo: ev.titulo || ev.nome || 'Programação da Congregação',
        dataISO: normalizeDateToISO(ev.dataISO || ev.data),
        horario: ev.horario || ''
      }));
      syncMergedEvents();
    }
  });
}

export function openVisitsScreen() {
  if (visitsScreen) {
    visitsScreen.classList.add('is-active');
    visitsScreen.setAttribute('aria-hidden', 'false');
    renderCalendar();
    if (selectedDateISO) {
      renderTimeSlots(selectedDateISO);
    }
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
  inputVisitAddress = document.getElementById('visitRequestAddress');
  calendarGridDays = document.getElementById('visitCalendarDays');
  calendarMonthYearLabel = document.getElementById('visitCalMonthYear');
  btnCalPrev = document.getElementById('btnVisitCalPrev');
  btnCalNext = document.getElementById('btnVisitCalNext');
  calendarFeedbackMsg = document.getElementById('visitCalendarFeedback');

  visitTimeSelectorWrap = document.getElementById('visitTimeSelectorWrap');
  visitTimeSelectedDate = document.getElementById('visitTimeSelectedDate');
  visitTimeSlotsGrid = document.getElementById('visitTimeSlotsGrid');

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
      if (selectedDateISO) {
        renderTimeSlots(selectedDateISO);
      }
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
      if (selectedDateISO) {
        renderTimeSlots(selectedDateISO);
      }
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
