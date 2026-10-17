/**
 * Gestão de Membros e Relatório Financeiro — Congregação Batista Nova Aurora
 * - Acesso protegido por senha de membro (cbna.membro)
 * - Hub com opções "Lista de membros" e "Relatório financeiro"
 * - Lista de membros em ordem alfabética com busca e botão de novo cadastro no topo
 * - Código de 6 dígitos exclusivo criado e confirmado pelo membro no cadastro
 * - Acesso aos dados do membro liberado por seu código de 6 dígitos ou pelo ADM (código 010101)
 * - Relatório financeiro com filtro por mês e ano
 * - Entradas com Dízimos e Ofertas descritos separadamente
 * - Saídas descritas separadamente e somatório total das saídas abaixo
 * - Layout 100% encaixado na tela acima do botão do menu principal sem rolagem
 * - Botão discreto no topo direito para a tesoureira editar via código 010101
 * - Sincronização em tempo real com Firestore e fallback offline (localStorage)
 */

import { db } from './firebase-config.js';
import {
  collection,
  addDoc,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

import { requestMemberAccess } from './visitors.js';

const ADMIN_CODE = '010101';
const TREASURY_CODE = '010101';
const STORAGE_MEMBERS_KEY = 'cbna_membros_cache_v2';
const STORAGE_FINANCE_KEY = 'cbna_financeiro_cache_v2';

// Estado local
let membersList = [];
let financialReports = {}; // chave: 'YYYY-MM' => { mes, ano, dizimos, ofertas, totalEntradas, saidas: [], totalSaidas, saldoGeral }
let currentScreenTab = 'hub'; // 'hub' | 'list' | 'finance'
let currentSelectedMember = null;
let isTreasuryUnlocked = false;
let isAdminUnlocked = false;
let tempEditingSaidas = [];

// Filtros do Relatório Financeiro
const now = new Date();
let selectedFinanceMonth = now.getMonth() + 1;
let selectedFinanceYear = now.getFullYear();

// DOM Elements
let membersScreen = null;
let btnMembersBack = null;
let membersScreenTitle = null;
let tabMembersHub = null;
let tabMembersList = null;
let tabMembersFinance = null;
let countMembersBadge = null;

// Views
let membersHubView = null;
let membersListView = null;
let membersFinanceView = null;

// Hub Buttons
let btnHubGoMembers = null;
let btnHubGoFinance = null;

// Member List Elements
let btnOpenNewMemberModal = null;
let memberSearchInput = null;
let btnMemberSearchClear = null;
let membersCardsContainer = null;

// Modals
let modalMemberCodeAuth = null;
let overlayMemberCodeAuth = null;
let btnCloseMemberCodeAuth = null;
let btnCancelMemberCodeAuth = null;
let formMemberCodeAuth = null;
let inputMemberAccessCode = null;
let memberCodeAuthErrorMsg = null;
let memberCodeAuthTitle = null;
let memberCodeAuthDesc = null;

let modalNewMember = null;
let overlayNewMember = null;
let btnCloseNewMember = null;
let btnCancelNewMember = null;
let formNewMember = null;
let newMemberName = null;
let newMemberPhone = null;
let newMemberBirth = null;
let newMemberAddress = null;
let newMemberEmail = null;
let newMemberRole = null;
let newMemberCode = null;
let newMemberCodeConfirm = null;
let newMemberCodeErrorMsg = null;

let modalMemberDetails = null;
let overlayMemberDetails = null;
let btnCloseMemberDetails = null;
let memberDetailsTitle = null;
let memberDetailsAvatar = null;
let memberDetailsName = null;
let memberDetailsRole = null;
let memberDetailsFields = null;
let btnEditMemberOpen = null;
let btnDeleteMember = null;

let modalEditMember = null;
let overlayEditMember = null;
let btnCloseEditMember = null;
let btnCancelEditMember = null;
let formEditMember = null;
let editMemberId = null;
let editMemberName = null;
let editMemberPhone = null;
let editMemberBirth = null;
let editMemberAddress = null;
let editMemberEmail = null;
let editMemberRole = null;
let editMemberCode = null;
let editMemberCodeConfirm = null;
let editMemberCodeErrorMsg = null;

// Financial Elements (Relatório Compacto)
let btnTreasuryEdit = null;
let selectFinanceMonth = null;
let selectFinanceYear = null;
let financeTotalEntries = null;
let financeDizimosValue = null;
let financeOfertasValue = null;
let financeExitsList = null;
let financeTotalExits = null;
let financeSummaryPeriod = null;
let financeBalanceValue = null;

// Modal Senha da Tesouraria
let modalTreasuryAuth = null;
let overlayTreasuryAuth = null;
let btnCloseTreasuryAuth = null;
let btnCancelTreasuryAuth = null;
let formTreasuryAuth = null;
let inputTreasuryCode = null;
let treasuryAuthErrorMsg = null;

// Modal Gerenciamento Financeiro Completo
let modalTreasuryManage = null;
let overlayTreasuryManage = null;
let btnCloseTreasuryManage = null;
let btnCancelTreasuryManage = null;
let formTreasuryManage = null;
let treasuryManageModalTitle = null;
let treasuryInputDizimos = null;
let treasuryInputOfertas = null;
let treasuryExitDesc = null;
let treasuryExitVal = null;
let btnAddTreasuryExit = null;
let treasuryManageExitsList = null;
let treasuryManageExitsSum = null;

/**
 * Inicializador da Área de Membros
 */
export function initMembers() {
  cacheElements();
  loadOfflineCaches();
  setupEventListeners();
  setupFirestoreListeners();

  try {
    if (sessionStorage.getItem('cbna_treasury_unlocked') === 'true') {
      isTreasuryUnlocked = true;
    }
  } catch (_) {}
}

/**
 * Ponto de entrada chamado ao clicar no menu "MEMBROS"
 */
export function requestAccessToMembers() {
  requestMemberAccess(() => {
    openMembersScreen('hub');
  });
}

export function openMembersScreen(tab = 'hub') {
  if (!membersScreen) cacheElements();
  if (membersScreen) {
    membersScreen.classList.add('is-active');
    membersScreen.setAttribute('aria-hidden', 'false');
    switchTab(tab);
  }
}

export function closeMembersScreen() {
  if (membersScreen) {
    membersScreen.classList.remove('is-active');
    membersScreen.setAttribute('aria-hidden', 'true');
  }
}

function cacheElements() {
  membersScreen = document.getElementById('membersScreen');
  btnMembersBack = document.getElementById('btnMembersBack');
  membersScreenTitle = document.getElementById('membersScreenTitle');
  tabMembersHub = document.getElementById('tabMembersHub');
  tabMembersList = document.getElementById('tabMembersList');
  tabMembersFinance = document.getElementById('tabMembersFinance');
  countMembersBadge = document.getElementById('countMembersBadge');

  membersHubView = document.getElementById('membersHubView');
  membersListView = document.getElementById('membersListView');
  membersFinanceView = document.getElementById('membersFinanceView');

  btnHubGoMembers = document.getElementById('btnHubGoMembers');
  btnHubGoFinance = document.getElementById('btnHubGoFinance');

  btnOpenNewMemberModal = document.getElementById('btnOpenNewMemberModal');
  memberSearchInput = document.getElementById('memberSearchInput');
  btnMemberSearchClear = document.getElementById('btnMemberSearchClear');
  membersCardsContainer = document.getElementById('membersCardsContainer');

  modalMemberCodeAuth = document.getElementById('modalMemberCodeAuth');
  overlayMemberCodeAuth = document.getElementById('overlayMemberCodeAuth');
  btnCloseMemberCodeAuth = document.getElementById('btnCloseMemberCodeAuth');
  btnCancelMemberCodeAuth = document.getElementById('btnCancelMemberCodeAuth');
  formMemberCodeAuth = document.getElementById('formMemberCodeAuth');
  inputMemberAccessCode = document.getElementById('inputMemberAccessCode');
  memberCodeAuthErrorMsg = document.getElementById('memberCodeAuthErrorMsg');
  memberCodeAuthTitle = document.getElementById('memberCodeAuthTitle');
  memberCodeAuthDesc = document.getElementById('memberCodeAuthDesc');

  modalNewMember = document.getElementById('modalNewMember');
  overlayNewMember = document.getElementById('overlayNewMember');
  btnCloseNewMember = document.getElementById('btnCloseNewMember');
  btnCancelNewMember = document.getElementById('btnCancelNewMember');
  formNewMember = document.getElementById('formNewMember');
  newMemberName = document.getElementById('newMemberName');
  newMemberPhone = document.getElementById('newMemberPhone');
  newMemberBirth = document.getElementById('newMemberBirth');
  newMemberAddress = document.getElementById('newMemberAddress');
  newMemberEmail = document.getElementById('newMemberEmail');
  newMemberRole = document.getElementById('newMemberRole');
  newMemberCode = document.getElementById('newMemberCode');
  newMemberCodeConfirm = document.getElementById('newMemberCodeConfirm');
  newMemberCodeErrorMsg = document.getElementById('newMemberCodeErrorMsg');

  modalMemberDetails = document.getElementById('modalMemberDetails');
  overlayMemberDetails = document.getElementById('overlayMemberDetails');
  btnCloseMemberDetails = document.getElementById('btnCloseMemberDetails');
  memberDetailsTitle = document.getElementById('memberDetailsTitle');
  memberDetailsAvatar = document.getElementById('memberDetailsAvatar');
  memberDetailsName = document.getElementById('memberDetailsName');
  memberDetailsRole = document.getElementById('memberDetailsRole');
  memberDetailsFields = document.getElementById('memberDetailsFields');
  btnEditMemberOpen = document.getElementById('btnEditMemberOpen');
  btnDeleteMember = document.getElementById('btnDeleteMember');

  modalEditMember = document.getElementById('modalEditMember');
  overlayEditMember = document.getElementById('overlayEditMember');
  btnCloseEditMember = document.getElementById('btnCloseEditMember');
  btnCancelEditMember = document.getElementById('btnCancelEditMember');
  formEditMember = document.getElementById('formEditMember');
  editMemberId = document.getElementById('editMemberId');
  editMemberName = document.getElementById('editMemberName');
  editMemberPhone = document.getElementById('editMemberPhone');
  editMemberBirth = document.getElementById('editMemberBirth');
  editMemberAddress = document.getElementById('editMemberAddress');
  editMemberEmail = document.getElementById('editMemberEmail');
  editMemberRole = document.getElementById('editMemberRole');
  editMemberCode = document.getElementById('editMemberCode');
  editMemberCodeConfirm = document.getElementById('editMemberCodeConfirm');
  editMemberCodeErrorMsg = document.getElementById('editMemberCodeErrorMsg');

  // Relatório Financeiro
  btnTreasuryEdit = document.getElementById('btnTreasuryEdit');
  selectFinanceMonth = document.getElementById('selectFinanceMonth');
  selectFinanceYear = document.getElementById('selectFinanceYear');
  financeTotalEntries = document.getElementById('financeTotalEntries');
  financeDizimosValue = document.getElementById('financeDizimosValue');
  financeOfertasValue = document.getElementById('financeOfertasValue');
  financeExitsList = document.getElementById('financeExitsList');
  financeTotalExits = document.getElementById('financeTotalExits');
  financeSummaryPeriod = document.getElementById('financeSummaryPeriod');
  financeBalanceValue = document.getElementById('financeBalanceValue');

  // Modal Autenticação da Tesouraria
  modalTreasuryAuth = document.getElementById('modalTreasuryAuth');
  overlayTreasuryAuth = document.getElementById('overlayTreasuryAuth');
  btnCloseTreasuryAuth = document.getElementById('btnCloseTreasuryAuth');
  btnCancelTreasuryAuth = document.getElementById('btnCancelTreasuryAuth');
  formTreasuryAuth = document.getElementById('formTreasuryAuth');
  inputTreasuryCode = document.getElementById('inputTreasuryCode');
  treasuryAuthErrorMsg = document.getElementById('treasuryAuthErrorMsg');

  // Modal Gerenciamento Financeiro
  modalTreasuryManage = document.getElementById('modalTreasuryManage');
  overlayTreasuryManage = document.getElementById('overlayTreasuryManage');
  btnCloseTreasuryManage = document.getElementById('btnCloseTreasuryManage');
  btnCancelTreasuryManage = document.getElementById('btnCancelTreasuryManage');
  formTreasuryManage = document.getElementById('formTreasuryManage');
  treasuryManageModalTitle = document.getElementById('treasuryManageModalTitle');
  treasuryInputDizimos = document.getElementById('treasuryInputDizimos');
  treasuryInputOfertas = document.getElementById('treasuryInputOfertas');
  treasuryExitDesc = document.getElementById('treasuryExitDesc');
  treasuryExitVal = document.getElementById('treasuryExitVal');
  btnAddTreasuryExit = document.getElementById('btnAddTreasuryExit');
  treasuryManageExitsList = document.getElementById('treasuryManageExitsList');
  treasuryManageExitsSum = document.getElementById('treasuryManageExitsSum');
}

function loadOfflineCaches() {
  try {
    const rawMembers = localStorage.getItem(STORAGE_MEMBERS_KEY);
    if (rawMembers) {
      membersList = JSON.parse(rawMembers);
      renderMembersList();
    }
    const rawFinance = localStorage.getItem(STORAGE_FINANCE_KEY);
    if (rawFinance) {
      financialReports = JSON.parse(rawFinance);
      renderFinancialView();
    }
  } catch (err) {
    console.warn('Erro ao carregar caches locais de membros/financeiro:', err);
  }
}

function setupFirestoreListeners() {
  // 1. Membros
  try {
    const qMembers = query(collection(db, 'membros'), orderBy('nome', 'asc'));
    onSnapshot(qMembers, (snapshot) => {
      const list = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      membersList = list;
      try {
        localStorage.setItem(STORAGE_MEMBERS_KEY, JSON.stringify(list));
      } catch (_) {}
      renderMembersList();
    }, (err) => {
      console.warn('Erro Firestore Membros (modo offline ativo):', err);
    });
  } catch (err) {
    console.warn('Erro ao inicializar snapshot de membros:', err);
  }

  // 2. Relatórios Financeiros
  try {
    const qFinance = collection(db, 'relatorios_financeiros');
    onSnapshot(qFinance, (snapshot) => {
      const reports = {};
      snapshot.forEach((docSnap) => {
        reports[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
      });
      financialReports = reports;
      try {
        localStorage.setItem(STORAGE_FINANCE_KEY, JSON.stringify(reports));
      } catch (_) {}
      renderFinancialView();
    }, (err) => {
      console.warn('Erro Firestore Financeiro (modo offline ativo):', err);
    });
  } catch (err) {
    console.warn('Erro ao inicializar snapshot financeiro:', err);
  }
}

function switchTab(tab) {
  currentScreenTab = tab;

  // Atualiza botões compactos do header
  if (tabMembersHub) tabMembersHub.classList.toggle('is-active', tab === 'hub');
  if (tabMembersList) tabMembersList.classList.toggle('is-active', tab === 'list');
  if (tabMembersFinance) tabMembersFinance.classList.toggle('is-active', tab === 'finance');

  // Alterna views
  if (membersHubView) membersHubView.style.display = tab === 'hub' ? 'block' : 'none';
  if (membersListView) membersListView.style.display = tab === 'list' ? 'block' : 'none';
  if (membersFinanceView) membersFinanceView.style.display = tab === 'finance' ? 'flex' : 'none';

  // Trava de rolagem quando no financeiro (garantindo que tudo fique 100% encaixado na tela acima do menu)
  const body = document.querySelector('.members-screen-body');
  if (body) {
    if (tab === 'finance') {
      body.classList.add('finance-screen-locked');
    } else {
      body.classList.remove('finance-screen-locked');
    }
  }

  // Título limpo e responsivo
  if (membersScreenTitle) {
    if (tab === 'hub') membersScreenTitle.textContent = 'MEMBROS';
    else if (tab === 'list') membersScreenTitle.textContent = 'MEMBROS';
    else if (tab === 'finance') membersScreenTitle.textContent = 'FINANCEIRO';
  }

  if (tab === 'list') {
    renderMembersList();
  } else if (tab === 'finance') {
    renderFinancialView();
  }
}

function setupEventListeners() {
  // Voltar
  if (btnMembersBack) {
    btnMembersBack.addEventListener('click', () => {
      if (currentScreenTab === 'list' || currentScreenTab === 'finance') {
        switchTab('hub');
      } else {
        closeMembersScreen();
      }
    });
  }

  // Tabs do Header
  if (tabMembersHub) tabMembersHub.addEventListener('click', () => switchTab('hub'));
  if (tabMembersList) tabMembersList.addEventListener('click', () => switchTab('list'));
  if (tabMembersFinance) tabMembersFinance.addEventListener('click', () => switchTab('finance'));

  // Cards do Hub
  if (btnHubGoMembers) btnHubGoMembers.addEventListener('click', () => switchTab('list'));
  if (btnHubGoFinance) btnHubGoFinance.addEventListener('click', () => switchTab('finance'));

  // Busca de Membros
  if (memberSearchInput) {
    memberSearchInput.addEventListener('input', () => {
      const val = memberSearchInput.value.trim();
      if (btnMemberSearchClear) btnMemberSearchClear.style.display = val ? 'block' : 'none';
      renderMembersList();
    });
  }

  if (btnMemberSearchClear) {
    btnMemberSearchClear.addEventListener('click', () => {
      if (memberSearchInput) {
        memberSearchInput.value = '';
        btnMemberSearchClear.style.display = 'none';
        memberSearchInput.focus();
        renderMembersList();
      }
    });
  }

  // Novo Cadastro de Membro
  if (btnOpenNewMemberModal) btnOpenNewMemberModal.addEventListener('click', () => openNewMemberModal());
  if (btnCloseNewMember) btnCloseNewMember.addEventListener('click', () => closeNewMemberModal());
  if (btnCancelNewMember) btnCancelNewMember.addEventListener('click', () => closeNewMemberModal());
  if (overlayNewMember) overlayNewMember.addEventListener('click', () => closeNewMemberModal());

  // Máscaras de telefone
  if (newMemberPhone) newMemberPhone.addEventListener('input', (e) => maskPhoneInput(e.target));
  if (editMemberPhone) editMemberPhone.addEventListener('input', (e) => maskPhoneInput(e.target));

  // Restrição numérica para códigos de 6 dígitos
  [newMemberCode, newMemberCodeConfirm, editMemberCode, editMemberCodeConfirm, inputMemberAccessCode, inputTreasuryCode].forEach((inp) => {
    if (inp) {
      inp.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
      });
    }
  });

  // Submissão do Novo Cadastro
  if (formNewMember) formNewMember.addEventListener('submit', handleNewMemberSubmit);

  // Modal Autenticação de Código do Membro
  if (btnCloseMemberCodeAuth) btnCloseMemberCodeAuth.addEventListener('click', closeMemberCodeAuthModal);
  if (btnCancelMemberCodeAuth) btnCancelMemberCodeAuth.addEventListener('click', closeMemberCodeAuthModal);
  if (overlayMemberCodeAuth) overlayMemberCodeAuth.addEventListener('click', closeMemberCodeAuthModal);
  if (formMemberCodeAuth) formMemberCodeAuth.addEventListener('submit', handleMemberCodeAuthSubmit);

  // Modal Detalhes do Membro
  if (btnCloseMemberDetails) btnCloseMemberDetails.addEventListener('click', closeMemberDetailsModal);
  if (overlayMemberDetails) overlayMemberDetails.addEventListener('click', closeMemberDetailsModal);
  if (btnEditMemberOpen) btnEditMemberOpen.addEventListener('click', openEditMemberModal);
  if (btnDeleteMember) btnDeleteMember.addEventListener('click', handleDeleteMember);

  // Modal Edição do Membro
  if (btnCloseEditMember) btnCloseEditMember.addEventListener('click', closeEditMemberModal);
  if (btnCancelEditMember) btnCancelEditMember.addEventListener('click', closeEditMemberModal);
  if (overlayEditMember) overlayEditMember.addEventListener('click', closeEditMemberModal);
  if (formEditMember) formEditMember.addEventListener('submit', handleEditMemberSubmit);

  // ================= Relatório Financeiro =================
  if (selectFinanceMonth) {
    selectFinanceMonth.value = String(selectedFinanceMonth);
    selectFinanceMonth.addEventListener('change', () => {
      selectedFinanceMonth = Number(selectFinanceMonth.value);
      renderFinancialView();
    });
  }

  if (selectFinanceYear) {
    selectFinanceYear.value = String(selectedFinanceYear);
    selectFinanceYear.addEventListener('change', () => {
      selectedFinanceYear = Number(selectFinanceYear.value);
      renderFinancialView();
    });
  }

  // Botão discreto no topo direito para a tesoureira
  if (btnTreasuryEdit) {
    btnTreasuryEdit.addEventListener('click', () => {
      if (isTreasuryUnlocked) {
        openTreasuryManageModal();
      } else {
        openTreasuryAuthModal();
      }
    });
  }

  // Modal Autenticação da Tesouraria
  if (btnCloseTreasuryAuth) btnCloseTreasuryAuth.addEventListener('click', closeTreasuryAuthModal);
  if (btnCancelTreasuryAuth) btnCancelTreasuryAuth.addEventListener('click', closeTreasuryAuthModal);
  if (overlayTreasuryAuth) overlayTreasuryAuth.addEventListener('click', closeTreasuryAuthModal);
  if (formTreasuryAuth) formTreasuryAuth.addEventListener('submit', handleTreasuryAuthSubmit);

  // Modal Gerenciamento Financeiro Completo da Tesouraria
  if (btnCloseTreasuryManage) btnCloseTreasuryManage.addEventListener('click', closeTreasuryManageModal);
  if (btnCancelTreasuryManage) btnCancelTreasuryManage.addEventListener('click', closeTreasuryManageModal);
  if (overlayTreasuryManage) overlayTreasuryManage.addEventListener('click', closeTreasuryManageModal);
  if (formTreasuryManage) formTreasuryManage.addEventListener('submit', handleTreasuryManageSubmit);

  if (btnAddTreasuryExit) btnAddTreasuryExit.addEventListener('click', handleAddExitFromModal);

  // Máscaras monetárias
  if (treasuryInputDizimos) treasuryInputDizimos.addEventListener('input', (e) => maskCurrencyInput(e.target));
  if (treasuryInputOfertas) treasuryInputOfertas.addEventListener('input', (e) => maskCurrencyInput(e.target));
  if (treasuryExitVal) treasuryExitVal.addEventListener('input', (e) => maskCurrencyInput(e.target));
}

/**
 * Renderização da Lista de Membros em Ordem Alfabética
 */
function renderMembersList() {
  if (!membersCardsContainer) return;

  const queryTerm = (memberSearchInput ? memberSearchInput.value : '').trim().toLowerCase();

  const sorted = [...membersList].sort((a, b) => {
    const nomeA = (a.nome || '').trim();
    const nomeB = (b.nome || '').trim();
    return nomeA.localeCompare(nomeB, 'pt-BR', { sensitivity: 'base' });
  });

  const filtered = sorted.filter((m) => {
    if (!queryTerm) return true;
    const nome = (m.nome || '').toLowerCase();
    const phone = (m.telefone || '').replace(/\D/g, '');
    return nome.includes(queryTerm) || phone.includes(queryTerm);
  });

  if (countMembersBadge) {
    countMembersBadge.textContent = String(membersList.length);
  }

  if (filtered.length === 0) {
    if (queryTerm) {
      membersCardsContainer.innerHTML = `
        <div class="members-empty-box">
          <p class="members-empty-title">Nenhum membro encontrado</p>
          <p class="members-empty-text">Nenhum resultado para "<strong>${escapeHtml(queryTerm)}</strong>".</p>
        </div>
      `;
    } else {
      membersCardsContainer.innerHTML = `
        <div class="members-empty-box">
          <p class="members-empty-title">Nenhum membro cadastrado</p>
          <p class="members-empty-text">Clique no botão <strong>+ Novo Cadastro</strong> acima para adicionar o primeiro membro.</p>
        </div>
      `;
    }
    return;
  }

  let html = '';
  filtered.forEach((member) => {
    const initials = getInitials(member.nome);
    html += `
      <div class="member-card-item" data-id="${member.id}" tabindex="0" role="button" aria-label="Acessar dados de ${escapeHtml(member.nome)}">
        <div class="member-card-avatar">${initials}</div>
        <div class="member-card-main">
          <h4 class="member-card-name">${escapeHtml(member.nome)}</h4>
          <div class="member-card-badge-row">
            <span class="member-badge-protected">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              Acesso Exclusivo (6 dígitos)
            </span>
            ${member.cargo ? `<span class="member-badge-role">${escapeHtml(member.cargo)}</span>` : ''}
          </div>
        </div>
        <div class="member-card-arrow">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </div>
      </div>
    `;
  });

  membersCardsContainer.innerHTML = html;

  membersCardsContainer.querySelectorAll('.member-card-item').forEach((card) => {
    const id = card.getAttribute('data-id');
    const member = membersList.find((m) => m.id === id);
    if (!member) return;

    const handleSelect = () => openMemberCodeAuthModal(member);
    card.addEventListener('click', handleSelect);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleSelect();
      }
    });
  });
}

/**
 * Autenticação por Código de 6 dígitos ao clicar no membro
 */
function openMemberCodeAuthModal(member) {
  currentSelectedMember = member;
  isAdminUnlocked = false;

  if (memberCodeAuthTitle) {
    memberCodeAuthTitle.textContent = `Acesso: ${member.nome.split(' ')[0]}`;
  }
  if (memberCodeAuthDesc) {
    memberCodeAuthDesc.innerHTML = `Digite o código exclusivo de 6 dígitos de <strong>${escapeHtml(member.nome)}</strong> (ou o código de administrador) para visualizar os dados:`;
  }
  if (memberCodeAuthErrorMsg) {
    memberCodeAuthErrorMsg.style.display = 'none';
  }
  if (inputMemberAccessCode) {
    inputMemberAccessCode.value = '';
  }

  if (modalMemberCodeAuth) {
    modalMemberCodeAuth.classList.add('is-open');
    modalMemberCodeAuth.setAttribute('aria-hidden', 'false');
    setTimeout(() => {
      if (inputMemberAccessCode) inputMemberAccessCode.focus();
    }, 150);
  }
}

function closeMemberCodeAuthModal() {
  if (modalMemberCodeAuth) {
    modalMemberCodeAuth.classList.remove('is-open');
    modalMemberCodeAuth.setAttribute('aria-hidden', 'true');
  }
}

function handleMemberCodeAuthSubmit(e) {
  if (e) e.preventDefault();
  if (!currentSelectedMember) return;

  const codeEntered = (inputMemberAccessCode ? inputMemberAccessCode.value : '').trim();
  const memberCode = (currentSelectedMember.codigo || '').trim();

  const isOwner = codeEntered.length === 6 && codeEntered === memberCode;
  const isAdmin = codeEntered === ADMIN_CODE;

  if (isOwner || isAdmin) {
    isAdminUnlocked = isAdmin;
    closeMemberCodeAuthModal();
    openMemberDetailsModal(currentSelectedMember, isAdmin);
  } else {
    if (memberCodeAuthErrorMsg) {
      memberCodeAuthErrorMsg.style.display = 'block';
      memberCodeAuthErrorMsg.textContent = 'Código incorreto. Acesso restrito ao próprio membro ou à tesouraria autorizada.';
    }
  }
}

/**
 * Visualização Completa dos Dados do Membro
 */
function openMemberDetailsModal(member, isAdmin = false) {
  currentSelectedMember = member;

  if (memberDetailsAvatar) memberDetailsAvatar.textContent = getInitials(member.nome);
  if (memberDetailsName) memberDetailsName.textContent = member.nome || '';
  if (memberDetailsRole) memberDetailsRole.textContent = member.cargo || 'Membro';

  if (btnDeleteMember) {
    btnDeleteMember.style.display = isAdmin ? 'inline-block' : 'none';
  }

  if (memberDetailsFields) {
    const rawDigits = (member.telefone || '').replace(/\D/g, '');
    const cleanPhone = rawDigits.startsWith('55') ? rawDigits : `55${rawDigits}`;
    const whatsappLink = `https://wa.me/${cleanPhone}`;

    let birthFormatted = 'Não informada';
    if (member.nascimento) {
      const parts = member.nascimento.split('-');
      if (parts.length === 3) {
        birthFormatted = `${parts[2]}/${parts[1]}/${parts[0]}`;
      } else {
        birthFormatted = member.nascimento;
      }
    }

    const contribs = Array.isArray(member.contribuicoes) ? [...member.contribuicoes] : [];
    // Ordena do mais recente para o mais antigo pela data de envio
    contribs.sort((a, b) => (b.dataEnvio || '').localeCompare(a.dataEnvio || ''));
    const totalMemberContrib = contribs.reduce((sum, c) => sum + (Number(c.dizimo) || 0) + (Number(c.oferta) || 0), 0);
    const todayISO = new Date().toISOString().split('T')[0];

    memberDetailsFields.innerHTML = `
      <div class="member-detail-row">
        <span class="detail-label">Telefone / WhatsApp</span>
        <div class="detail-val-with-action">
          <span class="detail-val">${escapeHtml(member.telefone || 'Não informado')}</span>
          ${rawDigits.length >= 10 ? `
            <a href="${whatsappLink}" target="_blank" rel="noopener" class="btn-detail-whatsapp" title="Abrir no WhatsApp">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
              </svg>
              WhatsApp
            </a>
          ` : ''}
        </div>
      </div>

      <div class="member-detail-row">
        <span class="detail-label">Data de Nascimento</span>
        <span class="detail-val">${escapeHtml(birthFormatted)}</span>
      </div>

      <div class="member-detail-row">
        <span class="detail-label">Endereço / Bairro</span>
        <span class="detail-val">${escapeHtml(member.endereco || 'Não informado')}</span>
      </div>

      <div class="member-detail-row">
        <span class="detail-label">E-mail</span>
        <span class="detail-val">${escapeHtml(member.email || 'Não informado')}</span>
      </div>

      <div class="member-detail-row">
        <span class="detail-label">Código de Acesso</span>
        <div class="detail-val-with-action">
          <span class="detail-val" id="detailSecretCode">••••••</span>
          <button type="button" class="btn-toggle-code" id="btnToggleSecretCode" title="Mostrar/Ocultar Código">
            Ver Código
          </button>
        </div>
      </div>

      ${isAdmin ? `
        <div class="member-admin-notice">
          <span class="badge-admin">🔒 Acesso da Tesouraria / ADM</span>
          <p>Você pode editar dados e registrar dízimos e ofertas deste membro abaixo.</p>
        </div>

        <!-- Formulário da Tesouraria para Lançamento de Dízimo e Oferta -->
        <div class="member-treasury-contrib-box">
          <div class="contrib-box-header">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7dd3fc" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="1" x2="12" y2="23"></line>
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
            </svg>
            <span>Lançar Contribuição</span>
          </div>
          <p class="contrib-box-hint">Informe os valores de dízimo e oferta com a data do envio:</p>
          
          <div class="form-row-2col">
            <div class="form-group">
              <label for="inputMemberContribDizimo">Dízimo (R$)</label>
              <input type="text" id="inputMemberContribDizimo" placeholder="0,00" inputmode="decimal">
            </div>
            <div class="form-group">
              <label for="inputMemberContribOferta">Oferta (R$)</label>
              <input type="text" id="inputMemberContribOferta" placeholder="0,00" inputmode="decimal">
            </div>
          </div>

          <div class="form-group" style="margin-top: 6px;">
            <label for="inputMemberContribDate">Data do Envio *</label>
            <input type="date" id="inputMemberContribDate" value="${todayISO}" required>
          </div>

          <div style="margin-top: 10px; display: flex; justify-content: flex-end;">
            <button type="button" class="btn-save-member-contrib" id="btnSaveMemberContrib">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                <polyline points="7 3 7 8 15 8"></polyline>
              </svg>
              Salvar Envio
            </button>
          </div>
        </div>
      ` : ''}

      <!-- Histórico de Contribuições do Membro -->
      <div class="member-contrib-history">
        <div class="history-title-row">
          <span class="history-title">Histórico de Envios</span>
          <span class="history-total">Total: ${formatCurrency(totalMemberContrib)}</span>
        </div>
        <div class="history-list">
          ${contribs.length === 0 ? `
            <div class="history-empty">Nenhuma contribuição registrada ainda.</div>
          ` : contribs.map((c) => {
            const sumRow = (Number(c.dizimo) || 0) + (Number(c.oferta) || 0);
            let dateStr = c.dataEnvio || '';
            const p = dateStr.split('-');
            if (p.length === 3) dateStr = `${p[2]}/${p[1]}/${p[0]}`;
            return `
              <div class="history-item">
                <div class="history-item-date">${escapeHtml(dateStr)}</div>
                <div class="history-item-details">
                  <div class="history-item-sub">
                    ${Number(c.dizimo) > 0 ? `Dízimo: <strong>${formatCurrency(c.dizimo)}</strong>` : ''}
                    ${Number(c.dizimo) > 0 && Number(c.oferta) > 0 ? ' • ' : ''}
                    ${Number(c.oferta) > 0 ? `Oferta: <strong>${formatCurrency(c.oferta)}</strong>` : ''}
                  </div>
                  <div class="history-item-total">Total: ${formatCurrency(sumRow)}</div>
                </div>
                ${isAdmin ? `
                  <button type="button" class="btn-del-contrib" data-contrib-id="${escapeHtml(c.id)}" title="Excluir este lançamento">✕</button>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    // Toggle para visualizar o código secreto
    const btnToggle = memberDetailsFields.querySelector('#btnToggleSecretCode');
    const spanSecret = memberDetailsFields.querySelector('#detailSecretCode');
    if (btnToggle && spanSecret) {
      let shown = false;
      btnToggle.addEventListener('click', () => {
        shown = !shown;
        spanSecret.textContent = shown ? (member.codigo || '000000') : '••••••';
        btnToggle.textContent = shown ? 'Ocultar' : 'Ver Código';
      });
    }

    // Ações de Tesouraria (Salvar Contribuição)
    const btnSaveContrib = memberDetailsFields.querySelector('#btnSaveMemberContrib');
    if (btnSaveContrib) {
      const inDizimo = memberDetailsFields.querySelector('#inputMemberContribDizimo');
      const inOferta = memberDetailsFields.querySelector('#inputMemberContribOferta');
      const inDate = memberDetailsFields.querySelector('#inputMemberContribDate');

      if (inDizimo) inDizimo.addEventListener('input', (e) => maskCurrencyInput(e.target));
      if (inOferta) inOferta.addEventListener('input', (e) => maskCurrencyInput(e.target));

      btnSaveContrib.addEventListener('click', async () => {
        const dizimoVal = parseCurrency(inDizimo ? inDizimo.value : '0');
        const ofertaVal = parseCurrency(inOferta ? inOferta.value : '0');
        const dateVal = (inDate && inDate.value) ? inDate.value.trim() : todayISO;

        if (dizimoVal <= 0 && ofertaVal <= 0) {
          alert('Por favor, informe ao menos o valor do dízimo ou da oferta.');
          return;
        }

        const newContrib = {
          id: 'contrib_' + Date.now(),
          dizimo: dizimoVal,
          oferta: ofertaVal,
          dataEnvio: dateVal,
          createdAt: new Date().toISOString()
        };

        const updatedContribs = Array.isArray(member.contribuicoes) ? [...member.contribuicoes, newContrib] : [newContrib];
        member.contribuicoes = updatedContribs;

        try {
          const docRef = doc(db, 'membros', member.id);
          await updateDoc(docRef, {
            contribuicoes: updatedContribs,
            updatedAt: serverTimestamp()
          });
        } catch (err) {
          console.warn('Erro ao salvar contribuição no Firestore:', err);
        }

        const idx = membersList.findIndex((m) => m.id === member.id);
        if (idx !== -1) {
          membersList[idx] = { ...membersList[idx], contribuicoes: updatedContribs };
          try {
            localStorage.setItem(STORAGE_MEMBERS_KEY, JSON.stringify(membersList));
          } catch (_) {}
          currentSelectedMember = membersList[idx];
        }

        showToastAlert('Contribuição registrada com sucesso!');
        openMemberDetailsModal(currentSelectedMember, isAdmin);
      });
    }

    // Ações de Tesouraria (Excluir Contribuição)
    const delBtns = memberDetailsFields.querySelectorAll('.btn-del-contrib');
    delBtns.forEach((btn) => {
      btn.addEventListener('click', async () => {
        const contribId = btn.getAttribute('data-contrib-id');
        if (!contribId) return;
        if (!confirm('Deseja excluir este registro de contribuição?')) return;

        const updatedContribs = (member.contribuicoes || []).filter((c) => c.id !== contribId);
        member.contribuicoes = updatedContribs;

        try {
          const docRef = doc(db, 'membros', member.id);
          await updateDoc(docRef, {
            contribuicoes: updatedContribs,
            updatedAt: serverTimestamp()
          });
        } catch (err) {
          console.warn('Erro ao excluir contribuição no Firestore:', err);
        }

        const idx = membersList.findIndex((m) => m.id === member.id);
        if (idx !== -1) {
          membersList[idx] = { ...membersList[idx], contribuicoes: updatedContribs };
          try {
            localStorage.setItem(STORAGE_MEMBERS_KEY, JSON.stringify(membersList));
          } catch (_) {}
          currentSelectedMember = membersList[idx];
        }

        showToastAlert('Lançamento excluído com sucesso.');
        openMemberDetailsModal(currentSelectedMember, isAdmin);
      });
    });
  }

  if (modalMemberDetails) {
    modalMemberDetails.classList.add('is-open');
    modalMemberDetails.setAttribute('aria-hidden', 'false');
  }
}

function closeMemberDetailsModal() {
  if (modalMemberDetails) {
    modalMemberDetails.classList.remove('is-open');
    modalMemberDetails.setAttribute('aria-hidden', 'true');
  }
}

/**
 * Cadastro de Novo Membro
 */
function openNewMemberModal() {
  if (formNewMember) formNewMember.reset();
  if (newMemberRole) newMemberRole.value = 'Membro';
  if (newMemberCodeErrorMsg) newMemberCodeErrorMsg.style.display = 'none';

  if (modalNewMember) {
    modalNewMember.classList.add('is-open');
    modalNewMember.setAttribute('aria-hidden', 'false');
    setTimeout(() => {
      if (newMemberName) newMemberName.focus();
    }, 150);
  }
}

function closeNewMemberModal() {
  if (modalNewMember) {
    modalNewMember.classList.remove('is-open');
    modalNewMember.setAttribute('aria-hidden', 'true');
  }
}

async function handleNewMemberSubmit(e) {
  if (e) e.preventDefault();

  const nome = (newMemberName ? newMemberName.value : '').trim();
  const telefone = (newMemberPhone ? newMemberPhone.value : '').trim();
  const nascimento = (newMemberBirth ? newMemberBirth.value : '').trim();
  const endereco = (newMemberAddress ? newMemberAddress.value : '').trim();
  const email = (newMemberEmail ? newMemberEmail.value : '').trim();
  const cargo = (newMemberRole ? newMemberRole.value : '').trim() || 'Membro';
  const code = (newMemberCode ? newMemberCode.value : '').trim();
  const codeConfirm = (newMemberCodeConfirm ? newMemberCodeConfirm.value : '').trim();

  if (!/^\d{6}$/.test(code)) {
    if (newMemberCodeErrorMsg) {
      newMemberCodeErrorMsg.style.display = 'block';
      newMemberCodeErrorMsg.textContent = 'O código deve conter exatamente 6 dígitos numéricos.';
    }
    return;
  }

  if (code !== codeConfirm) {
    if (newMemberCodeErrorMsg) {
      newMemberCodeErrorMsg.style.display = 'block';
      newMemberCodeErrorMsg.textContent = 'A confirmação do código não coincide. Digite o mesmo código de 6 dígitos.';
    }
    return;
  }

  if (newMemberCodeErrorMsg) newMemberCodeErrorMsg.style.display = 'none';

  const memberPayload = {
    nome,
    telefone,
    nascimento,
    endereco,
    email,
    cargo,
    codigo: code,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  try {
    const docRef = await addDoc(collection(db, 'membros'), memberPayload);
    const localObj = { id: docRef.id, ...memberPayload, createdAt: new Date().toISOString() };
    membersList.push(localObj);
    localStorage.setItem(STORAGE_MEMBERS_KEY, JSON.stringify(membersList));
    renderMembersList();
    closeNewMemberModal();
    showToastAlert('Membro cadastrado com sucesso!');
  } catch (err) {
    console.error('Erro ao salvar membro no Firestore:', err);
    const localId = 'm_' + Date.now();
    const localObj = { id: localId, ...memberPayload, createdAt: new Date().toISOString() };
    membersList.push(localObj);
    localStorage.setItem(STORAGE_MEMBERS_KEY, JSON.stringify(membersList));
    renderMembersList();
    closeNewMemberModal();
    showToastAlert('Membro cadastrado (modo offline salvo localmente)!');
  }
}

/**
 * Edição de Dados do Membro
 */
function openEditMemberModal() {
  if (!currentSelectedMember) return;
  closeMemberDetailsModal();

  if (editMemberId) editMemberId.value = currentSelectedMember.id;
  if (editMemberName) editMemberName.value = currentSelectedMember.nome || '';
  if (editMemberPhone) editMemberPhone.value = currentSelectedMember.telefone || '';
  if (editMemberBirth) editMemberBirth.value = currentSelectedMember.nascimento || '';
  if (editMemberAddress) editMemberAddress.value = currentSelectedMember.endereco || '';
  if (editMemberEmail) editMemberEmail.value = currentSelectedMember.email || '';
  if (editMemberRole) editMemberRole.value = currentSelectedMember.cargo || 'Membro';
  if (editMemberCode) editMemberCode.value = '';
  if (editMemberCodeConfirm) editMemberCodeConfirm.value = '';
  if (editMemberCodeErrorMsg) editMemberCodeErrorMsg.style.display = 'none';

  if (modalEditMember) {
    modalEditMember.classList.add('is-open');
    modalEditMember.setAttribute('aria-hidden', 'false');
    setTimeout(() => {
      if (editMemberName) editMemberName.focus();
    }, 150);
  }
}

function closeEditMemberModal() {
  if (modalEditMember) {
    modalEditMember.classList.remove('is-open');
    modalEditMember.setAttribute('aria-hidden', 'true');
  }
}

async function handleEditMemberSubmit(e) {
  if (e) e.preventDefault();
  if (!currentSelectedMember) return;

  const id = editMemberId ? editMemberId.value : currentSelectedMember.id;
  const nome = (editMemberName ? editMemberName.value : '').trim();
  const telefone = (editMemberPhone ? editMemberPhone.value : '').trim();
  const nascimento = (editMemberBirth ? editMemberBirth.value : '').trim();
  const endereco = (editMemberAddress ? editMemberAddress.value : '').trim();
  const email = (editMemberEmail ? editMemberEmail.value : '').trim();
  const cargo = (editMemberRole ? editMemberRole.value : '').trim() || 'Membro';
  const newCode = (editMemberCode ? editMemberCode.value : '').trim();
  const newCodeConfirm = (editMemberCodeConfirm ? editMemberCodeConfirm.value : '').trim();

  let finalCode = currentSelectedMember.codigo;
  if (newCode || newCodeConfirm) {
    if (!/^\d{6}$/.test(newCode)) {
      if (editMemberCodeErrorMsg) {
        editMemberCodeErrorMsg.style.display = 'block';
        editMemberCodeErrorMsg.textContent = 'O novo código deve possuir exatamente 6 dígitos numéricos.';
      }
      return;
    }
    if (newCode !== newCodeConfirm) {
      if (editMemberCodeErrorMsg) {
        editMemberCodeErrorMsg.style.display = 'block';
        editMemberCodeErrorMsg.textContent = 'Os códigos não coincidem.';
      }
      return;
    }
    finalCode = newCode;
  }

  const updatedData = {
    nome,
    telefone,
    nascimento,
    endereco,
    email,
    cargo,
    codigo: finalCode,
    updatedAt: serverTimestamp()
  };

  try {
    const docRef = doc(db, 'membros', id);
    await updateDoc(docRef, updatedData);
  } catch (err) {
    console.warn('Erro ao atualizar membro no Firestore:', err);
  }

  const idx = membersList.findIndex((m) => m.id === id);
  if (idx !== -1) {
    membersList[idx] = { ...membersList[idx], ...updatedData, codigo: finalCode };
    localStorage.setItem(STORAGE_MEMBERS_KEY, JSON.stringify(membersList));
    currentSelectedMember = membersList[idx];
  }

  renderMembersList();
  closeEditMemberModal();
  openMemberDetailsModal(currentSelectedMember, isAdminUnlocked);
  showToastAlert('Dados atualizados com sucesso!');
}

/**
 * Exclusão de Membro (Restrito ao ADM com 010101)
 */
async function handleDeleteMember() {
  if (!currentSelectedMember) return;
  if (!isAdminUnlocked) {
    alert('Apenas a administração ou tesouraria autorizada pode excluir registros de membros.');
    return;
  }

  const confirmDelete = window.confirm(`Deseja realmente excluir o cadastro de ${currentSelectedMember.nome}? Esta ação não pode ser desfeita.`);
  if (!confirmDelete) return;

  const id = currentSelectedMember.id;
  try {
    await deleteDoc(doc(db, 'membros', id));
  } catch (err) {
    console.warn('Erro ao excluir membro no Firestore:', err);
  }

  membersList = membersList.filter((m) => m.id !== id);
  localStorage.setItem(STORAGE_MEMBERS_KEY, JSON.stringify(membersList));

  closeMemberDetailsModal();
  renderMembersList();
  showToastAlert('Membro excluído com sucesso.');
}

// =========================================================================
// RELATÓRIO FINANCEIRO (Dízimos e Ofertas separados, Saídas separadas + Total)
// =========================================================================

function getPeriodKey(year, month) {
  const mm = String(month).padStart(2, '0');
  return `${year}-${mm}`;
}

const MONTH_NAMES = [
  '',
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

/**
 * Renderiza o Relatório Financeiro sem rolagem na tela
 */
function renderFinancialView() {
  const key = getPeriodKey(selectedFinanceYear, selectedFinanceMonth);
  const monthName = MONTH_NAMES[selectedFinanceMonth] || '';

  if (financeSummaryPeriod) {
    financeSummaryPeriod.textContent = `${monthName} de ${selectedFinanceYear}`;
  }

  const report = financialReports[key] || {
    ano: selectedFinanceYear,
    mes: selectedFinanceMonth,
    dizimos: 0,
    ofertas: 0,
    totalEntradas: 0,
    saidas: [],
    totalSaidas: 0,
    saldoGeral: 0
  };

  // Valores de Entradas (Dízimos e Ofertas separados)
  const dizimos = Number(report.dizimos) || 0;
  const ofertas = Number(report.ofertas) || 0;
  let totalEntradas = report.totalEntradas !== undefined ? Number(report.totalEntradas) : (dizimos + ofertas);
  if (totalEntradas === 0 && (dizimos > 0 || ofertas > 0)) {
    totalEntradas = dizimos + ofertas;
  }

  // Lista de Saídas
  const saidas = Array.isArray(report.saidas) ? report.saidas : [];
  let totalSaidas = 0;
  if (saidas.length > 0) {
    totalSaidas = saidas.reduce((acc, cur) => acc + (Number(cur.valor) || 0), 0);
  } else if (report.totalSaidas !== undefined) {
    totalSaidas = Number(report.totalSaidas) || 0;
  }

  // Saldo Geral Líquido
  const saldoGeral = totalEntradas - totalSaidas;

  // Atualiza elementos no DOM
  if (financeTotalEntries) financeTotalEntries.textContent = formatCurrency(totalEntradas);
  if (financeDizimosValue) financeDizimosValue.textContent = formatCurrency(dizimos);
  if (financeOfertasValue) financeOfertasValue.textContent = formatCurrency(ofertas);
  if (financeTotalExits) financeTotalExits.textContent = formatCurrency(totalSaidas);

  if (financeBalanceValue) {
    financeBalanceValue.textContent = formatCurrency(saldoGeral);
    if (saldoGeral < 0) {
      financeBalanceValue.classList.add('val-negative');
      financeBalanceValue.classList.remove('val-positive');
    } else {
      financeBalanceValue.classList.add('val-positive');
      financeBalanceValue.classList.remove('val-negative');
    }
  }

  // Renderiza a lista de saídas descritas separadamente
  if (financeExitsList) {
    if (saidas.length === 0) {
      financeExitsList.innerHTML = `
        <div class="finance-exit-empty">
          <span>Nenhuma saída registrada neste período.</span>
        </div>
      `;
    } else {
      let exitsHtml = '';
      saidas.forEach((item) => {
        exitsHtml += `
          <div class="finance-exit-row">
            <span class="finance-exit-bullet">•</span>
            <span class="finance-exit-desc" title="${escapeHtml(item.descricao)}">${escapeHtml(item.descricao)}</span>
            <span class="finance-exit-val">${formatCurrency(item.valor)}</span>
          </div>
        `;
      });
      financeExitsList.innerHTML = exitsHtml;
    }
  }

  // Botão discreto no topo direito destaca se tesouraria estiver logada
  if (btnTreasuryEdit) {
    btnTreasuryEdit.classList.toggle('is-unlocked', isTreasuryUnlocked);
  }
}

/**
 * Autenticação da Tesoureira (Código 010101)
 */
function openTreasuryAuthModal() {
  if (treasuryAuthErrorMsg) treasuryAuthErrorMsg.style.display = 'none';
  if (inputTreasuryCode) inputTreasuryCode.value = '';

  if (modalTreasuryAuth) {
    modalTreasuryAuth.classList.add('is-open');
    modalTreasuryAuth.setAttribute('aria-hidden', 'false');
    setTimeout(() => {
      if (inputTreasuryCode) inputTreasuryCode.focus();
    }, 150);
  }
}

function closeTreasuryAuthModal() {
  if (modalTreasuryAuth) {
    modalTreasuryAuth.classList.remove('is-open');
    modalTreasuryAuth.setAttribute('aria-hidden', 'true');
  }
}

function handleTreasuryAuthSubmit(e) {
  if (e) e.preventDefault();
  const entered = (inputTreasuryCode ? inputTreasuryCode.value : '').trim();

  if (entered === TREASURY_CODE) {
    isTreasuryUnlocked = true;
    try {
      sessionStorage.setItem('cbna_treasury_unlocked', 'true');
    } catch (_) {}
    closeTreasuryAuthModal();
    openTreasuryManageModal();
    showToastAlert('Acesso da Tesouraria liberado!');
  } else {
    if (treasuryAuthErrorMsg) {
      treasuryAuthErrorMsg.style.display = 'block';
      treasuryAuthErrorMsg.textContent = 'Código incorreto. Acesso restrito à tesouraria autorizada.';
    }
  }
}

/**
 * Modal de Gerenciamento Financeiro Completo da Tesoureira
 */
function openTreasuryManageModal() {
  const key = getPeriodKey(selectedFinanceYear, selectedFinanceMonth);
  const monthName = MONTH_NAMES[selectedFinanceMonth] || '';
  const report = financialReports[key] || {
    ano: selectedFinanceYear,
    mes: selectedFinanceMonth,
    dizimos: 0,
    ofertas: 0,
    saidas: []
  };

  if (treasuryManageModalTitle) {
    treasuryManageModalTitle.textContent = `Editar Finanças — ${monthName}/${selectedFinanceYear}`;
  }

  if (treasuryInputDizimos) {
    treasuryInputDizimos.value = (Number(report.dizimos) || 0) > 0 
      ? formatCurrency(report.dizimos).replace('R$', '').trim() 
      : '';
  }

  if (treasuryInputOfertas) {
    treasuryInputOfertas.value = (Number(report.ofertas) || 0) > 0 
      ? formatCurrency(report.ofertas).replace('R$', '').trim() 
      : '';
  }

  if (treasuryExitDesc) treasuryExitDesc.value = '';
  if (treasuryExitVal) treasuryExitVal.value = '';

  tempEditingSaidas = Array.isArray(report.saidas) ? JSON.parse(JSON.stringify(report.saidas)) : [];
  renderTempEditingSaidas();

  if (modalTreasuryManage) {
    modalTreasuryManage.classList.add('is-open');
    modalTreasuryManage.setAttribute('aria-hidden', 'false');
  }
}

function closeTreasuryManageModal() {
  if (modalTreasuryManage) {
    modalTreasuryManage.classList.remove('is-open');
    modalTreasuryManage.setAttribute('aria-hidden', 'true');
  }
}

function renderTempEditingSaidas() {
  if (!treasuryManageExitsList) return;

  const total = tempEditingSaidas.reduce((acc, cur) => acc + (Number(cur.valor) || 0), 0);
  if (treasuryManageExitsSum) {
    treasuryManageExitsSum.textContent = formatCurrency(total);
  }

  if (tempEditingSaidas.length === 0) {
    treasuryManageExitsList.innerHTML = `
      <div style="padding: 8px; text-align: center; color: #94a3b8; font-size: 0.74rem;">
        Nenhuma saída adicionada para este mês.
      </div>
    `;
    return;
  }

  let html = '';
  tempEditingSaidas.forEach((item, index) => {
    html += `
      <div class="treasury-exit-edit-item" data-index="${index}">
        <span class="treasury-exit-edit-desc">${escapeHtml(item.descricao)}</span>
        <div style="display: flex; align-items: center; gap: 8px;">
          <strong class="treasury-exit-edit-val">${formatCurrency(item.valor)}</strong>
          <button type="button" class="btn-remove-temp-exit" data-index="${index}" title="Remover saída">✕</button>
        </div>
      </div>
    `;
  });

  treasuryManageExitsList.innerHTML = html;

  treasuryManageExitsList.querySelectorAll('.btn-remove-temp-exit').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const idx = Number(btn.getAttribute('data-index'));
      tempEditingSaidas.splice(idx, 1);
      renderTempEditingSaidas();
    });
  });
}

function handleAddExitFromModal() {
  const desc = (treasuryExitDesc ? treasuryExitDesc.value : '').trim();
  const rawVal = (treasuryExitVal ? treasuryExitVal.value : '').trim();
  const valor = parseCurrency(rawVal);

  if (!desc) {
    alert('Informe a descrição da saída (ex: Energia, Água, Missões...).');
    if (treasuryExitDesc) treasuryExitDesc.focus();
    return;
  }

  if (isNaN(valor) || valor <= 0) {
    alert('Informe um valor válido para a saída.');
    if (treasuryExitVal) treasuryExitVal.focus();
    return;
  }

  tempEditingSaidas.push({
    id: 's_' + Date.now(),
    descricao: desc,
    valor
  });

  if (treasuryExitDesc) treasuryExitDesc.value = '';
  if (treasuryExitVal) treasuryExitVal.value = '';
  renderTempEditingSaidas();
  if (treasuryExitDesc) treasuryExitDesc.focus();
}

async function handleTreasuryManageSubmit(e) {
  if (e) e.preventDefault();

  const dizimos = parseCurrency(treasuryInputDizimos ? treasuryInputDizimos.value : '0');
  const ofertas = parseCurrency(treasuryInputOfertas ? treasuryInputOfertas.value : '0');
  const totalEntradas = dizimos + ofertas;
  const totalSaidas = tempEditingSaidas.reduce((acc, cur) => acc + (Number(cur.valor) || 0), 0);
  const saldoGeral = totalEntradas - totalSaidas;

  const key = getPeriodKey(selectedFinanceYear, selectedFinanceMonth);

  const payload = {
    ano: selectedFinanceYear,
    mes: selectedFinanceMonth,
    dizimos,
    ofertas,
    totalEntradas,
    saidas: tempEditingSaidas,
    totalSaidas,
    saldoGeral,
    valorTotal: saldoGeral,
    updatedAt: serverTimestamp()
  };

  try {
    const docRef = doc(db, 'relatorios_financeiros', key);
    await setDoc(docRef, payload, { merge: true });
  } catch (err) {
    console.warn('Erro ao salvar relatório financeiro no Firestore:', err);
  }

  financialReports[key] = { ...payload, saidas: tempEditingSaidas };
  localStorage.setItem(STORAGE_FINANCE_KEY, JSON.stringify(financialReports));

  renderFinancialView();
  closeTreasuryManageModal();
  showToastAlert('Relatório financeiro atualizado com sucesso!');
}

// =========================================================================
// UTILITÁRIOS
// =========================================================================

function getInitials(name = '') {
  if (!name) return 'M';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function maskPhoneInput(input) {
  if (!input) return;
  let v = input.value.replace(/\D/g, '').slice(0, 11);
  if (v.length > 10) {
    input.value = `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
  } else if (v.length > 6) {
    input.value = `(${v.slice(0, 2)}) ${v.slice(2, 6)}-${v.slice(6)}`;
  } else if (v.length > 2) {
    input.value = `(${v.slice(0, 2)}) ${v.slice(2)}`;
  } else if (v.length > 0) {
    input.value = `(${v}`;
  } else {
    input.value = '';
  }
}

function maskCurrencyInput(input) {
  if (!input) return;
  let v = input.value.replace(/\D/g, '');
  if (!v) {
    input.value = '';
    return;
  }
  const num = (parseInt(v, 10) / 100).toFixed(2);
  const parts = num.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  input.value = parts.join(',');
}

function formatCurrency(val) {
  const n = Number(val) || 0;
  return n.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function parseCurrency(str = '') {
  if (!str) return 0;
  const clean = String(str).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToastAlert(message) {
  let toast = document.getElementById('appToastAlert');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'appToastAlert';
    toast.className = 'app-toast-alert';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('is-visible');
  setTimeout(() => {
    toast.classList.remove('is-visible');
  }, 3000);
}
