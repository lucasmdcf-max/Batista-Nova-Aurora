/**
 * Gestão de Visitantes da Congregação Batista Nova Aurora
 * - Autenticação por senha de membro ("bemvindo")
 * - Cadastro com seleção rápida de visitas (1ª, 2ª e 3ª)
 * - Lista de visitantes com link direto para o WhatsApp privado
 * - Indicador de visita e tag especial "Adicionar ao Grupo" na 3ª visita
 * - Edição de dados ao clicar no nome
 * - Sincronização em tempo real com Cloud Firestore e suporte Offline (localStorage)
 */

import { db } from './firebase-config.js';
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const STORAGE_KEY = 'nova_aurora_visitantes_v2';
const MEMBER_PASSWORD = 'bemvindo';

// Fallback inicial offline
const initialFallbackVisitors = [];

let visitorList = [];
let selectedNewVisits = 1;
let selectedEditVisits = 1;
let currentEditingVisitorId = null;
let currentTab = 'new'; // 'new' | 'list'
let isMemberUnlocked = false;

// Elementos DOM
let visitorsScreen = null;
let btnVisitorsBack = null;
let tabNewVisitor = null;
let tabVisitorList = null;
let countVisitorsBadge = null;
let visitorFormView = null;
let visitorListView = null;
let visitorCardsContainer = null;
let formNewVisitor = null;
let inputVisitorName = null;
let inputVisitorPhone = null;
let newVisitsButtons = [];

// Modal Senha de Membro
let modalMemberAuth = null;
let overlayMemberAuth = null;
let btnCloseMemberAuth = null;
let formMemberAuth = null;
let inputMemberPassword = null;
let memberAuthErrorMsg = null;
let btnCancelMemberAuth = null;

// Modal Edição de Visitante
let modalEditVisitor = null;
let overlayEditVisitor = null;
let btnCloseEditVisitor = null;
let formEditVisitor = null;
let inputEditVisitorName = null;
let inputEditVisitorPhone = null;
let editVisitsButtons = [];
let btnCancelEditVisitor = null;
let btnDeleteVisitor = null;

function loadLocalCache() {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Migração suave do v1 descartando dados de demonstração antigos
      const oldRaw = localStorage.getItem('nova_aurora_visitantes_v1');
      if (oldRaw) {
        const parsedOld = JSON.parse(oldRaw);
        if (Array.isArray(parsedOld)) {
          const validOld = parsedOld.filter((item) => !String(item.id).startsWith('demo-'));
          if (validOld.length > 0) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(validOld));
            return validOld;
          }
        }
      }
    } else {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((item) => !String(item.id).startsWith('demo-'));
      }
    }
  } catch (e) {
    console.warn('Erro ao ler cache de visitantes:', e);
  }
  return [];
}

function saveLocalCache(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn('Erro ao salvar cache de visitantes:', e);
  }
}

function formatLocalDate(dateObj) {
  if (!dateObj) return new Date().toLocaleDateString('pt-BR');
  const d = dateObj instanceof Date ? dateObj : new Date(dateObj);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
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

function cleanPhoneNumber(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function formatPhoneDisplay(val) {
  const digits = cleanPhoneNumber(val).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

function attachPhoneMask(input) {
  if (!input) return;
  input.addEventListener('input', (e) => {
    const cursor = input.selectionStart;
    const oldLength = input.value.length;
    input.value = formatPhoneDisplay(input.value);
    const newLength = input.value.length;
    const diff = newLength - oldLength;
    if (cursor !== null) {
      input.setSelectionRange(cursor + diff, cursor + diff);
    }
  });
}

/**
 * Autenticação de Membro
 */
export function requestAccessToVisitors() {
  if (isMemberUnlocked) {
    openVisitorsScreen();
    return;
  }
  openMemberAuthModal();
}

function openMemberAuthModal() {
  if (!modalMemberAuth) return;
  modalMemberAuth.classList.add('is-open');
  modalMemberAuth.setAttribute('aria-hidden', 'false');
  if (memberAuthErrorMsg) memberAuthErrorMsg.style.display = 'none';
  if (inputMemberPassword) {
    inputMemberPassword.value = '';
    setTimeout(() => inputMemberPassword.focus(), 150);
  }
}

function closeMemberAuthModal() {
  if (!modalMemberAuth) return;
  modalMemberAuth.classList.remove('is-open');
  modalMemberAuth.setAttribute('aria-hidden', 'true');
  if (memberAuthErrorMsg) memberAuthErrorMsg.style.display = 'none';
}

function handleMemberAuthSubmit(e) {
  if (e) e.preventDefault();
  const entered = (inputMemberPassword ? inputMemberPassword.value : '').trim().toLowerCase();
  if (entered === MEMBER_PASSWORD.toLowerCase()) {
    isMemberUnlocked = true;
    closeMemberAuthModal();
    openVisitorsScreen();
  } else {
    if (memberAuthErrorMsg) {
      memberAuthErrorMsg.style.display = 'block';
    }
    if (inputMemberPassword) {
      inputMemberPassword.classList.add('input-error-shake');
      setTimeout(() => inputMemberPassword.classList.remove('input-error-shake'), 400);
      inputMemberPassword.select();
    }
  }
}

/**
 * Abertura e Fechamento da Tela
 */
export function openVisitorsScreen() {
  if (visitorsScreen) {
    visitorsScreen.classList.add('is-active');
    visitorsScreen.setAttribute('aria-hidden', 'false');
  }
  // Se ainda estiver na primeira vez, abre no formulário ou na lista
  switchTab(currentTab);
}

export function closeVisitorsScreen() {
  if (visitorsScreen) {
    visitorsScreen.classList.remove('is-active');
    visitorsScreen.setAttribute('aria-hidden', 'true');
  }
  closeEditVisitorModal();
}

/**
 * Alternância de Abas (Novo Cadastro / Lista de Visitantes)
 */
function switchTab(tab) {
  currentTab = tab;
  if (tab === 'new') {
    if (tabNewVisitor) tabNewVisitor.classList.add('is-active');
    if (tabVisitorList) tabVisitorList.classList.remove('is-active');
    if (visitorFormView) visitorFormView.style.display = 'block';
    if (visitorListView) visitorListView.style.display = 'none';
  } else {
    if (tabNewVisitor) tabNewVisitor.classList.remove('is-active');
    if (tabVisitorList) tabVisitorList.classList.add('is-active');
    if (visitorFormView) visitorFormView.style.display = 'none';
    if (visitorListView) visitorListView.style.display = 'block';
    renderVisitorList();
  }
}

/**
 * Renderização da Lista de Visitantes
 */
function renderVisitorList() {
  if (!visitorCardsContainer) return;

  if (countVisitorsBadge) {
    countVisitorsBadge.textContent = visitorList.length;
  }

  if (visitorList.length === 0) {
    visitorCardsContainer.innerHTML = `
      <div class="visitor-empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
          <circle cx="9" cy="7" r="4"></circle>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
        </svg>
        <p>Nenhum visitante cadastrado ainda.</p>
        <span>Toque em "Novo Cadastro" para adicionar o primeiro visitante.</span>
      </div>
    `;
    return;
  }

  const html = visitorList.map((item) => {
    const visits = Number(item.visitas) || 1;
    const cleanPhone = cleanPhoneNumber(item.telefone);
    // WhatsApp direct link with message
    const waUrl = cleanPhone.length >= 10
      ? `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(`Olá ${item.nome}! É uma grande alegria ter você conosco na Congregação Batista Nova Aurora. Que Deus abençoe sua vida!`)}`
      : '#';

    // Se atingiu a 3ª visita, exibe a tag "adicionar ao grupo" no lugar do indicador do número de visitas
    let statusBadgeHtml = '';
    if (visits >= 3) {
      statusBadgeHtml = `
        <span class="visitor-badge badge-group" title="Atingiu 3 visitas! Adicionar ao grupo da congregação">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <line x1="19" y1="8" x2="19" y2="14"></line>
            <line x1="22" y1="11" x2="16" y2="11"></line>
          </svg>
          adicionar ao grupo
        </span>
      `;
    } else {
      statusBadgeHtml = `
        <span class="visitor-badge badge-visits">
          ${visits}ª visita
        </span>
      `;
    }

    return `
      <div class="visitor-card" data-id="${escapeHtml(item.id)}">
        <div class="visitor-card-left">
          <div class="visitor-name-clickable" data-action="edit" data-id="${escapeHtml(item.id)}" title="Clique para editar as informações">
            <span class="visitor-name">${escapeHtml(item.nome)}</span>
            <svg class="visitor-edit-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
          </div>
          <div class="visitor-phone-row">
            <span class="visitor-phone">${escapeHtml(item.telefone || 'Sem telefone')}</span>
            ${item.data ? `<span class="visitor-date">• ${escapeHtml(item.data)}</span>` : ''}
          </div>
        </div>

        <div class="visitor-card-right">
          <div class="visitor-status-area">
            ${statusBadgeHtml}
          </div>

          <a href="${waUrl}" target="_blank" rel="noopener noreferrer" class="btn-whatsapp-direct" title="Conversar no WhatsApp">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.52 3.48A11.93 11.93 0 0 0 12.06 0C5.46 0 .09 5.37.09 11.97c0 2.11.55 4.16 1.6 5.97L0 24l6.22-1.63a11.9 11.9 0 0 0 5.84 1.51h.01c6.6 0 11.97-5.37 11.97-11.97 0-3.2-1.25-6.21-3.52-8.43zm-8.46 18.49h-.01a9.92 9.92 0 0 1-5.06-1.39l-.36-.21-3.76.99 1-3.66-.23-.37a9.9 9.9 0 0 1-1.52-5.26c0-5.48 4.46-9.94 9.95-9.94 2.66 0 5.15 1.03 7.03 2.91a9.88 9.88 0 0 1 2.91 7.03c0 5.48-4.47 9.93-9.95 9.93zm5.45-7.44c-.3-.15-1.77-.87-2.04-.97-.28-.1-.48-.15-.68.15-.2.3-.77.97-.95 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.68-1.64-.93-2.25-.25-.59-.5-.51-.68-.52h-.58c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.87 1.21 3.07.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.18-1.42-.08-.13-.27-.2-.57-.35z"/>
            </svg>
            <span>WhatsApp</span>
          </a>
        </div>
      </div>
    `;
  }).join('');

  visitorCardsContainer.innerHTML = html;

  // Adiciona listeners para clique no nome para editar
  visitorCardsContainer.querySelectorAll('[data-action="edit"]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = el.getAttribute('data-id');
      openEditVisitorModal(id);
    });
  });
}

/**
 * Salvar Novo Visitante
 */
async function handleNewVisitorSubmit(e) {
  e.preventDefault();

  const nome = (inputVisitorName ? inputVisitorName.value : '').trim();
  const telefone = (inputVisitorPhone ? inputVisitorPhone.value : '').trim();
  const visitas = selectedNewVisits || 1;

  if (!nome) {
    alert('Por favor, informe o nome do visitante.');
    return;
  }

  const cleanPhone = cleanPhoneNumber(telefone);
  if (cleanPhone.length < 10) {
    alert('Por favor, digite um telefone com DDD válido.');
    return;
  }

  const newVisitor = {
    nome,
    telefone: formatPhoneDisplay(telefone),
    visitas: Number(visitas),
    data: formatLocalDate(new Date()),
    timestamp: Date.now()
  };

  // Atualização otimista local
  const tempId = 'temp-' + Date.now();
  visitorList.unshift({ id: tempId, ...newVisitor });
  saveLocalCache(visitorList);

  // Limpa formulário
  if (inputVisitorName) inputVisitorName.value = '';
  if (inputVisitorPhone) inputVisitorPhone.value = '';
  setNewVisits(1);

  // Alterna suavemente para a lista para ver o visitante cadastrado
  switchTab('list');

  // Persiste no Firestore com campos explícitos e tratamento de erro robusto
  try {
    const docRef = await addDoc(collection(db, 'visitantes'), {
      nome: newVisitor.nome,
      telefone: newVisitor.telefone,
      visitas: Number(newVisitor.visitas),
      data: newVisitor.data,
      timestamp: serverTimestamp()
    });
    // Atualiza id temporário local com id real do Firestore
    const item = visitorList.find((v) => v.id === tempId);
    if (item) item.id = docRef.id;
    saveLocalCache(visitorList);
    renderVisitorList();
  } catch (err) {
    console.warn('Erro ao salvar visitante no Firestore (salvo localmente):', err);
  }
}

/**
 * Modal de Edição de Visitante
 */
function openEditVisitorModal(visitorId) {
  const visitor = visitorList.find((v) => v.id === visitorId);
  if (!visitor || !modalEditVisitor) return;

  currentEditingVisitorId = visitorId;
  if (inputEditVisitorName) inputEditVisitorName.value = visitor.nome || '';
  if (inputEditVisitorPhone) inputEditVisitorPhone.value = visitor.telefone || '';
  setEditVisits(Number(visitor.visitas) || 1);

  modalEditVisitor.classList.add('is-open');
  modalEditVisitor.setAttribute('aria-hidden', 'false');
}

function closeEditVisitorModal() {
  if (!modalEditVisitor) return;
  modalEditVisitor.classList.remove('is-open');
  modalEditVisitor.setAttribute('aria-hidden', 'true');
  currentEditingVisitorId = null;
}

async function handleEditVisitorSubmit(e) {
  e.preventDefault();
  if (!currentEditingVisitorId) return;

  const nome = (inputEditVisitorName ? inputEditVisitorName.value : '').trim();
  const telefone = (inputEditVisitorPhone ? inputEditVisitorPhone.value : '').trim();
  const visitas = selectedEditVisits || 1;

  if (!nome) {
    alert('O nome do visitante não pode ficar vazio.');
    return;
  }

  const updatedData = {
    nome,
    telefone: formatPhoneDisplay(telefone),
    visitas: Number(visitas)
  };

  // Atualiza localmente
  const idx = visitorList.findIndex((v) => v.id === currentEditingVisitorId);
  if (idx !== -1) {
    visitorList[idx] = { ...visitorList[idx], ...updatedData };
    saveLocalCache(visitorList);
    renderVisitorList();
  }

  const targetId = currentEditingVisitorId;
  closeEditVisitorModal();

  // Atualiza no Firestore
  if (!targetId.startsWith('temp-') && !targetId.startsWith('demo-')) {
    try {
      const docRef = doc(db, 'visitantes', targetId);
      await updateDoc(docRef, updatedData);
    } catch (err) {
      console.warn('Erro ao atualizar visitante no Firestore:', err);
    }
  }
}

async function handleDeleteVisitor() {
  if (!currentEditingVisitorId) return;
  const targetId = currentEditingVisitorId;
  const visitor = visitorList.find((v) => String(v.id) === String(targetId));
  const confirmMsg = `Deseja realmente remover o visitante "${visitor ? visitor.nome : ''}"?`;
  if (!confirm(confirmMsg)) return;

  // Remove localmente no dispositivo que solicitou a exclusão
  visitorList = visitorList.filter((v) => String(v.id) !== String(targetId));
  saveLocalCache(visitorList);
  if (countVisitorsBadge) {
    countVisitorsBadge.textContent = visitorList.length;
  }
  renderVisitorList();
  closeEditVisitorModal();

  // Remove no Cloud Firestore para propagar instantaneamente a todos os demais dispositivos
  if (!String(targetId).startsWith('temp-')) {
    try {
      const docRef = doc(db, 'visitantes', String(targetId));
      await deleteDoc(docRef);
    } catch (err) {
      console.error('Erro ao deletar visitante no Firestore:', err);
    }
  }
}

/**
 * Seleção de Visitas (1ª, 2ª, 3ª)
 */
function setNewVisits(num) {
  selectedNewVisits = Number(num);
  newVisitsButtons.forEach((btn) => {
    const v = Number(btn.getAttribute('data-visits'));
    if (v === selectedNewVisits) {
      btn.classList.add('is-selected');
    } else {
      btn.classList.remove('is-selected');
    }
  });
}

function setEditVisits(num) {
  selectedEditVisits = Number(num);
  editVisitsButtons.forEach((btn) => {
    const v = Number(btn.getAttribute('data-visits'));
    if (v === selectedEditVisits) {
      btn.classList.add('is-selected');
    } else {
      btn.classList.remove('is-selected');
    }
  });
}

/**
 * Sincronização em Tempo Real via Firestore
 */
async function syncPendingLocalVisitors() {
  const pending = visitorList.filter((item) => String(item.id).startsWith('temp-'));
  if (pending.length === 0) return;

  for (const item of pending) {
    try {
      const docRef = await addDoc(collection(db, 'visitantes'), {
        nome: item.nome,
        telefone: item.telefone,
        visitas: Number(item.visitas) || 1,
        data: item.data || formatLocalDate(new Date()),
        timestamp: serverTimestamp()
      });
      item.id = docRef.id;
    } catch (err) {
      console.warn('Erro ao sincronizar visitante pendente:', err);
    }
  }
}

function subscribeToFirestore() {
  try {
    // Consulta direta na coleção sem cláusula orderBy no servidor para evitar falha por ausência de índice
    const colRef = collection(db, 'visitantes');
    onSnapshot(colRef, (snapshot) => {
      const remoteList = [];
      snapshot.forEach((d) => {
        const data = d.data();
        let formattedDate = data.data || '';
        if (!formattedDate && data.timestamp && typeof data.timestamp.toDate === 'function') {
          formattedDate = formatLocalDate(data.timestamp.toDate());
        }
        let ts = Date.now();
        if (data.timestamp) {
          if (typeof data.timestamp.toMillis === 'function') {
            ts = data.timestamp.toMillis();
          } else if (typeof data.timestamp.toDate === 'function') {
            ts = data.timestamp.toDate().getTime();
          } else if (typeof data.timestamp === 'number') {
            ts = data.timestamp;
          }
        }
        remoteList.push({
          id: d.id,
          nome: data.nome || '',
          telefone: data.telefone || '',
          visitas: Number(data.visitas) || 1,
          data: formattedDate || formatLocalDate(new Date()),
          timestamp: ts
        });
      });

      // Ordena por data/timestamp mais recente em memória (100% seguro em todos os navegadores)
      remoteList.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

      // Sincronização Total: O Firestore é a autoridade central em todos os dispositivos
      visitorList = remoteList;
      saveLocalCache(visitorList);

      if (countVisitorsBadge) {
        countVisitorsBadge.textContent = visitorList.length;
      }
      renderVisitorList();

      // Sincroniza qualquer item local pendente que ainda não tenha subido
      syncPendingLocalVisitors();
    }, (err) => {
      console.warn('Firestore offline ou restrito. Mantendo cache local de visitantes:', err);
    });
  } catch (e) {
    console.warn('Erro ao conectar listener Firestore para visitantes:', e);
  }
}

/**
 * Inicialização
 */
export function initVisitors() {
  // Carrega cache local
  visitorList = loadLocalCache();

  // Referências DOM
  visitorsScreen = document.getElementById('visitorsScreen');
  btnVisitorsBack = document.getElementById('btnVisitorsBack');
  tabNewVisitor = document.getElementById('tabNewVisitor');
  tabVisitorList = document.getElementById('tabVisitorList');
  countVisitorsBadge = document.getElementById('countVisitors');
  visitorFormView = document.getElementById('visitorFormView');
  visitorListView = document.getElementById('visitorListView');
  visitorCardsContainer = document.getElementById('visitorCardsContainer');
  formNewVisitor = document.getElementById('formNewVisitor');
  inputVisitorName = document.getElementById('visitorName');
  inputVisitorPhone = document.getElementById('visitorPhone');
  newVisitsButtons = Array.from(document.querySelectorAll('#visitCountSelector .btn-visit-option'));

  // Senha de Membro
  modalMemberAuth = document.getElementById('modalMemberAuth');
  overlayMemberAuth = document.getElementById('overlayMemberAuth');
  btnCloseMemberAuth = document.getElementById('btnCloseMemberAuth');
  formMemberAuth = document.getElementById('formMemberAuth');
  inputMemberPassword = document.getElementById('memberPassword');
  memberAuthErrorMsg = document.getElementById('memberAuthErrorMsg');
  btnCancelMemberAuth = document.getElementById('btnCancelMemberAuth');

  // Modal Edição
  modalEditVisitor = document.getElementById('modalEditVisitor');
  overlayEditVisitor = document.getElementById('overlayEditVisitor');
  btnCloseEditVisitor = document.getElementById('btnCloseEditVisitor');
  formEditVisitor = document.getElementById('formEditVisitor');
  inputEditVisitorName = document.getElementById('editVisitorName');
  inputEditVisitorPhone = document.getElementById('editVisitorPhone');
  editVisitsButtons = Array.from(document.querySelectorAll('#editVisitCountSelector .btn-visit-option'));
  btnCancelEditVisitor = document.getElementById('btnCancelEditVisitor');
  btnDeleteVisitor = document.getElementById('btnDeleteVisitor');

  // Máscaras de telefone
  attachPhoneMask(inputVisitorPhone);
  attachPhoneMask(inputEditVisitorPhone);

  // Listeners de Abas
  if (tabNewVisitor) {
    tabNewVisitor.addEventListener('click', () => switchTab('new'));
  }
  if (tabVisitorList) {
    tabVisitorList.addEventListener('click', () => switchTab('list'));
  }

  // Botão voltar da tela
  if (btnVisitorsBack) {
    btnVisitorsBack.addEventListener('click', closeVisitorsScreen);
  }

  // Seleção de visitas no cadastro
  newVisitsButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const v = btn.getAttribute('data-visits');
      setNewVisits(v);
    });
  });

  // Seleção de visitas na edição
  editVisitsButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const v = btn.getAttribute('data-visits');
      setEditVisits(v);
    });
  });

  // Form novo visitante
  if (formNewVisitor) {
    formNewVisitor.addEventListener('submit', handleNewVisitorSubmit);
  }

  // Form edição visitante
  if (formEditVisitor) {
    formEditVisitor.addEventListener('submit', handleEditVisitorSubmit);
  }
  if (btnCancelEditVisitor) {
    btnCancelEditVisitor.addEventListener('click', closeEditVisitorModal);
  }
  if (btnCloseEditVisitor) {
    btnCloseEditVisitor.addEventListener('click', closeEditVisitorModal);
  }
  if (overlayEditVisitor) {
    overlayEditVisitor.addEventListener('click', closeEditVisitorModal);
  }
  if (btnDeleteVisitor) {
    btnDeleteVisitor.addEventListener('click', handleDeleteVisitor);
  }

  // Senha de Membro
  if (formMemberAuth) {
    formMemberAuth.addEventListener('submit', handleMemberAuthSubmit);
  }
  if (btnCloseMemberAuth) {
    btnCloseMemberAuth.addEventListener('click', closeMemberAuthModal);
  }
  if (btnCancelMemberAuth) {
    btnCancelMemberAuth.addEventListener('click', closeMemberAuthModal);
  }
  if (overlayMemberAuth) {
    overlayMemberAuth.addEventListener('click', closeMemberAuthModal);
  }

  // Atualiza badge inicial
  if (countVisitorsBadge) {
    countVisitorsBadge.textContent = visitorList.length;
  }

  // Inicia listener Firestore
  subscribeToFirestore();
}
