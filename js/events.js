/**
 * Gestão de Programações e Eventos — Congregação Batista Nova Aurora
 * - Banner parcial ocupando toda a largura com informações sobrepostas em degradê escuro
 * - Calendário e banner perfeitamente encaixados na mesma tela sem necessidade de scroll
 * - Ao clicar no banner, ele abre em tela cheia centralizado com apenas um "X" para fechar
 * - Evento oficial cadastrado: Dia das crianças Nova Aurora (Sábado 17/10/2026 às 14:00h)
 * - Edição protegida por senha de membro (cbna.membro)
 * - Exclusão direta dentro da edição mediante mensagem de confirmação
 * - Único botão de adicionar no topo da aba
 * - Sincronização em tempo real via Cloud Firestore e suporte Offline (localStorage)
 */

import { db } from './firebase-config.js';
import {
  collection,
  addDoc,
  onSnapshot,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

import { requestMemberAccess, isMemberAuthenticated } from './visitors.js';

const STORAGE_KEY_PROG = 'nova_aurora_programacoes_v1';
const STORAGE_KEY_EVENTS_COMPAT = 'nova_aurora_eventos_v1';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const WEEKDAY_NAMES_FULL = [
  'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
  'Quinta-feira', 'Sexta-feira', 'Sábado'
];

const _nowInit = new Date();
let eventsList = [];
let currentCalendarMonth = _nowInit.getMonth();
let currentCalendarYear = _nowInit.getFullYear();
let selectedDateISO = toISODateString(_nowInit.getFullYear(), _nowInit.getMonth(), _nowInit.getDate());
let currentActiveEvent = null;
let currentEditingEvent = null;

// Variáveis do Modal de Adicionar Evento
let currentRepeatMonth = 9;
let currentRepeatYear = 2026;
let selectedRepeatDates = new Set();
let currentUploadedArtBase64 = '';
let currentEditArtBase64 = '';

// Elementos DOM
let programacoesScreen = null;
let btnProgramacoesBack = null;
let btnAddEvent = null;

// Banner Hero parcial com suporte a múltiplos eventos e deslizamento lateral
let progHeroWrap = null;
let progHeroTrack = null;
let progHeroDotsIndicator = null;
let currentDayEvents = [];

// Calendário
let calMonthYearLabel = null;
let btnProgCalPrev = null;
let btnProgCalNext = null;
let progCalendarDays = null;

// Modal Novo Evento
let modalAddEvent = null;
let formAddEvent = null;
let btnCloseAddEvent = null;
let btnCancelAddEvent = null;
let inputEventTitle = null;
let inputEventDate = null;
let inputEventTime = null;
let inputEventLocation = null;
let inputEventArt = null;
let artUploadBox = null;
let artPreviewContainer = null;
let artPreviewImg = null;
let btnRemoveArt = null;
let eventRepeatsToggle = null;
let repeatSection = null;
let repeatCalMonthYear = null;
let btnRepeatCalPrev = null;
let btnRepeatCalNext = null;
let repeatCalendarDays = null;
let repeatDatesBadges = null;

// Modal Editar Evento
let modalEditEvent = null;
let formEditEvent = null;
let btnCloseEditEvent = null;
let btnCancelEditEvent = null;
let editEventId = null;
let editEventTitle = null;
let editEventDate = null;
let editEventTime = null;
let editEventLocation = null;
let editEventArtInput = null;
let editArtUploadBox = null;
let editArtPreviewContainer = null;
let editArtPreviewImg = null;
let btnEditRemoveArt = null;
let btnDeleteEventFromEdit = null;

// Modal Preview Arte em Tela Cheia (com suporte a deslizar entre as artes do dia)
let modalArtPreview = null;
let modalArtTrack = null;
let modalArtNavBar = null;
let btnArtPrev = null;
let btnArtNext = null;
let artCounterBadge = null;
let btnCloseArtPreview = null;
let currentPreviewArts = [];
let currentPreviewIndex = 0;

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

function formatISOToBR(isoStr) {
  if (!isoStr || !isoStr.includes('-')) return isoStr || '';
  const [y, m, d] = isoStr.split('-');
  return `${d}/${m}/${y}`;
}

function formatISOTODateFull(isoStr) {
  if (!isoStr || !isoStr.includes('-')) return isoStr || '';
  const [y, m, d] = isoStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const dow = WEEKDAY_NAMES_FULL[dateObj.getDay()] || '';
  const monthName = MONTH_NAMES[dateObj.getMonth()] || '';
  return `${dow}, ${d} de ${monthName} de ${y}`;
}

function getTodayISO() {
  const now = new Date();
  return toISODateString(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Verifica eventos cuja data já passou e remove a arte pesada (Base64) do banco de dados (Firestore)
 * e do armazenamento local para economizar espaço e manter o banco leve, preservando todas as
 * demais informações do evento intactas para histórico e registro.
 */
async function cleanExpiredEventArts(items) {
  if (!Array.isArray(items) || items.length === 0) return;
  const todayISO = getTodayISO();

  for (const ev of items) {
    if (!ev || !ev.id) continue;
    const evIso = normalizeDateToISO(ev.dataISO || ev.data);
    if (!evIso) continue;

    // Se a data do evento for estritamente anterior a hoje (data já passou)
    if (evIso < todayISO) {
      const hasHeavyArt = Boolean(ev.arteBase64 && ev.arteBase64.trim());
      const hasCustomUrl = Boolean(ev.arteUrl && ev.arteUrl.trim());

      if (hasHeavyArt || hasCustomUrl) {
        console.log(`[Programações] Evento "${ev.titulo}" (${evIso}) já passou. Removendo arte do banco para manter leve...`);

        // Atualiza no Firestore se não for id local/temporário
        if (!String(ev.id).startsWith('local-') && !String(ev.id).startsWith('fallback-')) {
          try {
            await updateDoc(doc(db, 'programacoes', ev.id), {
              arteBase64: '',
              arteUrl: '',
              artCleanedAt: serverTimestamp()
            });
          } catch (err) {
            console.warn(`[Programações] Não foi possível atualizar remoção de arte no Firestore para evento ${ev.id}:`, err);
          }
        }

        // Limpa na memória do objeto
        ev.arteBase64 = '';
        ev.arteUrl = '';
      }
    }
  }
}

/**
 * Lê eventos locais garantindo a remoção de itens mock/fixos antigos
 */
function loadLocalEvents() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROG);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Remove eventos mock antigos que o usuário não conseguia excluir
        const cleaned = parsed.filter(
          (e) => !String(e.id || '').startsWith('fallback-') && e.id !== 'evento-dia-das-criancas-2026'
        );
        if (cleaned.length > 0) {
          return cleaned;
        }
      }
    }
  } catch (e) {
    console.warn('Erro ao ler cache de programações:', e);
  }
  return [];
}

function saveLocalEvents(list) {
  try {
    localStorage.setItem(STORAGE_KEY_PROG, JSON.stringify(list));
    localStorage.setItem(STORAGE_KEY_EVENTS_COMPAT, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('novaAuroraEventsUpdated', { detail: list }));
  } catch (e) {
    console.warn('Erro ao salvar cache de programações:', e);
  }
}

/**
 * Redimensiona e comprime imagem via HTML5 Canvas
 */
function compressImage(file, maxDimension = 960, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('Arquivo não é uma imagem válida.'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Erro ao carregar imagem'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Atualiza o Banner Hero parcial e as informações sobrepostas em degradê escuro.
 * Suporta múltiplos eventos no mesmo dia com deslizamento horizontal suave e dots.
 */
function updateHeroBanner(eventsForDay, targetDateISO = '') {
  if (!progHeroTrack) return;

  const rawList = Array.isArray(eventsForDay)
    ? eventsForDay
    : (eventsForDay ? [eventsForDay] : []);
  currentDayEvents = rawList.filter(Boolean);

  const iso = targetDateISO || (currentDayEvents[0] ? normalizeDateToISO(currentDayEvents[0].dataISO || currentDayEvents[0].data) : selectedDateISO);

  // Se não há eventos no dia selecionado
  if (currentDayEvents.length === 0) {
    currentActiveEvent = null;
    if (progHeroDotsIndicator) {
      progHeroDotsIndicator.style.display = 'none';
      progHeroDotsIndicator.innerHTML = '';
    }

    progHeroTrack.innerHTML = `
      <div class="prog-hero-slide is-empty-day">
        <div class="prog-hero-empty-backdrop"></div>
        <div class="prog-hero-overlay">
          <div class="prog-hero-info">
            <span class="prog-hero-title">Nenhuma programação neste dia</span>
            <span class="prog-hero-meta">${escapeHtml(formatISOTODateFull(iso))}</span>
          </div>
        </div>
      </div>
    `;
    return;
  }

  currentActiveEvent = currentDayEvents[0];

  // Configuração dos dots indicadores se houver 2 ou mais eventos
  if (progHeroDotsIndicator) {
    if (currentDayEvents.length > 1) {
      progHeroDotsIndicator.style.display = 'flex';
      progHeroDotsIndicator.innerHTML = currentDayEvents
        .map((_, idx) => `<span class="prog-hero-dot ${idx === 0 ? 'is-active' : ''}" data-dot-idx="${idx}"></span>`)
        .join('');
    } else {
      progHeroDotsIndicator.style.display = 'none';
      progHeroDotsIndicator.innerHTML = '';
    }
  }

  // Renderiza cada evento como um slide dentro do track
  progHeroTrack.innerHTML = currentDayEvents.map((ev, idx) => {
    const evIso = normalizeDateToISO(ev.dataISO || ev.data) || iso;
    const [y, m, d] = evIso.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const weekday = WEEKDAY_NAMES_FULL[dateObj.getDay()] || '';
    const dateFormatted = formatISOToBR(evIso);

    const metaParts = [];
    if (weekday && dateFormatted) metaParts.push(`${weekday}, ${dateFormatted}`);
    if (ev.horario) metaParts.push(ev.horario);
    if (ev.local) metaParts.push(ev.local);

    const imgSrc = ev.arteUrl || ev.arteBase64 || '';
    const hasArt = Boolean(imgSrc);
    const counterBadgeHtml = currentDayEvents.length > 1
      ? `<div class="prog-hero-slide-counter"><span>${idx + 1}/${currentDayEvents.length}</span></div>`
      : '';
    const zoomBadgeHtml = hasArt
      ? `<div class="prog-hero-zoom-badge">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            <line x1="11" y1="8" x2="11" y2="14"></line>
            <line x1="8" y1="11" x2="14" y2="11"></line>
          </svg>
          <span>Toque para ver</span>
        </div>`
      : '';
    const visualContentHtml = hasArt
      ? `<img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(ev.titulo || 'Arte da Programação')}" class="prog-hero-img" loading="lazy">`
      : `<div class="prog-hero-empty-backdrop prog-hero-text-backdrop"></div>`;

    return `
      <div class="prog-hero-slide ${hasArt ? 'has-art' : 'is-no-art'}" data-slide-index="${idx}" data-event-id="${escapeHtml(ev.id || '')}" data-has-art="${hasArt ? 'true' : 'false'}">
        ${visualContentHtml}
        ${counterBadgeHtml}
        ${zoomBadgeHtml}
        <div class="prog-hero-overlay">
          <div class="prog-hero-info">
            <span class="prog-hero-title">${escapeHtml(ev.titulo || 'Programação da Congregação')}</span>
            <span class="prog-hero-meta">${escapeHtml(metaParts.join(' • '))}</span>
          </div>
          <button type="button" class="btn-hero-edit" data-event-id="${escapeHtml(ev.id || '')}" aria-label="Editar programação" title="Editar Programação">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            <span>Editar</span>
          </button>
        </div>
      </div>
    `;
  }).join('');

  progHeroTrack.scrollLeft = 0;
}

/**
 * Renderiza o Calendário Geral de Programações
 * Dias com eventos ficam em LARANJA vibrante
 */
function renderEventsCalendar() {
  if (!progCalendarDays || !calMonthYearLabel) return;

  calMonthYearLabel.textContent = `${MONTH_NAMES[currentCalendarMonth]} ${currentCalendarYear}`;

  const firstDayOfMonth = new Date(currentCalendarYear, currentCalendarMonth, 1).getDay();
  const daysInMonth = new Date(currentCalendarYear, currentCalendarMonth + 1, 0).getDate();
  const todayISO = getTodayISO();

  let html = '';

  for (let i = 0; i < firstDayOfMonth; i++) {
    html += `<div class="cal-day cal-day-empty" aria-hidden="true"></div>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const iso = toISODateString(currentCalendarYear, currentCalendarMonth, day);
    const isToday = iso === todayISO;
    const isSelected = iso === selectedDateISO;

    const dayEvents = eventsList.filter((ev) => normalizeDateToISO(ev.dataISO || ev.data) === iso);
    const hasEvent = dayEvents.length > 0;

    let classes = ['cal-day'];
    if (isToday) classes.push('is-today');
    if (hasEvent) classes.push('is-event-day'); // Fica laranja!
    if (isSelected) classes.push('is-selected');

    let titleText = `${day} de ${MONTH_NAMES[currentCalendarMonth]}`;
    if (hasEvent) {
      const titles = dayEvents.map((e) => e.titulo).join(', ');
      titleText += ` • Programação: ${titles}`;
    }

    html += `
      <button
        type="button"
        class="${classes.join(' ')}"
        data-iso="${iso}"
        data-day="${day}"
        data-has-event="${hasEvent ? 'true' : 'false'}"
        title="${escapeHtml(titleText)}"
      >
        <span class="cal-day-number">${day}</span>
        ${hasEvent ? `<span class="cal-event-indicator" aria-hidden="true">${dayEvents.length > 1 ? dayEvents.length : ''}</span>` : ''}
      </button>
    `;
  }

  progCalendarDays.innerHTML = html;

  // Listeners de clique nos dias do calendário
  const dayButtons = progCalendarDays.querySelectorAll('.cal-day:not(.cal-day-empty)');
  dayButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const iso = btn.getAttribute('data-iso');
      selectedDateISO = iso;

      dayButtons.forEach((b) => b.classList.remove('is-selected'));
      btn.classList.add('is-selected');

      const dayEvents = eventsList.filter((ev) => normalizeDateToISO(ev.dataISO || ev.data) === iso);
      updateHeroBanner(dayEvents, iso);
    });
  });
}

/**
 * Preview da Arte em Tela Cheia no centro da tela com apenas um "X" para fechar.
 * Suporta deslizar para o lado para ver todas as artes de eventos agendados para aquele dia.
 */
function openArtPreview(eventsOrSrc, initialIndex = 0) {
  if (!modalArtPreview || !modalArtTrack) return;

  if (Array.isArray(eventsOrSrc)) {
    currentPreviewArts = eventsOrSrc
      .map((ev) => ({
        src: ev.arteUrl || ev.arteBase64 || '',
        title: ev.titulo || 'Arte da Programação'
      }))
      .filter((item) => Boolean(item.src));
  } else if (typeof eventsOrSrc === 'string' && eventsOrSrc.trim()) {
    currentPreviewArts = [{
      src: eventsOrSrc,
      title: 'Arte da Programação'
    }];
  } else {
    currentPreviewArts = [];
  }

  // Se o evento não possui arte cadastrada ou ela foi excluída, não abre modal vazio
  if (currentPreviewArts.length === 0) {
    return;
  }

  currentPreviewIndex = Math.max(0, Math.min(initialIndex, currentPreviewArts.length - 1));

  // Renderiza slides de arte no track
  modalArtTrack.innerHTML = currentPreviewArts.map((item, idx) => `
    <div class="modal-art-slide" data-art-index="${idx}">
      <img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.title)}" class="modal-art-slide-img" loading="lazy">
    </div>
  `).join('');

  // Configura barra de navegação se houver 2 ou mais artes
  if (modalArtNavBar && artCounterBadge) {
    if (currentPreviewArts.length > 1) {
      modalArtNavBar.style.display = 'flex';
      artCounterBadge.textContent = `${currentPreviewIndex + 1} / ${currentPreviewArts.length}`;
    } else {
      modalArtNavBar.style.display = 'none';
    }
  }

  modalArtPreview.classList.add('is-open', 'is-active');
  modalArtPreview.setAttribute('aria-hidden', 'false');

  // Ajusta a rolagem para a arte selecionada
  requestAnimationFrame(() => {
    if (modalArtTrack.clientWidth > 0) {
      modalArtTrack.scrollLeft = currentPreviewIndex * modalArtTrack.clientWidth;
    }
  });
}

function updateModalArtCounter() {
  if (!modalArtTrack || !artCounterBadge || currentPreviewArts.length <= 1) return;
  const width = modalArtTrack.clientWidth || 1;
  const idx = Math.min(Math.round(modalArtTrack.scrollLeft / width), currentPreviewArts.length - 1);
  currentPreviewIndex = Math.max(0, idx);
  artCounterBadge.textContent = `${currentPreviewIndex + 1} / ${currentPreviewArts.length}`;
}

function closeArtPreview() {
  if (!modalArtPreview) return;
  modalArtPreview.classList.remove('is-open', 'is-active');
  modalArtPreview.setAttribute('aria-hidden', 'true');
}

/**
 * Gerenciamento do Modal de Cadastro de Evento (Protegido por Senha de Membro)
 */
export function openAddEventModal(prefillDate = '') {
  requestMemberAccess(() => {
    if (!modalAddEvent) return;

    if (formAddEvent) formAddEvent.reset();
    currentUploadedArtBase64 = '';
    selectedRepeatDates.clear();

    if (artPreviewContainer) artPreviewContainer.style.display = 'none';
    if (artPreviewImg) artPreviewImg.src = '';
    if (artUploadBox) artUploadBox.style.display = 'flex';
    if (repeatSection) repeatSection.style.display = 'none';
    if (eventRepeatsToggle) eventRepeatsToggle.checked = false;

    const targetDate = prefillDate || selectedDateISO || '2026-10-17';
    if (inputEventDate) inputEventDate.value = targetDate;
    if (inputEventTime) inputEventTime.value = '19:30';
    if (inputEventLocation) inputEventLocation.value = 'Congregação Nova Aurora';

    const [y, m] = targetDate.split('-').map(Number);
    currentRepeatYear = y || 2026;
    currentRepeatMonth = (m - 1) || 9;

    renderRepeatCalendar();
    renderRepeatDatesBadges();

    modalAddEvent.classList.add('is-open', 'is-active');
    modalAddEvent.setAttribute('aria-hidden', 'false');

    if (inputEventTitle) {
      setTimeout(() => inputEventTitle.focus(), 150);
    }
  });
}

export function closeAddEventModal() {
  if (!modalAddEvent) return;
  modalAddEvent.classList.remove('is-open', 'is-active');
  modalAddEvent.setAttribute('aria-hidden', 'true');
}

/**
 * Mini Calendário de Seleção de Repetições
 */
function renderRepeatCalendar() {
  if (!repeatCalendarDays || !repeatCalMonthYear) return;

  repeatCalMonthYear.textContent = `${MONTH_NAMES[currentRepeatMonth]} ${currentRepeatYear}`;

  const firstDay = new Date(currentRepeatYear, currentRepeatMonth, 1).getDay();
  const totalDays = new Date(currentRepeatYear, currentRepeatMonth + 1, 0).getDate();
  const todayISO = getTodayISO();
  const baseDateISO = inputEventDate ? inputEventDate.value : '';

  let html = '';

  for (let i = 0; i < firstDay; i++) {
    html += `<div class="repeat-cal-day is-empty" aria-hidden="true"></div>`;
  }

  for (let day = 1; day <= totalDays; day++) {
    const iso = toISODateString(currentRepeatYear, currentRepeatMonth, day);
    const isToday = iso === todayISO;
    const isBaseDate = iso === baseDateISO;
    const isSelected = selectedRepeatDates.has(iso);

    let classes = ['repeat-cal-day'];
    if (isToday) classes.push('is-today');
    if (isBaseDate) classes.push('is-base-date');
    if (isSelected) classes.push('is-selected');

    html += `
      <button
        type="button"
        class="${classes.join(' ')}"
        data-iso="${iso}"
        ${isBaseDate ? 'title="Data principal da programação"' : 'title="Selecionar para repetir programação"'}
      >
        <span>${day}</span>
        ${isBaseDate ? '<span class="repeat-base-dot" title="Data principal">•</span>' : ''}
        ${isSelected ? '<span class="repeat-check-dot">✓</span>' : ''}
      </button>
    `;
  }

  repeatCalendarDays.innerHTML = html;

  const buttons = repeatCalendarDays.querySelectorAll('.repeat-cal-day:not(.is-empty)');
  buttons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const iso = btn.getAttribute('data-iso');
      if (iso === baseDateISO) {
        alert('Esta é a data principal da programação já incluída.');
        return;
      }
      if (selectedRepeatDates.has(iso)) {
        selectedRepeatDates.delete(iso);
      } else {
        selectedRepeatDates.add(iso);
      }
      renderRepeatCalendar();
      renderRepeatDatesBadges();
    });
  });
}

function renderRepeatDatesBadges() {
  if (!repeatDatesBadges) return;

  if (selectedRepeatDates.size === 0) {
    repeatDatesBadges.innerHTML = `<span class="repeat-none-text">Nenhuma data de repetição selecionada ainda. Toque nos dias acima.</span>`;
    return;
  }

  const sorted = Array.from(selectedRepeatDates).sort();
  let html = '';
  sorted.forEach((iso) => {
    html += `
      <span class="repeat-chip">
        <span>${formatISOToBR(iso)}</span>
        <button type="button" class="btn-remove-repeat-chip" data-iso="${iso}" aria-label="Remover data ${formatISOToBR(iso)}">✕</button>
      </span>
    `;
  });

  repeatDatesBadges.innerHTML = html;

  const removeBtns = repeatDatesBadges.querySelectorAll('.btn-remove-repeat-chip');
  removeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const iso = btn.getAttribute('data-iso');
      selectedRepeatDates.delete(iso);
      renderRepeatCalendar();
      renderRepeatDatesBadges();
    });
  });
}

/**
 * Salva a nova programação
 */
async function handleAddEventSubmit(e) {
  e.preventDefault();

  if (!isMemberAuthenticated()) {
    alert('Apenas membros autorizados podem cadastrar programações.');
    return;
  }

  const titulo = inputEventTitle ? inputEventTitle.value.trim() : '';
  const dataPrincipal = inputEventDate ? inputEventDate.value : '';
  const horario = inputEventTime ? inputEventTime.value.trim() : '';
  const local = inputEventLocation ? inputEventLocation.value.trim() : 'Congregação Nova Aurora';

  if (!titulo) {
    alert('Por favor, informe o nome do evento.');
    if (inputEventTitle) inputEventTitle.focus();
    return;
  }

  if (!dataPrincipal) {
    alert('Por favor, selecione a data do evento.');
    if (inputEventDate) inputEventDate.focus();
    return;
  }

  const btnSubmit = formAddEvent ? formAddEvent.querySelector('button[type="submit"]') : null;
  const originalText = btnSubmit ? btnSubmit.textContent : '';
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Salvando Programação...';
  }

  try {
    const allDates = [dataPrincipal, ...Array.from(selectedRepeatDates)];
    let savedFirstEvent = null;

    for (const dtISO of allDates) {
      const eventDocData = {
        titulo: titulo,
        nome: titulo,
        data: formatISOToBR(dtISO),
        dataISO: dtISO,
        horario: horario,
        local: local,
        arteBase64: currentUploadedArtBase64 || '',
        arteUrl: '',
        createdAt: serverTimestamp(),
        timestamp: Date.now()
      };

      try {
        const docRef = await addDoc(collection(db, 'programacoes'), eventDocData);
        const newEv = { id: docRef.id, ...eventDocData };
        eventsList.push(newEv);
        if (!savedFirstEvent) savedFirstEvent = newEv;
      } catch (err) {
        console.warn('Erro ao salvar no Firestore (usando modo offline):', err);
        const fallbackId = 'local-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
        const newEv = {
          id: fallbackId,
          ...eventDocData,
          createdAt: new Date().toISOString()
        };
        eventsList.push(newEv);
        if (!savedFirstEvent) savedFirstEvent = newEv;
      }
    }

    saveLocalEvents(eventsList);

    selectedDateISO = dataPrincipal;
    renderEventsCalendar();
    const dayEvents = eventsList.filter((ev) => normalizeDateToISO(ev.dataISO || ev.data) === dataPrincipal);
    updateHeroBanner(dayEvents.length > 0 ? dayEvents : (savedFirstEvent ? [savedFirstEvent] : []), dataPrincipal);

    closeAddEventModal();

    const totalSalvos = allDates.length;
    showNotification(
      totalSalvos > 1
        ? `Programação salva com sucesso em ${totalSalvos} datas!`
        : 'Programação salva com sucesso!'
    );

    window.dispatchEvent(new CustomEvent('novaAuroraEventsUpdated', { detail: eventsList }));

  } catch (err) {
    console.error('Erro ao salvar programação:', err);
    alert('Erro ao salvar programação: ' + (err.message || 'Tente novamente.'));
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = originalText;
    }
  }
}

/**
 * Modal de Edição de Evento (Protegido por senha de membro: cbna.membro)
 */
export function openEditEventModal(ev) {
  if (!modalEditEvent || !ev) return;

  currentEditingEvent = ev;
  currentEditArtBase64 = ev.arteBase64 || '';

  if (editEventId) editEventId.value = ev.id || '';
  if (editEventTitle) editEventTitle.value = ev.titulo || '';
  if (editEventDate) editEventDate.value = normalizeDateToISO(ev.dataISO || ev.data);
  if (editEventTime) editEventTime.value = ev.horario || '14:00';
  if (editEventLocation) editEventLocation.value = ev.local || 'Congregação Nova Aurora';

  const previewSrc = currentEditArtBase64 || ev.arteUrl || '';
  if (previewSrc) {
    if (editArtPreviewImg) editArtPreviewImg.src = previewSrc;
    if (editArtPreviewContainer) editArtPreviewContainer.style.display = 'block';
    if (editArtUploadBox) editArtUploadBox.style.display = 'none';
  } else {
    if (editArtPreviewContainer) editArtPreviewContainer.style.display = 'none';
    if (editArtUploadBox) editArtUploadBox.style.display = 'flex';
  }

  modalEditEvent.classList.add('is-open', 'is-active');
  modalEditEvent.setAttribute('aria-hidden', 'false');

  if (editEventTitle) {
    setTimeout(() => editEventTitle.focus(), 150);
  }
}

export function closeEditEventModal() {
  if (!modalEditEvent) return;
  modalEditEvent.classList.remove('is-open', 'is-active');
  modalEditEvent.setAttribute('aria-hidden', 'true');
  currentEditingEvent = null;
}

/**
 * Salva as alterações da programação editada
 */
async function handleEditEventSubmit(e) {
  e.preventDefault();
  if (!currentEditingEvent) return;

  if (!isMemberAuthenticated()) {
    alert('Apenas membros autorizados podem editar programações.');
    return;
  }

  const id = currentEditingEvent.id;
  const titulo = editEventTitle ? editEventTitle.value.trim() : '';
  const dataISO = editEventDate ? editEventDate.value : '';
  const horario = editEventTime ? editEventTime.value.trim() : '';
  const local = editEventLocation ? editEventLocation.value.trim() : 'Congregação Nova Aurora';

  if (!titulo || !dataISO) {
    alert('Preencha os campos obrigatórios (evento e data).');
    return;
  }

  const updatedData = {
    titulo: titulo,
    nome: titulo,
    data: formatISOToBR(dataISO),
    dataISO: dataISO,
    horario: horario,
    local: local,
    arteBase64: currentEditArtBase64 || '',
    arteUrl: currentEditArtBase64 ? '' : (currentEditingEvent.arteUrl || ''),
    updatedAt: serverTimestamp()
  };

  try {
    try {
      await updateDoc(doc(db, 'programacoes', id), updatedData);
    } catch (_) {}

    eventsList = eventsList.map((item) => {
      if (item.id === id) {
        return { ...item, ...updatedData };
      }
      return item;
    });
    saveLocalEvents(eventsList);

    const updatedEv = eventsList.find((item) => item.id === id) || { id, ...updatedData };
    selectedDateISO = dataISO;

    renderEventsCalendar();
    const dayEvents = eventsList.filter((ev) => normalizeDateToISO(ev.dataISO || ev.data) === dataISO);
    updateHeroBanner(dayEvents, dataISO);

    closeEditEventModal();
    showNotification('Programação atualizada com sucesso!');

    window.dispatchEvent(new CustomEvent('novaAuroraEventsUpdated', { detail: eventsList }));
  } catch (err) {
    console.error('Erro ao atualizar programação:', err);
    alert('Erro ao atualizar: ' + err.message);
  }
}

/**
 * Exclusão direta com mensagem de confirmação
 */
async function handleDeleteEventFromEdit() {
  if (!currentEditingEvent) return;

  if (!isMemberAuthenticated()) {
    alert('Apenas membros autorizados podem excluir programações.');
    return;
  }

  const evTitle = currentEditingEvent.titulo || 'esta programação';
  const confirmed = window.confirm(`Deseja realmente excluir "${evTitle}"? Esta ação é definitiva.`);
  if (!confirmed) return;

  const id = currentEditingEvent.id;

  try {
    try {
      await deleteDoc(doc(db, 'programacoes', id));
    } catch (_) {}

    eventsList = eventsList.filter((item) => item.id !== id);
    saveLocalEvents(eventsList);

    closeEditEventModal();

    renderEventsCalendar();
    const dayEvents = eventsList.filter((ev) => normalizeDateToISO(ev.dataISO || ev.data) === selectedDateISO);
    updateHeroBanner(dayEvents, selectedDateISO);

    showNotification('Programação excluída com sucesso.');

    window.dispatchEvent(new CustomEvent('novaAuroraEventsUpdated', { detail: eventsList }));
  } catch (err) {
    console.error('Erro ao excluir evento:', err);
    alert('Erro ao excluir programação: ' + err.message);
  }
}

function showNotification(msg) {
  const existing = document.getElementById('progToast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'progToast';
  toast.className = 'app-toast-alert';
  toast.textContent = msg;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add('is-visible'), 20);
  setTimeout(() => {
    toast.classList.remove('is-visible');
    setTimeout(() => toast.remove(), 400);
  }, 3200);
}

/**
 * Inscrição em tempo real no Firestore
 */
function subscribeToEvents() {
  try {
    onSnapshot(collection(db, 'programacoes'), async (snapshot) => {
      const items = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const iso = normalizeDateToISO(data.dataISO || data.data);
        if (iso) {
          items.push({
            id: docSnap.id,
            titulo: data.titulo || data.nome || 'Programação da Congregação',
            dataISO: iso,
            data: data.data || formatISOToBR(iso),
            horario: data.horario || '',
            local: data.local || '',
            arteBase64: data.arteBase64 || '',
            arteUrl: data.arteUrl || '',
            descricao: data.descricao || '',
            timestamp: data.timestamp || Date.now()
          });
        }
      });

      if (items.length > 0) {
        // Exclui a arte do banco e da memória caso a data do evento já tenha passado
        await cleanExpiredEventArts(items);

        eventsList = items;
        saveLocalEvents(items);
        renderEventsCalendar();
        if (selectedDateISO) {
          const evOnDate = eventsList.filter((e) => normalizeDateToISO(e.dataISO || e.data) === selectedDateISO);
          updateHeroBanner(evOnDate.length > 0 ? evOnDate : eventsList, selectedDateISO);
        }
      }
    }, (err) => {
      console.warn('Conexão offline para programações:', err);
    });
  } catch (e) {
    console.warn('Erro ao assinar Firestore programacoes:', e);
  }
}

export function openEventsScreen() {
  if (programacoesScreen) {
    programacoesScreen.classList.add('is-active');
    programacoesScreen.setAttribute('aria-hidden', 'false');

    const now = new Date();
    currentCalendarMonth = now.getMonth();
    currentCalendarYear = now.getFullYear();
    selectedDateISO = getTodayISO();

    renderEventsCalendar();

    const evOnDate = eventsList.filter((e) => normalizeDateToISO(e.dataISO || e.data) === selectedDateISO);
    updateHeroBanner(evOnDate.length > 0 ? evOnDate : (eventsList[0] ? [eventsList[0]] : []), selectedDateISO);
  }
}

export function closeEventsScreen() {
  if (programacoesScreen) {
    programacoesScreen.classList.remove('is-active');
    programacoesScreen.setAttribute('aria-hidden', 'true');
  }
}

/**
 * Inicialização do Módulo de Programações
 */
export function initEvents() {
  eventsList = loadLocalEvents();

  // Elementos da Tela
  programacoesScreen = document.getElementById('programacoesScreen');
  btnProgramacoesBack = document.getElementById('btnProgramacoesBack');
  btnAddEvent = document.getElementById('btnAddEvent');

  // Banner parcial com suporte a múltiplos eventos e deslizamento lateral
  progHeroWrap = document.getElementById('progHeroWrap');
  progHeroTrack = document.getElementById('progHeroTrack');
  progHeroDotsIndicator = document.getElementById('progHeroDotsIndicator');

  // Calendário
  calMonthYearLabel = document.getElementById('progCalMonthYear');
  btnProgCalPrev = document.getElementById('btnProgCalPrev');
  btnProgCalNext = document.getElementById('btnProgCalNext');
  progCalendarDays = document.getElementById('progCalendarDays');

  // Elementos do Modal de Adicionar
  modalAddEvent = document.getElementById('modalAddEvent');
  formAddEvent = document.getElementById('formAddEvent');
  btnCloseAddEvent = document.getElementById('btnCloseAddEvent');
  btnCancelAddEvent = document.getElementById('btnCancelAddEvent');
  inputEventTitle = document.getElementById('inputEventTitle');
  inputEventDate = document.getElementById('inputEventDate');
  inputEventTime = document.getElementById('inputEventTime');
  inputEventLocation = document.getElementById('inputEventLocation');
  inputEventArt = document.getElementById('inputEventArt');
  artUploadBox = document.getElementById('artUploadBox');
  artPreviewContainer = document.getElementById('artPreviewContainer');
  artPreviewImg = document.getElementById('artPreviewImg');
  btnRemoveArt = document.getElementById('btnRemoveArt');
  eventRepeatsToggle = document.getElementById('eventRepeatsToggle');
  repeatSection = document.getElementById('repeatSection');
  repeatCalMonthYear = document.getElementById('repeatCalMonthYear');
  btnRepeatCalPrev = document.getElementById('btnRepeatCalPrev');
  btnRepeatCalNext = document.getElementById('btnRepeatCalNext');
  repeatCalendarDays = document.getElementById('repeatCalendarDays');
  repeatDatesBadges = document.getElementById('repeatDatesBadges');

  // Elementos do Modal de Editar
  modalEditEvent = document.getElementById('modalEditEvent');
  formEditEvent = document.getElementById('formEditEvent');
  btnCloseEditEvent = document.getElementById('btnCloseEditEvent');
  btnCancelEditEvent = document.getElementById('btnCancelEditEvent');
  editEventId = document.getElementById('editEventId');
  editEventTitle = document.getElementById('editEventTitle');
  editEventDate = document.getElementById('editEventDate');
  editEventTime = document.getElementById('editEventTime');
  editEventLocation = document.getElementById('editEventLocation');
  editEventArtInput = document.getElementById('editEventArtInput');
  editArtUploadBox = document.getElementById('editArtUploadBox');
  editArtPreviewContainer = document.getElementById('editArtPreviewContainer');
  editArtPreviewImg = document.getElementById('editArtPreviewImg');
  btnEditRemoveArt = document.getElementById('btnEditRemoveArt');
  btnDeleteEventFromEdit = document.getElementById('btnDeleteEventFromEdit');

  // Modal Preview Arte (com suporte a deslizar entre as artes do dia)
  modalArtPreview = document.getElementById('modalArtPreview');
  modalArtTrack = document.getElementById('modalArtTrack');
  modalArtNavBar = document.getElementById('modalArtNavBar');
  btnArtPrev = document.getElementById('btnArtPrev');
  btnArtNext = document.getElementById('btnArtNext');
  artCounterBadge = document.getElementById('artCounterBadge');
  btnCloseArtPreview = document.getElementById('btnCloseArtPreview');

  // Listeners de Navegação da Tela
  if (btnProgramacoesBack) {
    btnProgramacoesBack.addEventListener('click', closeEventsScreen);
  }

  // Único botão de adicionar (topo da aba)
  if (btnAddEvent) {
    btnAddEvent.addEventListener('click', () => openAddEventModal());
  }

  // Interações no Banner Hero (deslize lateral, clique para ver arte e clique no botão editar)
  if (progHeroTrack) {
    progHeroTrack.addEventListener('click', (e) => {
      const editBtn = e.target.closest('.btn-hero-edit');
      if (editBtn) {
        e.stopPropagation();
        const evId = editBtn.getAttribute('data-event-id');
        const targetEvent = currentDayEvents.find((item) => item.id === evId) || currentActiveEvent || eventsList[0];
        if (targetEvent) {
          requestMemberAccess(() => {
            openEditEventModal(targetEvent);
          });
        }
        return;
      }

      const slide = e.target.closest('.prog-hero-slide');
      if (slide && !slide.classList.contains('is-empty-day') && slide.getAttribute('data-has-art') === 'true') {
        const slideIdx = parseInt(slide.getAttribute('data-slide-index') || '0', 10);
        openArtPreview(currentDayEvents, slideIdx);
      }
    });

    // Atualiza os dots indicadores ao deslizar horizontalmente
    progHeroTrack.addEventListener('scroll', () => {
      if (!progHeroDotsIndicator || currentDayEvents.length <= 1) return;
      const scrollLeft = progHeroTrack.scrollLeft;
      const width = progHeroTrack.clientWidth || 1;
      const activeIndex = Math.min(Math.round(scrollLeft / width), currentDayEvents.length - 1);
      const dots = progHeroDotsIndicator.querySelectorAll('.prog-hero-dot');
      dots.forEach((dot, i) => {
        dot.classList.toggle('is-active', i === activeIndex);
      });
    }, { passive: true });
  }

  // Navegação do Mês no Calendário Geral
  if (btnProgCalPrev) {
    btnProgCalPrev.addEventListener('click', () => {
      currentCalendarMonth--;
      if (currentCalendarMonth < 0) {
        currentCalendarMonth = 11;
        currentCalendarYear--;
      }
      renderEventsCalendar();
    });
  }

  if (btnProgCalNext) {
    btnProgCalNext.addEventListener('click', () => {
      currentCalendarMonth++;
      if (currentCalendarMonth > 11) {
        currentCalendarMonth = 0;
        currentCalendarYear++;
      }
      renderEventsCalendar();
    });
  }

  // Listeners do Modal Adicionar
  if (btnCloseAddEvent) {
    btnCloseAddEvent.addEventListener('click', closeAddEventModal);
  }
  if (btnCancelAddEvent) {
    btnCancelAddEvent.addEventListener('click', closeAddEventModal);
  }
  const overlayAdd = document.getElementById('overlayAddEvent');
  if (overlayAdd) {
    overlayAdd.addEventListener('click', closeAddEventModal);
  }
  if (formAddEvent) {
    formAddEvent.addEventListener('submit', handleAddEventSubmit);
  }

  // Upload e Compressão de Arte (Novo)
  if (inputEventArt) {
    inputEventArt.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      try {
        if (artUploadBox) artUploadBox.classList.add('is-uploading');
        const compressedBase64 = await compressImage(file, 960, 0.82);
        currentUploadedArtBase64 = compressedBase64;

        if (artPreviewImg) artPreviewImg.src = compressedBase64;
        if (artPreviewContainer) artPreviewContainer.style.display = 'block';
        if (artUploadBox) artUploadBox.style.display = 'none';
      } catch (err) {
        alert('Erro ao carregar imagem: ' + err.message);
      } finally {
        if (artUploadBox) artUploadBox.classList.remove('is-uploading');
      }
    });
  }

  if (btnRemoveArt) {
    btnRemoveArt.addEventListener('click', () => {
      currentUploadedArtBase64 = '';
      if (inputEventArt) inputEventArt.value = '';
      if (artPreviewContainer) artPreviewContainer.style.display = 'none';
      if (artPreviewImg) artPreviewImg.src = '';
      if (artUploadBox) artUploadBox.style.display = 'flex';
    });
  }

  // Toggle de Repetição
  if (eventRepeatsToggle) {
    eventRepeatsToggle.addEventListener('change', () => {
      if (repeatSection) {
        repeatSection.style.display = eventRepeatsToggle.checked ? 'block' : 'none';
        if (eventRepeatsToggle.checked) {
          renderRepeatCalendar();
          renderRepeatDatesBadges();
        }
      }
    });
  }

  if (btnRepeatCalPrev) {
    btnRepeatCalPrev.addEventListener('click', () => {
      currentRepeatMonth--;
      if (currentRepeatMonth < 0) {
        currentRepeatMonth = 11;
        currentRepeatYear--;
      }
      renderRepeatCalendar();
    });
  }

  if (btnRepeatCalNext) {
    btnRepeatCalNext.addEventListener('click', () => {
      currentRepeatMonth++;
      if (currentRepeatMonth > 11) {
        currentRepeatMonth = 0;
        currentRepeatYear++;
      }
      renderRepeatCalendar();
    });
  }

  // Listeners do Modal Editar
  if (btnCloseEditEvent) {
    btnCloseEditEvent.addEventListener('click', closeEditEventModal);
  }
  if (btnCancelEditEvent) {
    btnCancelEditEvent.addEventListener('click', closeEditEventModal);
  }
  const overlayEdit = document.getElementById('overlayEditEvent');
  if (overlayEdit) {
    overlayEdit.addEventListener('click', closeEditEventModal);
  }
  if (formEditEvent) {
    formEditEvent.addEventListener('submit', handleEditEventSubmit);
  }
  if (btnDeleteEventFromEdit) {
    btnDeleteEventFromEdit.addEventListener('click', handleDeleteEventFromEdit);
  }

  // Upload e Compressão de Arte (Edição)
  if (editEventArtInput) {
    editEventArtInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      try {
        if (editArtUploadBox) editArtUploadBox.classList.add('is-uploading');
        const compressedBase64 = await compressImage(file, 960, 0.82);
        currentEditArtBase64 = compressedBase64;

        if (editArtPreviewImg) editArtPreviewImg.src = compressedBase64;
        if (editArtPreviewContainer) editArtPreviewContainer.style.display = 'block';
        if (editArtUploadBox) editArtUploadBox.style.display = 'none';
      } catch (err) {
        alert('Erro ao carregar imagem: ' + err.message);
      } finally {
        if (editArtUploadBox) editArtUploadBox.classList.remove('is-uploading');
      }
    });
  }

  if (btnEditRemoveArt) {
    btnEditRemoveArt.addEventListener('click', () => {
      currentEditArtBase64 = '';
      if (editEventArtInput) editEventArtInput.value = '';
      if (editArtPreviewContainer) editArtPreviewContainer.style.display = 'none';
      if (editArtPreviewImg) editArtPreviewImg.src = '';
      if (editArtUploadBox) editArtUploadBox.style.display = 'flex';
    });
  }

  // Preview de Arte (Fechar no 'X' ou overlay)
  if (btnCloseArtPreview) {
    btnCloseArtPreview.addEventListener('click', closeArtPreview);
  }
  const overlayArt = document.getElementById('overlayArtPreview');
  if (overlayArt) {
    overlayArt.addEventListener('click', closeArtPreview);
  }

  // Navegação entre artes do dia no modal
  if (btnArtPrev && modalArtTrack) {
    btnArtPrev.addEventListener('click', (e) => {
      e.stopPropagation();
      modalArtTrack.scrollBy({ left: -modalArtTrack.clientWidth, behavior: 'smooth' });
    });
  }

  if (btnArtNext && modalArtTrack) {
    btnArtNext.addEventListener('click', (e) => {
      e.stopPropagation();
      modalArtTrack.scrollBy({ left: modalArtTrack.clientWidth, behavior: 'smooth' });
    });
  }

  if (modalArtTrack) {
    modalArtTrack.addEventListener('scroll', updateModalArtCounter, { passive: true });
  }

  // Inicia exibição com os eventos do dia inicial
  const initialDayEvents = eventsList.filter((e) => normalizeDateToISO(e.dataISO || e.data) === selectedDateISO);
  updateHeroBanner(initialDayEvents.length > 0 ? initialDayEvents : (eventsList[0] ? [eventsList[0]] : []), selectedDateISO);
  renderEventsCalendar();

  // Executa verificação inicial de artes expiradas também no cache local
  cleanExpiredEventArts(eventsList).then(() => {
    saveLocalEvents(eventsList);
  }).catch(() => {});

  subscribeToEvents();
}
