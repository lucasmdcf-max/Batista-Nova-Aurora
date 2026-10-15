/**
 * Gestão dos Pedidos de Oração com Sincronização Cloud Firestore
 * Congregação Batista Nova Aurora
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

// Cache inicial para exibição instantânea e suporte offline
const STORAGE_KEY = 'nova_aurora_pedidos_oracao_v2';
const initialFallback = [
  {
    id: 'init-1',
    nome: 'Maria Silva',
    pedido: 'Por favor, orem pela recuperação de saúde da minha mãe que está internada.\nPedimos que Deus dê sabedoria aos médicos e fortaleça toda a nossa família.',
    status: 'respondido',
    resposta: 'Graças a Deus ela teve alta hospitalar ontem e já está em casa se recuperando bem! Louvado seja o Senhor pelas orações.',
    data: '08/10/2026',
    timestamp: Date.now() - 3600000
  },
  {
    id: 'init-2',
    nome: 'Carlos Eduardo',
    pedido: 'Pedido de oração por uma direção profissional e abertura de portas de emprego.\nQue seja feita a vontade do Senhor.',
    status: 'em_oracao',
    resposta: '',
    data: '07/10/2026',
    timestamp: Date.now() - 86400000
  },
  {
    id: 'init-3',
    nome: 'Ana Paula',
    pedido: 'Agradecimento e oração contínua pela saúde do meu filho recém-nascido.\nDeus tem sido fiel em todos os momentos.',
    status: 'respondido',
    resposta: 'Os exames deram todos normais e o bebê está crescendo forte e saudável! Glória a Deus.',
    data: '05/10/2026',
    timestamp: Date.now() - 259200000
  }
];

let prayerList = [];
let currentViewPrayerId = null;
let currentTab = 'pending'; // 'pending' | 'answered'
let currentDeleteTargetId = null;
const ADMIN_PASSWORD = 'CBNA.adm';

function loadLocalCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Erro ao ler cache de pedidos:', e);
  }
  return initialFallback;
}

function saveLocalCache(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn('Erro ao salvar cache de pedidos:', e);
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

function getFirstLine(text) {
  if (!text) return '';
  const first = text.split(/\r?\n/)[0].trim();
  return first || text;
}

// Atualiza os contadores: "Em oração" e "Respondidos" e o estado das abas
function updateCounters() {
  const countPendingEl = document.getElementById('countPending');
  const countAnsweredEl = document.getElementById('countAnswered');
  const tabPendingEl = document.getElementById('tabPending');
  const tabAnsweredEl = document.getElementById('tabAnswered');

  const pending = prayerList.filter((p) => p.status !== 'respondido').length;
  const answered = prayerList.filter((p) => p.status === 'respondido').length;

  if (countPendingEl) countPendingEl.textContent = pending;
  if (countAnsweredEl) countAnsweredEl.textContent = answered;

  if (tabPendingEl && tabAnsweredEl) {
    if (currentTab === 'pending') {
      tabPendingEl.classList.add('is-active');
      tabAnsweredEl.classList.remove('is-active');
    } else {
      tabAnsweredEl.classList.add('is-active');
      tabPendingEl.classList.remove('is-active');
    }
  }
}

// Renderiza a lista de pedidos filtrando pela aba atual ('pending' ou 'answered')
function renderPrayerList() {
  const container = document.getElementById('prayerListContainer');
  if (!container) return;

  updateCounters();

  const isAnsweredTab = currentTab === 'answered';
  const filtered = prayerList.filter((p) => isAnsweredTab ? p.status === 'respondido' : p.status !== 'respondido');

  if (filtered.length === 0) {
    if (isAnsweredTab) {
      container.innerHTML = `
        <div class="prayer-empty-state">
          <p>Nenhum pedido respondido ainda.</p>
          <p class="prayer-empty-sub">Quando uma oração for marcada como respondida, ela será movida para cá como testemunho de fé.</p>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div class="prayer-empty-state">
          <p>Nenhum pedido de oração em andamento.</p>
          <p class="prayer-empty-sub">Clique no botão <strong>+</strong> no topo para registrar um novo pedido.</p>
        </div>
      `;
    }
    return;
  }

  // Ordena os mais recentes primeiro
  const sorted = [...filtered].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  let html = '';
  sorted.forEach((item) => {
    const firstLine = getFirstLine(item.pedido);

    if (isAnsweredTab) {
      // Lista de respondidos: exibe o botão de excluir ao lado de cada pedido
      html += `
        <div class="prayer-row-item" data-id="${item.id}">
          <div class="prayer-card-box" data-action="view" data-id="${item.id}" role="button" tabindex="0" title="Clique para ler o testemunho completo">
            <div class="prayer-first-line">${escapeHtml(firstLine)}</div>
            <div class="prayer-sub-row">
              <span class="prayer-author">${escapeHtml(item.nome)}</span>
              <div class="prayer-date-status-wrap">
                <span class="prayer-date">${escapeHtml(item.data)}</span>
                <span class="prayer-status-text status-answered">Respondido</span>
              </div>
            </div>
          </div>
          <button type="button" class="btn-delete-prayer" data-action="delete" data-id="${item.id}" aria-label="Excluir pedido respondido" title="Excluir pedido (Requer senha de administrador)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
        </div>
      `;
    } else {
      // Lista de em andamento: cartão padrão sem botão de exclusão
      html += `
        <div class="prayer-row-item" data-id="${item.id}">
          <div class="prayer-card-box" data-action="view" data-id="${item.id}" role="button" tabindex="0" title="Clique para ler o pedido completo">
            <div class="prayer-first-line">${escapeHtml(firstLine)}</div>
            <div class="prayer-sub-row">
              <span class="prayer-author">${escapeHtml(item.nome)}</span>
              <div class="prayer-date-status-wrap">
                <span class="prayer-date">${escapeHtml(item.data)}</span>
                <span class="prayer-status-text status-pending">Em oração</span>
              </div>
            </div>
          </div>
        </div>
      `;
    }
  });

  container.innerHTML = html;
}

// Abre a tela de Pedidos de Oração
export function openPrayerScreen() {
  const screen = document.getElementById('prayerScreen');
  if (screen) {
    screen.classList.add('is-active');
    screen.setAttribute('aria-hidden', 'false');
    renderPrayerList();
  }
}

// Fecha a tela de Pedidos de Oração
export function closePrayerScreen() {
  const screen = document.getElementById('prayerScreen');
  if (screen) {
    screen.classList.remove('is-active');
    screen.setAttribute('aria-hidden', 'true');
  }
}

// Modais
function openModal(id) {
  const m = document.getElementById(id);
  if (m) {
    m.classList.add('is-open');
    m.setAttribute('aria-hidden', 'false');
  }
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) {
    m.classList.remove('is-open');
    m.setAttribute('aria-hidden', 'true');
  }
}

// Visualizar pedido completo ao clicar na caixa
function openViewModal(id) {
  currentViewPrayerId = id;
  const item = prayerList.find((p) => String(p.id) === String(id));
  if (!item) return;

  const authorEl = document.getElementById('viewPrayerAuthor');
  const dateEl = document.getElementById('viewPrayerDate');
  const statusEl = document.getElementById('viewPrayerStatusBadge');
  const contentEl = document.getElementById('viewPrayerContent');
  const swipeEl = document.getElementById('swipeAnswered');

  const goldSection = document.getElementById('prayerGoldAnswer');
  const goldText = document.getElementById('prayerGoldText');
  const answerInputBox = document.getElementById('prayerAnswerInputBox');
  const editSection = document.getElementById('prayerEditSection');

  if (authorEl) authorEl.textContent = item.nome || 'Pedido de Oração';
  if (dateEl) dateEl.textContent = item.data || '';

  const isAnswered = item.status === 'respondido';
  if (statusEl) {
    statusEl.textContent = isAnswered ? 'Respondido' : 'Em oração';
    statusEl.className = `prayer-status-text ${isAnswered ? 'status-answered' : 'status-pending'}`;
  }

  if (contentEl) {
    contentEl.textContent = item.pedido || '';
    contentEl.style.display = 'block';
  }

  // Esconde o painel de edição ao abrir
  if (editSection) editSection.style.display = 'none';
  if (answerInputBox) answerInputBox.style.display = 'none';

  // Configura a resposta em dourado se já houver resposta
  if (isAnswered && item.resposta && item.resposta.trim()) {
    if (goldText) goldText.textContent = item.resposta.trim();
    if (goldSection) goldSection.style.display = 'block';
  } else {
    if (goldSection) goldSection.style.display = 'none';
  }

  // Configura o swipe
  if (swipeEl) {
    swipeEl.checked = isAnswered;
  }

  openModal('modalViewPrayer');
}

// Salva alteração do texto do pedido (via lápis no modal de leitura)
async function handleSavePrayerText() {
  if (!currentViewPrayerId) return;
  const editTextEl = document.getElementById('editPrayerText');
  if (!editTextEl) return;

  const newText = editTextEl.value.trim();
  if (!newText) return;

  const idx = prayerList.findIndex((p) => String(p.id) === String(currentViewPrayerId));
  if (idx !== -1) {
    prayerList[idx].pedido = newText;
    saveLocalCache(prayerList);
    renderPrayerList();

    const contentEl = document.getElementById('viewPrayerContent');
    if (contentEl) contentEl.textContent = newText;
  }

  const editSection = document.getElementById('prayerEditSection');
  if (editSection) editSection.style.display = 'none';

  // Persiste no Firestore
  try {
    if (db && !String(currentViewPrayerId).startsWith('init-')) {
      const docRef = doc(db, 'pedidos_oracao', String(currentViewPrayerId));
      await updateDoc(docRef, { pedido: newText });
    }
  } catch (err) {
    console.warn('Erro ao atualizar texto no Firestore:', err);
  }
}

// Salva a resposta escrita ao ativar o swipe de respondido
async function handleSavePrayerAnswer() {
  if (!currentViewPrayerId) return;
  const answerField = document.getElementById('prayerAnswerField');
  if (!answerField) return;

  const answerText = answerField.value.trim();
  const idx = prayerList.findIndex((p) => String(p.id) === String(currentViewPrayerId));

  if (idx !== -1) {
    prayerList[idx].status = 'respondido';
    prayerList[idx].resposta = answerText;
    saveLocalCache(prayerList);
    currentTab = 'answered'; // Alterna para a lista de respondidos
    renderPrayerList();

    // Atualiza modal
    const statusEl = document.getElementById('viewPrayerStatusBadge');
    if (statusEl) {
      statusEl.textContent = 'Respondido';
      statusEl.className = 'prayer-status-text status-answered';
    }

    const goldSection = document.getElementById('prayerGoldAnswer');
    const goldText = document.getElementById('prayerGoldText');
    if (answerText) {
      if (goldText) goldText.textContent = answerText;
      if (goldSection) goldSection.style.display = 'block';
    } else {
      if (goldSection) goldSection.style.display = 'none';
    }
  }

  const answerInputBox = document.getElementById('prayerAnswerInputBox');
  if (answerInputBox) answerInputBox.style.display = 'none';

  // Persiste no Firestore
  try {
    if (db && !String(currentViewPrayerId).startsWith('init-')) {
      const docRef = doc(db, 'pedidos_oracao', String(currentViewPrayerId));
      await updateDoc(docRef, { 
        status: 'respondido',
        resposta: answerText 
      });
    }
  } catch (err) {
    console.warn('Erro ao salvar resposta no Firestore:', err);
  }
}

// Manipulador do Swipe de Respondido
async function handleSwipeToggle(e) {
  if (!currentViewPrayerId) return;
  const isChecked = e.target.checked;
  const item = prayerList.find((p) => String(p.id) === String(currentViewPrayerId));
  if (!item) return;

  const answerInputBox = document.getElementById('prayerAnswerInputBox');
  const answerField = document.getElementById('prayerAnswerField');
  const goldSection = document.getElementById('prayerGoldAnswer');
  const statusEl = document.getElementById('viewPrayerStatusBadge');

  if (isChecked) {
    // Ao ativar, abre o campo para escrever a resposta
    if (answerInputBox) answerInputBox.style.display = 'block';
    if (answerField) {
      answerField.value = item.resposta || '';
      answerField.focus();
    }
  } else {
    // Ao desativar, volta para 'em_oracao'
    if (answerInputBox) answerInputBox.style.display = 'none';
    if (goldSection) goldSection.style.display = 'none';

    item.status = 'em_oracao';
    saveLocalCache(prayerList);
    currentTab = 'pending'; // Retorna para a lista de pedidos em andamento
    renderPrayerList();

    if (statusEl) {
      statusEl.textContent = 'Em oração';
      statusEl.className = 'prayer-status-text status-pending';
    }

    try {
      if (db && !String(currentViewPrayerId).startsWith('init-')) {
        const docRef = doc(db, 'pedidos_oracao', String(currentViewPrayerId));
        await updateDoc(docRef, { status: 'em_oracao' });
      }
    } catch (err) {
      console.warn('Erro ao atualizar status para em_oracao no Firestore:', err);
    }
  }
}

// Salvar novo pedido
async function handleSavePrayer(e) {
  e.preventDefault();
  const nameInput = document.getElementById('prayerName');
  const textInput = document.getElementById('prayerText');
  if (!nameInput || !textInput) return;

  const nome = nameInput.value.trim();
  const pedido = textInput.value.trim();
  if (!nome || !pedido) return;

  const now = new Date();
  const formattedDate = formatLocalDate(now);

  const localItem = {
    id: 'local-' + Date.now(),
    nome: nome,
    pedido: pedido,
    status: 'em_oracao',
    resposta: '',
    data: formattedDate,
    timestamp: now.getTime()
  };

  prayerList.unshift(localItem);
  saveLocalCache(prayerList);
  currentTab = 'pending';
  renderPrayerList();

  nameInput.value = '';
  textInput.value = '';
  closeModal('modalNewPrayer');

  // Persiste no Firestore
  try {
    if (db) {
      const docRef = await addDoc(collection(db, 'pedidos_oracao'), {
        nome: nome,
        pedido: pedido,
        status: 'em_oracao',
        resposta: '',
        data: formattedDate,
        timestamp: serverTimestamp()
      });
      localItem.id = docRef.id;
      saveLocalCache(prayerList);
    }
  } catch (err) {
    console.warn('Erro ao salvar no Firestore (mantido localmente):', err);
  }
}

// Abre modal de exclusão (disponível ao lado dos pedidos respondidos)
function openDeleteModal(id) {
  currentDeleteTargetId = id;
  const pwdInput = document.getElementById('adminDeletePassword');
  const errEl = document.getElementById('deleteErrorMsg');
  if (pwdInput) {
    pwdInput.value = '';
  }
  if (errEl) {
    errEl.style.display = 'none';
  }
  openModal('modalDeletePrayer');
  if (pwdInput) {
    setTimeout(() => pwdInput.focus(), 80);
  }
}

// Confirma exclusão com a senha do administrador ("CBNA.adm")
async function handleConfirmDelete() {
  const pwdInput = document.getElementById('adminDeletePassword');
  const errEl = document.getElementById('deleteErrorMsg');
  const entered = pwdInput ? pwdInput.value.trim() : '';

  if (entered !== ADMIN_PASSWORD) {
    if (errEl) errEl.style.display = 'block';
    if (pwdInput) {
      pwdInput.focus();
      pwdInput.select();
    }
    return;
  }

  const idToDelete = currentDeleteTargetId;
  if (!idToDelete) return;

  // Remove localmente imediatamente
  prayerList = prayerList.filter((p) => String(p.id) !== String(idToDelete));
  saveLocalCache(prayerList);
  renderPrayerList();
  closeModal('modalDeletePrayer');
  currentDeleteTargetId = null;

  // Persiste exclusão no Cloud Firestore
  try {
    if (db && !String(idToDelete).startsWith('init-') && !String(idToDelete).startsWith('local-')) {
      const docRef = doc(db, 'pedidos_oracao', String(idToDelete));
      await deleteDoc(docRef);
    }
  } catch (err) {
    console.warn('Erro ao excluir pedido no Firestore:', err);
  }
}

// Inicialização dos Listeners
export function initPrayers() {
  prayerList = loadLocalCache();
  renderPrayerList();

  // Escuta no Firestore em tempo real
  try {
    if (db) {
      const q = query(collection(db, 'pedidos_oracao'), orderBy('timestamp', 'desc'));
      onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
          const cloudItems = [];
          snapshot.forEach((d) => {
            const data = d.data();
            let dateStr = data.data;
            let ts = Date.now();
            if (data.timestamp) {
              if (typeof data.timestamp.toDate === 'function') {
                const dateObj = data.timestamp.toDate();
                ts = dateObj.getTime();
                if (!dateStr) dateStr = formatLocalDate(dateObj);
              } else if (typeof data.timestamp === 'number') {
                ts = data.timestamp;
              }
            }
            cloudItems.push({
              id: d.id,
              nome: data.nome || 'Anônimo',
              pedido: data.pedido || '',
              status: data.status || 'em_oracao',
              resposta: data.resposta || '',
              data: dateStr || formatLocalDate(new Date()),
              timestamp: ts
            });
          });

          if (cloudItems.length > 0) {
            prayerList = cloudItems;
            saveLocalCache(prayerList);
            renderPrayerList();
          }
        }
      }, (error) => {
        console.warn('Aviso no Firestore snapshot:', error);
      });
    }
  } catch (err) {
    console.warn('Firestore offline:', err);
  }

  // Alternância entre as abas: "Em oração" e "Respondidos"
  const tabPending = document.getElementById('tabPending');
  if (tabPending) {
    tabPending.addEventListener('click', () => {
      currentTab = 'pending';
      renderPrayerList();
    });
  }

  const tabAnswered = document.getElementById('tabAnswered');
  if (tabAnswered) {
    tabAnswered.addEventListener('click', () => {
      currentTab = 'answered';
      renderPrayerList();
    });
  }

  // Clique na lista para abrir leitura do pedido ou acionar exclusão
  const listContainer = document.getElementById('prayerListContainer');
  if (listContainer) {
    listContainer.addEventListener('click', (e) => {
      const delBtn = e.target.closest('[data-action="delete"]');
      if (delBtn) {
        e.stopPropagation();
        openDeleteModal(delBtn.getAttribute('data-id'));
        return;
      }
      const card = e.target.closest('[data-action="view"]');
      if (card) {
        openViewModal(card.getAttribute('data-id'));
      }
    });
  }

  // Botão voltar da tela de pedidos
  const btnBack = document.getElementById('btnPrayerBack');
  if (btnBack) {
    btnBack.addEventListener('click', closePrayerScreen);
  }

  // Botão "+" para novo pedido
  const btnAdd = document.getElementById('btnAddPrayer');
  if (btnAdd) {
    btnAdd.addEventListener('click', () => openModal('modalNewPrayer'));
  }

  // Fechamentos do modal novo pedido
  const btnCloseNew = document.getElementById('btnCloseNewPrayer');
  if (btnCloseNew) btnCloseNew.addEventListener('click', () => closeModal('modalNewPrayer'));
  const btnCancelNew = document.getElementById('btnCancelNewPrayer');
  if (btnCancelNew) btnCancelNew.addEventListener('click', () => closeModal('modalNewPrayer'));
  const overlayNew = document.getElementById('overlayNewPrayer');
  if (overlayNew) overlayNew.addEventListener('click', () => closeModal('modalNewPrayer'));

  // Formulário novo pedido
  const formNew = document.getElementById('formNewPrayer');
  if (formNew) {
    formNew.addEventListener('submit', handleSavePrayer);
  }

  // Fechamentos do modal de leitura (apenas o 'X' no topo)
  const btnCloseView = document.getElementById('btnCloseViewPrayer');
  if (btnCloseView) btnCloseView.addEventListener('click', () => closeModal('modalViewPrayer'));
  const overlayView = document.getElementById('overlayViewPrayer');
  if (overlayView) overlayView.addEventListener('click', () => closeModal('modalViewPrayer'));

  // Botão Swipe de Respondido
  const swipeEl = document.getElementById('swipeAnswered');
  if (swipeEl) {
    swipeEl.addEventListener('change', handleSwipeToggle);
  }

  // Salvar resposta escrita ao ativar o swipe
  const btnSaveAnswer = document.getElementById('btnSaveAnswer');
  if (btnSaveAnswer) {
    btnSaveAnswer.addEventListener('click', handleSavePrayerAnswer);
  }

  // Lápis dentro do modal para editar o texto do pedido
  const btnOpenEdit = document.getElementById('btnOpenEditPrayer');
  const editSection = document.getElementById('prayerEditSection');
  const editTextEl = document.getElementById('editPrayerText');
  if (btnOpenEdit) {
    btnOpenEdit.addEventListener('click', () => {
      if (!currentViewPrayerId || !editSection) return;
      const isVisible = editSection.style.display === 'block';
      if (isVisible) {
        editSection.style.display = 'none';
      } else {
        const item = prayerList.find((p) => String(p.id) === String(currentViewPrayerId));
        if (item && editTextEl) {
          editTextEl.value = item.pedido || '';
        }
        editSection.style.display = 'block';
        if (editTextEl) editTextEl.focus();
      }
    });
  }

  // Ações de salvar e cancelar edição do pedido
  const btnSaveEdit = document.getElementById('btnSaveEditPrayer');
  if (btnSaveEdit) {
    btnSaveEdit.addEventListener('click', handleSavePrayerText);
  }
  const btnCancelEdit = document.getElementById('btnCancelEditPrayer');
  if (btnCancelEdit) {
    btnCancelEdit.addEventListener('click', () => {
      if (editSection) editSection.style.display = 'none';
    });
  }

  // Modal de exclusão com senha de administrador
  const btnCloseDelete = document.getElementById('btnCloseDeletePrayer');
  if (btnCloseDelete) btnCloseDelete.addEventListener('click', () => closeModal('modalDeletePrayer'));
  const btnCancelDelete = document.getElementById('btnCancelDeletePrayer');
  if (btnCancelDelete) btnCancelDelete.addEventListener('click', () => closeModal('modalDeletePrayer'));
  const overlayDelete = document.getElementById('overlayDeletePrayer');
  if (overlayDelete) overlayDelete.addEventListener('click', () => closeModal('modalDeletePrayer'));

  const btnConfirmDelete = document.getElementById('btnConfirmDeletePrayer');
  if (btnConfirmDelete) {
    btnConfirmDelete.addEventListener('click', handleConfirmDelete);
  }

  const adminDeleteInput = document.getElementById('adminDeletePassword');
  if (adminDeleteInput) {
    adminDeleteInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirmDelete();
      }
    });
  }
}
