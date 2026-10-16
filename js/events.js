/**
 * Gestão de Programações e Eventos — Congregação Batista Nova Aurora
 * - Carrossel com artes dos eventos programados para a semana em curso (swipe horizontal)
 * - Título limpo: "Eventos da semana"
 * - Barra de informações resumidas em 2 linhas entre as artes e o calendário com botão de Editar
 * - Calendário geral com destaque laranja nos dias com programação
 * - Ao clicar na data, a arte e informações aparecem no slide do topo e na barra de 2 linhas
 * - Nada abaixo do calendário
 * - Edição protegida por senha de membro (cbna.membro)
 * - Opção de excluir evento dentro do modal de edição com mensagem de confirmação
 * - Botão de adicionar apenas no topo da aba
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

import { requestMemberAccess } from './visitors.js';

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

// Fallback inicial para apresentação visual imediata
function getInitialFallbackEvents() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const dow = now.getDay();

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
let currentActiveEvent = null;
let currentEditingEvent = null;

// Variáveis do Modal de Adicionar Evento
let currentRepeatMonth = new Date().getMonth();
let currentRepeatYear = new Date().getFullYear();
let selectedRepeatDates = new Set();
let currentUploadedArtBase64 = '';
let currentEditArtBase64 = '';

// Elementos DOM
let programacoesScreen = null;
let btnProgramacoesBack = null;
let btnAddEvent = null;
let carouselTrack = null;
let carouselDots = null;

// Barra de Informações Resumidas (2 Linhas)
let eventSummaryBar = null;
let summaryEventTitle = null;
let summaryEventMeta = null;
let btnSummaryEdit = null;

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

// Modal Preview Arte
let modalArtPreview = null;
let modalArtPreviewImg = null;
let modalArtPreviewTitle = null;
let btnCloseArtPreview = null;

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
  
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (6 - dayOfWeek));

  const startISO = toISODateString(start.getFullYear(), start.getMonth(), start.getDate());
  const endISO = toISODateString(end.getFullYear(), end.getMonth(), end.getDate());

  return {
    start,
    end,
    startISO,
    endISO
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
 * Atualiza a barra de informações do evento em 2 linhas
 * Linha 1: Nome do Evento
 * Linha 2: Data, Horário e Local
 * Ao lado: Botão de Editar
 */
function updateSummaryBar(ev, targetDateISO = '') {
  if (!summaryEventTitle || !summaryEventMeta) return;

  if (ev) {
    currentActiveEvent = ev;
    const iso = normalizeDateToISO(ev.dataISO || ev.data);
    const [y, m, d] = (iso || targetDateISO).split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const weekday = WEEKDAY_NAMES_FULL[dateObj.getDay()] || '';
    const dateFormatted = formatISOToBR(iso || targetDateISO);

    summaryEventTitle.textContent = ev.titulo || 'Programação da Congregação';

    const metaParts = [];
    if (weekday && dateFormatted) metaParts.push(`${weekday}, ${dateFormatted}`);
    if (ev.horario) metaParts.push(ev.horario);
    if (ev.local) metaParts.push(ev.local);

    summaryEventMeta.textContent = metaParts.join(' • ');

    if (btnSummaryEdit) {
      btnSummaryEdit.style.display = 'inline-flex';
    }
  } else if (targetDateISO) {
    currentActiveEvent = null;
    summaryEventTitle.textContent = 'Nenhuma programação para este dia';
    summaryEventMeta.textContent = formatISOTODateFull(targetDateISO);
    if (btnSummaryEdit) {
      btnSummaryEdit.style.display = 'none';
    }
  } else {
    currentActiveEvent = null;
    summaryEventTitle.textContent = 'Selecione uma data no calendário';
    summaryEventMeta.textContent = 'Informações da programação';
    if (btnSummaryEdit) {
      btnSummaryEdit.style.display = 'none';
    }
  }
}

/**
 * Renderiza o Carrossel com as Artes dos Eventos da Semana em Curso
 * Se houver um evento selecionado fora da semana, garante que ele apareça no topo
 */
function renderWeekCarousel(forceEventToShow = null) {
  if (!carouselTrack) return;

  const week = getCurrentWeekRange();

  // Lista base: eventos da semana em curso
  let displayEvents = eventsList
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

  // Se o usuário clicou em uma data com evento que não está na semana, inclui no início
  if (forceEventToShow && !displayEvents.some((e) => e.id === forceEventToShow.id)) {
    displayEvents = [forceEventToShow, ...displayEvents];
  }

  if (displayEvents.length === 0) {
    carouselTrack.innerHTML = `
      <div class="carousel-slide-empty">
        <div class="empty-icon-wrap">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ff9900" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
        </div>
        <h4 class="empty-title">Nenhuma arte de evento nesta semana</h4>
        <p class="empty-desc">Toque em <strong>+ Adicionar</strong> acima para cadastrar a programação.</p>
      </div>
    `;
    if (carouselDots) carouselDots.innerHTML = '';
    updateSummaryBar(null, selectedDateISO);
    return;
  }

  let htmlSlides = '';
  displayEvents.forEach((ev, idx) => {
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
    for (let i = 0; i < displayEvents.length; i++) {
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
          if (displayEvents[idx]) {
            updateSummaryBar(displayEvents[idx]);
            highlightDayInCalendar(normalizeDateToISO(displayEvents[idx].dataISO || displayEvents[idx].data));
          }
        }
      });
    });
  }

  // Atualiza bolinhas e a barra de informações de 2 linhas ao deslizar o carrossel
  let scrollTimeout = null;
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

    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      if (displayEvents[activeIndex]) {
        updateSummaryBar(displayEvents[activeIndex]);
        highlightDayInCalendar(normalizeDateToISO(displayEvents[activeIndex].dataISO || displayEvents[activeIndex].data));
      }
    }, 120);
  };

  // Clique na arte: se tiver arte abre o modal em tela cheia
  const slideCards = carouselTrack.querySelectorAll('.carousel-slide-card');
  slideCards.forEach((card, idx) => {
    card.addEventListener('click', (e) => {
      const ev = displayEvents[idx];
      if (!ev) return;

      const artSrc = ev.arteBase64 || ev.arteUrl || '';
      const clickedArt = e.target.closest('.slide-art-wrap') || e.target.closest('.slide-art-img');

      if (artSrc && (clickedArt || e.target.closest('.slide-art-zoom-badge'))) {
        openArtPreview(artSrc, ev.titulo);
      } else {
        updateSummaryBar(ev);
        highlightDayInCalendar(normalizeDateToISO(ev.dataISO || ev.data));
      }
    });
  });

  // Atualiza a barra de resumo com o evento inicial
  const initialEvent = forceEventToShow || displayEvents[0];
  if (initialEvent) {
    updateSummaryBar(initialEvent);
  }
}

function highlightDayInCalendar(iso) {
  if (!iso || !progCalendarDays) return;
  selectedDateISO = iso;
  const dayButtons = progCalendarDays.querySelectorAll('.cal-day:not(.cal-day-empty)');
  dayButtons.forEach((b) => {
    if (b.getAttribute('data-iso') === iso) {
      b.classList.add('is-selected');
    } else {
      b.classList.remove('is-selected');
    }
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

      // Busca programação do dia clicado
      const dayEvents = eventsList.filter((ev) => normalizeDateToISO(ev.dataISO || ev.data) === iso);
      if (dayEvents.length > 0) {
        const ev = dayEvents[0];
        // Mostra a arte e os dados do evento no topo
        renderWeekCarousel(ev);
        // Atualiza a barra de resumo de 2 linhas e botão editar
        updateSummaryBar(ev, iso);

        // Faz o carrossel rolar até o slide no topo suavemente
        const firstSlide = carouselTrack.querySelector('.carousel-slide-card');
        if (firstSlide) {
          firstSlide.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
      } else {
        // Dia sem programação: atualiza barra resumida
        updateSummaryBar(null, iso);
      }
    });
  });
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

  if (formAddEvent) formAddEvent.reset();
  currentUploadedArtBase64 = '';
  selectedRepeatDates.clear();

  if (artPreviewContainer) artPreviewContainer.style.display = 'none';
  if (artPreviewImg) artPreviewImg.src = '';
  if (artUploadBox) artUploadBox.style.display = 'flex';
  if (repeatSection) repeatSection.style.display = 'none';
  if (eventRepeatsToggle) eventRepeatsToggle.checked = false;

  const targetDate = prefillDate || selectedDateISO || getTodayISO();
  if (inputEventDate) inputEventDate.value = targetDate;
  if (inputEventTime) inputEventTime.value = '19:30';
  if (inputEventLocation) inputEventLocation.value = 'Templo Nova Aurora';

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
    renderWeekCarousel(savedFirstEvent);
    renderEventsCalendar();
    updateSummaryBar(savedFirstEvent, dataPrincipal);

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
  currentEditArtBase64 = ev.arteBase64 || ev.arteUrl || '';

  if (editEventId) editEventId.value = ev.id || '';
  if (editEventTitle) editEventTitle.value = ev.titulo || '';
  if (editEventDate) editEventDate.value = normalizeDateToISO(ev.dataISO || ev.data);
  if (editEventTime) editEventTime.value = ev.horario || '19:30';
  if (editEventLocation) editEventLocation.value = ev.local || 'Templo Nova Aurora';

  if (currentEditArtBase64) {
    if (editArtPreviewImg) editArtPreviewImg.src = currentEditArtBase64;
    if (editArtPreviewContainer) editArtPreviewContainer.style.display = 'block';
    if (editArtUploadBox) editArtUploadBox.style.display = 'none';
  } else {
    if (editArtPreviewContainer) editArtPreviewContainer.style.display = 'none';
    if (editArtUploadBox) editArtUploadBox.style.display = 'flex';
  }

  modalEditEvent.classList.add('is-active');
  modalEditEvent.setAttribute('aria-hidden', 'false');

  if (editEventTitle) {
    setTimeout(() => editEventTitle.focus(), 150);
  }
}

export function closeEditEventModal() {
  if (!modalEditEvent) return;
  modalEditEvent.classList.remove('is-active');
  modalEditEvent.setAttribute('aria-hidden', 'true');
  currentEditingEvent = null;
}

/**
 * Salva as alterações da programação editada
 */
async function handleEditEventSubmit(e) {
  e.preventDefault();
  if (!currentEditingEvent) return;

  const id = currentEditingEvent.id;
  const titulo = editEventTitle ? editEventTitle.value.trim() : '';
  const dataISO = editEventDate ? editEventDate.value : '';
  const horario = editEventTime ? editEventTime.value.trim() : '';
  const local = editEventLocation ? editEventLocation.value.trim() : 'Templo Nova Aurora';

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
    updatedAt: serverTimestamp()
  };

  try {
    try {
      await updateDoc(doc(db, 'programacoes', id), updatedData);
    } catch (_) {}

    // Atualiza cache local
    eventsList = eventsList.map((item) => {
      if (item.id === id) {
        return { ...item, ...updatedData };
      }
      return item;
    });
    saveLocalEvents(eventsList);

    const updatedEv = eventsList.find((item) => item.id === id) || { id, ...updatedData };
    selectedDateISO = dataISO;

    renderWeekCarousel(updatedEv);
    renderEventsCalendar();
    updateSummaryBar(updatedEv, dataISO);

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

    renderWeekCarousel();
    renderEventsCalendar();
    updateSummaryBar(null, selectedDateISO);

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
          const evOnDate = eventsList.find((e) => normalizeDateToISO(e.dataISO || e.data) === selectedDateISO);
          updateSummaryBar(evOnDate, selectedDateISO);
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

    if (!selectedDateISO) {
      selectedDateISO = getTodayISO();
    }
    const evOnDate = eventsList.find((e) => normalizeDateToISO(e.dataISO || e.data) === selectedDateISO);
    updateSummaryBar(evOnDate || eventsList[0], selectedDateISO);
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

  // Barra de resumo em 2 linhas
  eventSummaryBar = document.getElementById('eventSummaryBar');
  summaryEventTitle = document.getElementById('summaryEventTitle');
  summaryEventMeta = document.getElementById('summaryEventMeta');
  btnSummaryEdit = document.getElementById('btnSummaryEdit');

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

  // Modal Preview Arte
  modalArtPreview = document.getElementById('modalArtPreview');
  modalArtPreviewImg = document.getElementById('modalArtPreviewImg');
  modalArtPreviewTitle = document.getElementById('modalArtPreviewTitle');
  btnCloseArtPreview = document.getElementById('btnCloseArtPreview');

  // Listeners de Navegação da Tela
  if (btnProgramacoesBack) {
    btnProgramacoesBack.addEventListener('click', closeEventsScreen);
  }

  // Único botão de adicionar (topo da aba)
  if (btnAddEvent) {
    btnAddEvent.addEventListener('click', () => openAddEventModal());
  }

  // Botão Editar na barra de informações (abre somente com senha de membro: cbna.membro)
  if (btnSummaryEdit) {
    btnSummaryEdit.addEventListener('click', () => {
      if (!currentActiveEvent) return;
      requestMemberAccess(() => {
        openEditEventModal(currentActiveEvent);
      });
    });
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

  // Preview de Arte
  if (btnCloseArtPreview) {
    btnCloseArtPreview.addEventListener('click', closeArtPreview);
  }
  const overlayArt = document.getElementById('overlayArtPreview');
  if (overlayArt) {
    overlayArt.addEventListener('click', closeArtPreview);
  }

  // Inicia carregamento
  renderWeekCarousel();
  renderEventsCalendar();
  subscribeToEvents();
}
