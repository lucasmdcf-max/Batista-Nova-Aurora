/**
 * Gestão de Programações e Eventos — Congregação Batista Nova Aurora
 * - Carrossel com artes dos eventos programados para a semana em curso (swipe horizontal)
 * - Calendário geral com destaque laranja nos dias com programação
 * - Exibição de detalhes da programação e banner ao clicar na data
 * - Modal discreto para adicionar evento: evento, data, horário, local, arte (upload), repetição em calendário
 * - Sincronização em tempo real via Cloud Firestore e suporte Offline (localStorage)
 * - Integração automática com o calendário de solicitação de visitas
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

const STORAGE_KEY_PROG = 'nova_aurora_programacoes_v1';
const STORAGE_KEY_EVENTS_COMPAT = 'nova_aurora_eventos_v1';
const ADMIN_PASSWORD = 'CBNA.adm';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const WEEKDAY_NAMES_FULL = [
  'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
  'Quinta-feira', 'Sexta-feira', 'Sábado'
];

// Fallback inicial para apresentação visual imediata
function getInitialFallbackEvents() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const dow = now.getDay();

  // Calcula datas próximas da semana para cultos regulares
  const sundayDiff = (7 - dow) % 7;
  const thursdayDiff = (4 - dow + 7) % 7;
  const saturdayDiff = (6 - dow + 7) % 7;

  const dSunday = new Date(y, m, d + sundayDiff);
  const dThursday = new Date(y, m, d + thursdayDiff);
  const dSaturday = new Date(y, m, d + saturdayDiff);

  const fmt = (dt) => {
    const yr = dt.getFullYear();
    const mo = String(dt.getMonth() + 1).padStart(2, '0');
    const da = String(dt.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${da}`;
  };

  return [
    {
      id: 'fallback-culto-dom',
      titulo: 'Culto de Celebração & Ceia do Senhor',
      dataISO: fmt(dSunday),
      horario: '18:30',
      local: 'Templo Nova Aurora',
      arteBase64: '',
      descricao: 'Momento de adoração, comunhão e mensagem edificante para toda a família.',
      isFallback: true
    },
    {
      id: 'fallback-culto-qui',
      titulo: 'Culto de Doutrina & Oração',
      dataISO: fmt(dThursday),
      horario: '19:30',
      local: 'Templo Nova Aurora',
      arteBase64: '',
      descricao: 'Estudo aprofundado da Palavra de Deus e intercessão pela igreja e famílias.',
      isFallback: true
    },
    {
      id: 'fallback-jovens-sab',
      titulo: 'Encontro da Juventude Conectados',
      dataISO: fmt(dSaturday),
      horario: '19:30',
      local: 'Templo Nova Aurora',
      arteBase64: '',
      descricao: 'Louvor, dinâmicas e compartilhamento especial com os jovens.',
      isFallback: true
    }
  ];
}

let eventsList = [];
let currentCalendarMonth = new Date().getMonth();
let currentCalendarYear = new Date().getFullYear();
let selectedDateISO = '';

// Variáveis do Modal de Adicionar Evento
let currentRepeatMonth = new Date().getMonth();
let currentRepeatYear = new Date().getFullYear();
let selectedRepeatDates = new Set();
let currentUploadedArtBase64 = '';

// Elementos DOM
let programacoesScreen = null;
let btnProgramacoesBack = null;
let btnAddEvent = null;
let carouselTrack = null;
let carouselDots = null;
let carouselEmptyNotice = null;
let carouselHeaderSubtitle = null;

let calMonthYearLabel = null;
let btnProgCalPrev = null;
let btnProgCalNext = null;
let progCalendarDays = null;
let eventDayDetailsContainer = null;

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

// Modal Preview Arte
let modalArtPreview = null;
let modalArtPreviewImg = null;
let modalArtPreviewTitle = null;
let btnCloseArtPreview = null;

// Modal Confirmação Exclusão
let modalDeleteEvent = null;
let btnConfirmDeleteEvent = null;
let btnCancelDeleteEvent = null;
let btnCloseDeleteEvent = null;
let deleteEventErrorMsg = null;
let adminDeleteEventPassword = null;
let pendingDeleteEventId = null;

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
 * Retorna o intervalo da semana em curso (de Domingo a Sábado)
 */
function getCurrentWeekRange() {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Domingo, 6 = Sábado
  
  // Domingo como primeiro dia da semana
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
  // Sábado como último dia da semana
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (6 - dayOfWeek));

  const startISO = toISODateString(start.getFullYear(), start.getMonth(), start.getDate());
  const endISO = toISODateString(end.getFullYear(), end.getMonth(), end.getDate());

  return {
    start,
    end,
    startISO,
    endISO,
    label: `${start.getDate()} a ${end.getDate()} de ${MONTH_NAMES[end.getMonth()]}`
  };
}

function loadLocalEvents() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROG);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn('Erro ao ler cache de programações:', e);
  }
  return getInitialFallbackEvents();
}

function saveLocalEvents(list) {
  try {
    localStorage.setItem(STORAGE_KEY_PROG, JSON.stringify(list));
    // Sincroniza também a chave de compatibilidade usada no visits.js
    localStorage.setItem(STORAGE_KEY_EVENTS_COMPAT, JSON.stringify(list));
    // Notifica outros módulos no app
    window.dispatchEvent(new CustomEvent('novaAuroraEventsUpdated', { detail: list }));
  } catch (e) {
    console.warn('Erro ao salvar cache de programações:', e);
  }
}

/**
 * Redimensiona e comprime imagem via HTML5 Canvas para salvar de forma leve no Firestore e LocalStorage
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
 * Renderiza o Carrossel com as Artes dos Eventos da Semana em Curso
 */
function renderWeekCarousel() {
  if (!carouselTrack) return;

  const week = getCurrentWeekRange();
  if (carouselHeaderSubtitle) {
    carouselHeaderSubtitle.textContent = `Semana de ${week.label}`;
  }

  // Filtra eventos da semana em curso
  const weekEvents = eventsList
    .filter((ev) => {
      const iso = normalizeDateToISO(ev.dataISO || ev.data);
      return iso >= week.startISO && iso <= week.endISO;
    })
    .sort((a, b) => {
      const isoA = normalizeDateToISO(a.dataISO || a.data);
      const isoB = normalizeDateToISO(b.dataISO || b.data);
      if (isoA !== isoB) return isoA.localeCompare(isoB);
      return (a.horario || '').localeCompare(b.horario || '');
    });

  if (weekEvents.length === 0) {
    carouselTrack.innerHTML = `
      <div class="carousel-slide-empty">
        <div class="empty-icon-wrap">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#ff9900" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
        </div>
        <h4 class="empty-title">Nenhuma arte de evento nesta semana</h4>
        <p class="empty-desc">Toque em <strong>+ Adicionar</strong> acima para cadastrar a programação da congregação.</p>
      </div>
    `;
    if (carouselDots) carouselDots.innerHTML = '';
    return;
  }

  let htmlSlides = '';
  weekEvents.forEach((ev, idx) => {
    const iso = normalizeDateToISO(ev.dataISO || ev.data);
    const dateFormatted = formatISOToBR(iso);
    const [y, m, d] = iso.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const weekday = WEEKDAY_NAMES_FULL[dateObj.getDay()] || '';
    const artSrc = ev.arteBase64 || ev.arteUrl || '';

    htmlSlides += `
      <div class="carousel-slide-card" data-event-id="${escapeHtml(ev.id)}" data-slide-index="${idx}">
        ${
          artSrc
            ? `<div class="slide-art-wrap" title="Toque para ampliar a arte">
                <img src="${artSrc}" alt="${escapeHtml(ev.titulo)}" class="slide-art-img" loading="lazy" />
                <div class="slide-art-zoom-badge">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    <line x1="11" y1="8" x2="11" y2="14"></line>
                    <line x1="8" y1="11" x2="14" y2="11"></line>
                  </svg>
                  <span>Ver arte</span>
                </div>
              </div>`
            : `<div class="slide-art-placeholder">
                <div class="art-ph-glow"></div>
                <img src="FUNDO APP/Logo branca - Nova Aurora_transparente.png?v=7" alt="Logo Nova Aurora" class="art-ph-logo" />
                <span class="art-ph-badge">CONGREGAÇÃO NOVA AURORA</span>
              </div>`
        }

        <div class="slide-info-overlay">
          <div class="slide-badge-row">
            <span class="slide-pill-date">${weekday}, ${dateFormatted}</span>
            ${ev.horario ? `<span class="slide-pill-time">${escapeHtml(ev.horario)}</span>` : ''}
          </div>
          <h3 class="slide-event-title">${escapeHtml(ev.titulo)}</h3>
          ${ev.local ? `<p class="slide-event-location">📍 ${escapeHtml(ev.local)}</p>` : ''}
        </div>
      </div>
    `;
  });

  carouselTrack.innerHTML = htmlSlides;

  // Renderiza bolinhas indicadoras
  if (carouselDots) {
    let dotsHtml = '';
    for (let i = 0; i < weekEvents.length; i++) {
      dotsHtml += `<button type="button" class="carousel-dot ${i === 0 ? 'is-active' : ''}" data-index="${i}" aria-label="Ir para arte ${i + 1}"></button>`;
    }
    carouselDots.innerHTML = dotsHtml;

    // Listeners nas bolinhas
    const dots = carouselDots.querySelectorAll('.carousel-dot');
    dots.forEach((dot) => {
      dot.addEventListener('click', () => {
        const idx = Number(dot.getAttribute('data-index'));
        const slides = carouselTrack.querySelectorAll('.carousel-slide-card');
        if (slides[idx]) {
          slides[idx].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
      });
    });
  }

  // Atualiza bolinhas ao deslizar
  carouselTrack.onscroll = () => {
    const scrollLeft = carouselTrack.scrollLeft;
    const slideWidth = carouselTrack.clientWidth;
    if (slideWidth <= 0) return;
    const activeIndex = Math.round(scrollLeft / slideWidth);

    if (carouselDots) {
      const dots = carouselDots.querySelectorAll('.carousel-dot');
      dots.forEach((dot, idx) => {
        if (idx === activeIndex) {
          dot.classList.add('is-active');
        } else {
          dot.classList.remove('is-active');
        }
      });
    }
  };

  // Ao clicar na arte do carrossel, se tiver arte abre o preview em tela cheia, senão rola até os detalhes daquele dia
  const slideCards = carouselTrack.querySelectorAll('.carousel-slide-card');
  slideCards.forEach((card) => {
    card.addEventListener('click', (e) => {
      const evId = card.getAttribute('data-event-id');
      const ev = eventsList.find((item) => item.id === evId);
      if (!ev) return;

      const artSrc = ev.arteBase64 || ev.arteUrl || '';
      const clickedArt = e.target.closest('.slide-art-wrap') || e.target.closest('.slide-art-img');

      if (artSrc && (clickedArt || e.target.closest('.slide-art-zoom-badge'))) {
        openArtPreview(artSrc, ev.titulo);
      } else {
        // Seleciona o dia no calendário e exibe seus detalhes
        const iso = normalizeDateToISO(ev.dataISO || ev.data);
        if (iso) {
          const [y, m, d] = iso.split('-').map(Number);
          currentCalendarMonth = m - 1;
          currentCalendarYear = y;
          selectedDateISO = iso;
          renderEventsCalendar();
          renderDayDetails(iso);
          // Rola suavemente até o calendário
          const calBox = document.getElementById('progCalendarBox');
          if (calBox) {
            calBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
      }
    });
  });
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

  // Dias em branco antes do início do mês
  for (let i = 0; i < firstDayOfMonth; i++) {
    html += `<div class="cal-day cal-day-empty" aria-hidden="true"></div>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const iso = toISODateString(currentCalendarYear, currentCalendarMonth, day);
    const isToday = iso === todayISO;
    const isSelected = iso === selectedDateISO;

    // Verifica se existem programações neste dia
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

      // Atualiza visual selecionado
      dayButtons.forEach((b) => b.classList.remove('is-selected'));
      btn.classList.add('is-selected');

      renderDayDetails(iso);
    });
  });
}

/**
 * Renderiza os detalhes da programação do dia clicado logo abaixo do calendário
 */
function renderDayDetails(iso) {
  if (!eventDayDetailsContainer) return;

  if (!iso) {
    eventDayDetailsContainer.innerHTML = '';
    eventDayDetailsContainer.style.display = 'none';
    return;
  }

  const dayEvents = eventsList.filter((ev) => normalizeDateToISO(ev.dataISO || ev.data) === iso);
  const formattedDateFull = formatISOTODateFull(iso);

  eventDayDetailsContainer.style.display = 'block';

  if (dayEvents.length === 0) {
    eventDayDetailsContainer.innerHTML = `
      <div class="event-details-card">
        <div class="details-header">
          <span class="details-date-title">📅 ${formattedDateFull}</span>
        </div>
        <p class="details-empty-msg">Nenhuma programação cadastrada para este dia.</p>
        <div class="details-quick-add">
          <button type="button" class="btn-quick-add-prog" id="btnQuickAddProg">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>Adicionar Programação neste dia</span>
          </button>
        </div>
      </div>
    `;

    const btnQuick = eventDayDetailsContainer.querySelector('#btnQuickAddProg');
    if (btnQuick) {
      btnQuick.addEventListener('click', () => openAddEventModal(iso));
    }
    return;
  }

  let eventsHtml = '';
  dayEvents.forEach((ev) => {
    const artSrc = ev.arteBase64 || ev.arteUrl || '';
    eventsHtml += `
      <div class="day-event-item" data-id="${escapeHtml(ev.id)}">
        ${
          artSrc
            ? `<div class="day-event-art-thumb" title="Toque para ampliar arte">
                <img src="${artSrc}" alt="${escapeHtml(ev.titulo)}" class="day-event-art-img" />
                <span class="thumb-zoom-icon">🔍</span>
              </div>`
            : ''
        }
        <div class="day-event-info">
          <div class="day-event-badge-row">
            <span class="day-event-badge-highlight">Programação Oficial</span>
            ${ev.horario ? `<span class="day-event-badge-time">⏰ ${escapeHtml(ev.horario)}</span>` : ''}
          </div>
          <h4 class="day-event-title">${escapeHtml(ev.titulo)}</h4>
          ${ev.local ? `<p class="day-event-location">📍 ${escapeHtml(ev.local)}</p>` : ''}
          ${ev.descricao ? `<p class="day-event-desc">${escapeHtml(ev.descricao)}</p>` : ''}
        </div>
        <button type="button" class="btn-delete-event-item" data-id="${escapeHtml(ev.id)}" title="Excluir esta programação" aria-label="Excluir programação">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    `;
  });

  eventDayDetailsContainer.innerHTML = `
    <div class="event-details-card">
      <div class="details-header">
        <div class="details-header-badge">
          <span class="details-dot-orange"></span>
          <span>PROGRAMAÇÕES DO DIA</span>
        </div>
        <span class="details-date-title">${formattedDateFull}</span>
      </div>
      <div class="day-events-list">
        ${eventsHtml}
      </div>
      <div class="details-quick-add" style="margin-top: 10px;">
        <button type="button" class="btn-quick-add-prog" id="btnQuickAddProg">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span>Adicionar Outra Programação</span>
        </button>
      </div>
    </div>
  `;

  // Listener para ampliar a imagem
  const artThumbs = eventDayDetailsContainer.querySelectorAll('.day-event-art-thumb');
  artThumbs.forEach((thumb) => {
    thumb.addEventListener('click', () => {
      const img = thumb.querySelector('img');
      if (img && img.src) {
        const titleEl = thumb.closest('.day-event-item').querySelector('.day-event-title');
        openArtPreview(img.src, titleEl ? titleEl.textContent : 'Arte da Programação');
      }
    });
  });

  // Listener para excluir
  const delButtons = eventDayDetailsContainer.querySelectorAll('.btn-delete-event-item');
  delButtons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      requestDeleteEvent(id);
    });
  });

  const btnQuick = eventDayDetailsContainer.querySelector('#btnQuickAddProg');
  if (btnQuick) {
    btnQuick.addEventListener('click', () => openAddEventModal(iso));
  }
}

/**
 * Preview da Arte em Modal Grande
 */
function openArtPreview(imageSrc, title = '') {
  if (!modalArtPreview || !modalArtPreviewImg) return;
  modalArtPreviewImg.src = imageSrc;
  if (modalArtPreviewTitle) {
    modalArtPreviewTitle.textContent = title || 'Arte da Programação';
  }
  modalArtPreview.classList.add('is-active');
  modalArtPreview.setAttribute('aria-hidden', 'false');
}

function closeArtPreview() {
  if (!modalArtPreview) return;
  modalArtPreview.classList.remove('is-active');
  modalArtPreview.setAttribute('aria-hidden', 'true');
  if (modalArtPreviewImg) modalArtPreviewImg.src = '';
}

/**
 * Gerenciamento do Modal de Cadastro de Evento
 */
export function openAddEventModal(prefillDate = '') {
  if (!modalAddEvent) return;

  // Reset do formulário
  if (formAddEvent) formAddEvent.reset();
  currentUploadedArtBase64 = '';
  selectedRepeatDates.clear();

  if (artPreviewContainer) artPreviewContainer.style.display = 'none';
  if (artPreviewImg) artPreviewImg.src = '';
  if (artUploadBox) artUploadBox.style.display = 'flex';
  if (repeatSection) repeatSection.style.display = 'none';
  if (eventRepeatsToggle) eventRepeatsToggle.checked = false;

  // Preenchimento de campos padrão
  const targetDate = prefillDate || selectedDateISO || getTodayISO();
  if (inputEventDate) inputEventDate.value = targetDate;
  if (inputEventTime) inputEventTime.value = '19:30';
  if (inputEventLocation) inputEventLocation.value = 'Templo Nova Aurora';

  // Configura o mês do mini calendário de repetição baseado na data selecionada
  const [y, m] = targetDate.split('-').map(Number);
  currentRepeatYear = y || new Date().getFullYear();
  currentRepeatMonth = (m - 1) || new Date().getMonth();

  renderRepeatCalendar();
  renderRepeatDatesBadges();

  modalAddEvent.classList.add('is-active');
  modalAddEvent.setAttribute('aria-hidden', 'false');

  if (inputEventTitle) {
    setTimeout(() => inputEventTitle.focus(), 150);
  }
}

export function closeAddEventModal() {
  if (!modalAddEvent) return;
  modalAddEvent.classList.remove('is-active');
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

  // Listeners
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
 * Salva a nova programação (data principal + repetições)
 */
async function handleAddEventSubmit(e) {
  e.preventDefault();

  const titulo = inputEventTitle ? inputEventTitle.value.trim() : '';
  const dataPrincipal = inputEventDate ? inputEventDate.value : '';
  const horario = inputEventTime ? inputEventTime.value.trim() : '';
  const local = inputEventLocation ? inputEventLocation.value.trim() : 'Templo Nova Aurora';

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
    const savedIds = [];

    for (const dtISO of allDates) {
      const eventDocData = {
        titulo: titulo,
        nome: titulo,
        data: formatISOToBR(dtISO),
        dataISO: dtISO,
        horario: horario,
        local: local,
        arteBase64: currentUploadedArtBase64 || '',
        createdAt: serverTimestamp(),
        timestamp: Date.now()
      };

      try {
        const docRef = await addDoc(collection(db, 'programacoes'), eventDocData);
        savedIds.push(docRef.id);
      } catch (err) {
        console.warn('Erro ao salvar no Firestore (usando modo offline):', err);
        const fallbackId = 'local-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
        eventsList.push({
          id: fallbackId,
          ...eventDocData,
          createdAt: new Date().toISOString()
        });
        savedIds.push(fallbackId);
      }
    }

    saveLocalEvents(eventsList);

    // Atualiza visual
    selectedDateISO = dataPrincipal;
    renderWeekCarousel();
    renderEventsCalendar();
    renderDayDetails(dataPrincipal);

    closeAddEventModal();

    // Notifica usuário
    const totalSalvos = allDates.length;
    showNotification(
      totalSalvos > 1
        ? `Programação salva com sucesso em ${totalSalvos} datas!`
        : 'Programação salva com sucesso!'
    );

    // Garante que o agendamento de visitas atualize o bloqueio de horário
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
 * Solicitação e exclusão de eventos com segurança
 */
function requestDeleteEvent(id) {
  pendingDeleteEventId = id;
  if (!modalDeleteEvent) {
    if (confirm('Tem certeza que deseja excluir esta programação?')) {
      executeDeleteEvent(id);
    }
    return;
  }

  if (adminDeleteEventPassword) adminDeleteEventPassword.value = '';
  if (deleteEventErrorMsg) deleteEventErrorMsg.style.display = 'none';

  modalDeleteEvent.classList.add('is-active');
  modalDeleteEvent.setAttribute('aria-hidden', 'false');

  if (adminDeleteEventPassword) {
    setTimeout(() => adminDeleteEventPassword.focus(), 150);
  }
}

function closeDeleteEventModal() {
  if (!modalDeleteEvent) return;
  modalDeleteEvent.classList.remove('is-active');
  modalDeleteEvent.setAttribute('aria-hidden', 'true');
  pendingDeleteEventId = null;
}

async function executeDeleteEvent(id) {
  if (!id) return;

  try {
    // 1. Tenta deletar no Firestore
    try {
      await deleteDoc(doc(db, 'programacoes', id));
    } catch (_) {}

    // 2. Remove do cache local
    eventsList = eventsList.filter((item) => item.id !== id);
    saveLocalEvents(eventsList);

    // 3. Atualiza UI
    renderWeekCarousel();
    renderEventsCalendar();
    if (selectedDateISO) {
      renderDayDetails(selectedDateISO);
    }

    closeDeleteEventModal();
    showNotification('Programação removida com sucesso.');

    // Notifica visits.js
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
    onSnapshot(collection(db, 'programacoes'), (snapshot) => {
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
            arteBase64: data.arteBase64 || data.arteUrl || '',
            descricao: data.descricao || '',
            timestamp: data.timestamp || Date.now()
          });
        }
      });

      if (items.length > 0) {
        eventsList = items;
        saveLocalEvents(items);
        renderWeekCarousel();
        renderEventsCalendar();
        if (selectedDateISO) {
          renderDayDetails(selectedDateISO);
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

    renderWeekCarousel();
    renderEventsCalendar();

    // Se ainda não houver dia selecionado, seleciona o dia de hoje
    if (!selectedDateISO) {
      selectedDateISO = getTodayISO();
      renderDayDetails(selectedDateISO);
    }
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
  carouselTrack = document.getElementById('carouselTrack');
  carouselDots = document.getElementById('carouselDots');
  carouselHeaderSubtitle = document.getElementById('carouselHeaderSubtitle');

  calMonthYearLabel = document.getElementById('progCalMonthYear');
  btnProgCalPrev = document.getElementById('btnProgCalPrev');
  btnProgCalNext = document.getElementById('btnProgCalNext');
  progCalendarDays = document.getElementById('progCalendarDays');
  eventDayDetailsContainer = document.getElementById('eventDayDetailsContainer');

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

  // Modal Preview Arte
  modalArtPreview = document.getElementById('modalArtPreview');
  modalArtPreviewImg = document.getElementById('modalArtPreviewImg');
  modalArtPreviewTitle = document.getElementById('modalArtPreviewTitle');
  btnCloseArtPreview = document.getElementById('btnCloseArtPreview');

  // Modal Exclusão
  modalDeleteEvent = document.getElementById('modalDeleteEvent');
  btnConfirmDeleteEvent = document.getElementById('btnConfirmDeleteEvent');
  btnCancelDeleteEvent = document.getElementById('btnCancelDeleteEvent');
  btnCloseDeleteEvent = document.getElementById('btnCloseDeleteEvent');
  deleteEventErrorMsg = document.getElementById('deleteEventErrorMsg');
  adminDeleteEventPassword = document.getElementById('adminDeleteEventPassword');

  // Listeners de Navegação da Tela
  if (btnProgramacoesBack) {
    btnProgramacoesBack.addEventListener('click', closeEventsScreen);
  }

  if (btnAddEvent) {
    btnAddEvent.addEventListener('click', () => openAddEventModal());
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

  // Upload e Compressão de Arte
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

  // Navegação no mini calendário de repetição
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

  // Preview de Arte
  if (btnCloseArtPreview) {
    btnCloseArtPreview.addEventListener('click', closeArtPreview);
  }
  const overlayArt = document.getElementById('overlayArtPreview');
  if (overlayArt) {
    overlayArt.addEventListener('click', closeArtPreview);
  }

  // Exclusão com Senha de Admin
  if (btnCloseDeleteEvent) {
    btnCloseDeleteEvent.addEventListener('click', closeDeleteEventModal);
  }
  if (btnCancelDeleteEvent) {
    btnCancelDeleteEvent.addEventListener('click', closeDeleteEventModal);
  }
  const overlayDelete = document.getElementById('overlayDeleteEvent');
  if (overlayDelete) {
    overlayDelete.addEventListener('click', closeDeleteEventModal);
  }

  if (btnConfirmDeleteEvent) {
    btnConfirmDeleteEvent.addEventListener('click', () => {
      const pwd = adminDeleteEventPassword ? adminDeleteEventPassword.value.trim() : '';
      if (pwd === ADMIN_PASSWORD) {
        executeDeleteEvent(pendingDeleteEventId);
      } else {
        if (deleteEventErrorMsg) deleteEventErrorMsg.style.display = 'block';
      }
    });
  }

  // Inicia carregamento
  renderWeekCarousel();
  renderEventsCalendar();
  subscribeToEvents();
}
