/**
 * Congregação Nova Aurora — Parallax Vertical Estendido
 * Topo: Toca no topo da camada 04
 * Fundo: Toca na parte inferior da camada 01
 * Nome da Congregação: Fade-in suave no topo quando atinge o nível mais baixo
 */

import { initPrayers, openPrayerScreen, closePrayerScreen } from './prayers.js';
import { initVisitors, requestAccessToVisitors, closeVisitorsScreen } from './visitors.js';
import { initVisits, openVisitsScreen, closeVisitsScreen } from './visits.js';
import { initEvents, openEventsScreen, closeEventsScreen } from './events.js';

(function () {
  'use strict';

  const mobileFrame = document.getElementById('mobileFrame');
  const scrollContainer = document.getElementById('scrollContainer');
  const congregationBrand = document.getElementById('congregationBrand');
  const layerBase = document.getElementById('layerBase');
  const layer04 = document.getElementById('layer04');
  const layer03 = document.getElementById('layer03');
  const layer02 = document.getElementById('layer02');
  const layer01 = document.getElementById('layer01');
  const btnHome = document.getElementById('btnHome');
  const homeMenuItems = Array.from(document.querySelectorAll('.home-menu-item'));

  let cachedH = (mobileFrame && mobileFrame.clientHeight) || window.innerHeight;
  let lastProgress = -1;

  function renderParallax(progress) {
    const p = Math.min(1, Math.max(0, progress));
    // Evita recalcular e re-renderizar quando o scroll estiver estacionário
    if (lastProgress !== -1 && Math.abs(p - lastProgress) < 0.0001) return;
    lastProgress = p;

    const H = cachedH;
    const L = H * 1.75;
    const delta = L - H;

    // Camada Base e Camada 04 (Céu e Cruz):
    const y4 = -p * (delta * 0.50);
    const y4Str = `translate3d(-50%, ${y4.toFixed(1)}px, 0)`;
    if (layerBase) layerBase.style.transform = y4Str;
    if (layer04) layer04.style.transform = y4Str;

    // Camada 03 (Colinas)
    const y3 = -p * (delta * 0.68);
    if (layer03) layer03.style.transform = `translate3d(-50%, ${y3.toFixed(1)}px, 0)`;

    // Camada 02 (Cidade)
    const y2 = -p * (delta * 0.85);
    if (layer02) layer02.style.transform = `translate3d(-50%, ${y2.toFixed(1)}px, 0)`;

    // Camada 01 (Rua):
    const y1 = -p * delta;
    if (layer01) layer01.style.transform = `translate3d(-50%, ${y1.toFixed(1)}px, 0)`;

    // Nome da Congregação: Efeito Fade-In no topo ao atingir o nível mais baixo do scroll
    if (congregationBrand) {
      const fadeStart = 0.70;
      const fade = Math.max(0, Math.min(1, (p - fadeStart) / (1 - fadeStart)));
      congregationBrand.style.opacity = fade.toFixed(3);
      congregationBrand.style.transform = `translate3d(-50%, ${((1 - fade) * -12).toFixed(1)}px, 0)`;
    }

    // Menu Inicial em Cascata:
    if (homeMenuItems.length > 0) {
      const cascadeStart = 0.65;
      const totalItems = homeMenuItems.length;
      const itemWindow = 0.14;
      const step = (1.0 - cascadeStart - itemWindow) / Math.max(1, totalItems - 1);

      for (let i = 0; i < totalItems; i++) {
        const item = homeMenuItems[i];
        const itemStart = cascadeStart + i * step;
        const itemEnd = itemStart + itemWindow;
        const itemProg = Math.min(1, Math.max(0, (p - itemStart) / (itemEnd - itemStart)));

        // Easing suave cúbico
        const eased = 1 - Math.pow(1 - itemProg, 3);
        const offsetX = (1 - eased) * -45;

        item.style.opacity = eased.toFixed(3);
        item.style.transform = `translate3d(${offsetX.toFixed(1)}px, 0, 0)`;
        item.style.pointerEvents = eased > 0.4 ? 'auto' : 'none';
      }
    }
  }

  // Posição inicial no topo (p = 0)
  renderParallax(0);

  // Inicialização do Lenis Smooth Scroll
  let lenis = null;
  if (typeof window.Lenis !== 'undefined' && scrollContainer) {
    lenis = new window.Lenis({
      wrapper: scrollContainer,
      content: scrollContainer.querySelector('.scroll-spacer'),
      duration: 1.0,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      syncTouch: false,
      wheelMultiplier: 1.0,
      touchMultiplier: 1.0,
    });

    lenis.on('scroll', (e) => {
      renderParallax(e.progress);
    });

    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);
  } else if (scrollContainer) {
    scrollContainer.addEventListener('scroll', () => {
      const scroll = scrollContainer.scrollTop;
      const maxScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight;
      const progress = maxScroll > 0 ? scroll / maxScroll : 0;
      renderParallax(progress);
    }, { passive: true });
  }

  // No desktop, permite girar o scroll do mouse mesmo com o ponteiro fora do celular
  window.addEventListener('wheel', (e) => {
    if (scrollContainer && e.target !== scrollContainer && !scrollContainer.contains(e.target)) {
      scrollContainer.scrollTop += e.deltaY;
    }
  }, { passive: true });

  window.addEventListener('resize', () => {
    cachedH = (mobileFrame && mobileFrame.clientHeight) || window.innerHeight;
    if (scrollContainer) {
      const scroll = scrollContainer.scrollTop;
      const maxScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight;
      const progress = maxScroll > 0 ? scroll / maxScroll : 0;
      lastProgress = -1;
      renderParallax(progress);
    }
  }, { passive: true });

  // Retorna para o menu inicial (limite inferior do scroll onde o nome da congregação é exibido)
  function scrollToHome() {
    if (!scrollContainer) return;
    const maxScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight;
    if (lenis && typeof lenis.scrollTo === 'function') {
      lenis.scrollTo(maxScroll, {
        duration: 1.3,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t))
      });
    } else {
      scrollContainer.scrollTo({
        top: maxScroll,
        behavior: 'smooth'
      });
    }
  }

  const offersScreen = document.getElementById('offersScreen');
  const btnOffersBack = document.getElementById('btnOffersBack');
  const btnCopyDizimo = document.getElementById('btnCopyDizimo');
  const btnCopyOferta = document.getElementById('btnCopyOferta');

  function openOffersScreen() {
    if (offersScreen) {
      offersScreen.classList.add('is-active');
      offersScreen.setAttribute('aria-hidden', 'false');
    }
  }

  function closeOffersScreen() {
    if (offersScreen) {
      offersScreen.classList.remove('is-active');
      offersScreen.setAttribute('aria-hidden', 'true');
    }
  }

  function copyToClipboard(text, btn) {
    const doFeedback = () => {
      const label = btn.querySelector('.copy-label');
      const originalText = label ? label.textContent : '';
      if (label) label.textContent = 'Chave Copiada!';
      btn.classList.add('is-copied');
      setTimeout(() => {
        if (label) label.textContent = originalText;
        btn.classList.remove('is-copied');
      }, 2200);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(doFeedback).catch(() => {
        fallbackCopy(text, doFeedback);
      });
    } else {
      fallbackCopy(text, doFeedback);
    }
  }

  function fallbackCopy(text, callback) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      callback();
    } catch (e) {
      console.warn('Erro fallback copy:', e);
    }
    document.body.removeChild(textarea);
  }

  if (btnOffersBack) {
    btnOffersBack.addEventListener('click', closeOffersScreen);
  }

  if (btnCopyDizimo) {
    btnCopyDizimo.addEventListener('click', () => {
      copyToClipboard('08801276000180', btnCopyDizimo);
    });
  }

  if (btnCopyOferta) {
    btnCopyOferta.addEventListener('click', () => {
      copyToClipboard('04505471403', btnCopyOferta);
    });
  }

  // ==========================================
  // Controle de Versão e Atualização Automática PWA
  // ==========================================
  const APP_VERSION = '1.2.4';
  const APP_BUILD = 30;
  let waitingWorker = null;
  let isUpdating = false;

  // Se veio de um reload forçado de atualização, limpa query param da URL
  if (window.location.search.includes('v_sync')) {
    try {
      const cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, document.title, cleanUrl);
    } catch (_) {}
  }

  function setAppUpdateAvailable(available, worker = null) {
    if (worker) waitingWorker = worker;
    if (!btnHome) return;

    if (available) {
      btnHome.classList.add('has-update');
      btnHome.setAttribute('aria-label', 'Nova versão disponível! Toque para atualizar');
      btnHome.setAttribute('title', 'Nova versão disponível! Toque para atualizar o aplicativo');
    } else {
      btnHome.classList.remove('has-update');
      btnHome.setAttribute('aria-label', 'Voltar ao menu inicial');
      btnHome.removeAttribute('title');
    }
  }

  async function checkVersionFile() {
    try {
      const res = await fetch(`./version.json?_nocache=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.build && Number(data.build) > APP_BUILD) {
        setAppUpdateAvailable(true);
      }
    } catch (_) {}
  }

  async function applyAppUpdate() {
    if (isUpdating) return;
    isUpdating = true;

    // Feedback visual no arco ao iniciar atualização
    const arcText = document.getElementById('btnHomeArcTextPath');
    if (arcText) {
      arcText.textContent = 'Atualizando...';
    }

    try {
      // 1. Notifica Service Worker para assumir controle imediato
      if (waitingWorker) {
        waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      }

      // 2. Limpa caches antigos do navegador para evitar persistência de versão anterior
      if ('caches' in window) {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map((key) => caches.delete(key)));
      }

      // 3. Atualiza os registros do Service Worker
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.update().catch(() => {});
        }
      }
    } catch (err) {
      console.warn('[App Update] Erro durante renovação de cache:', err);
    }

    // 4. Força reload com timestamp limpo garantindo arquivos novos do servidor/github
    setTimeout(() => {
      const targetUrl = new URL(window.location.href);
      targetUrl.searchParams.set('v_sync', Date.now().toString());
      window.location.replace(targetUrl.toString());
    }, 250);
  }

  if (btnHome) {
    btnHome.addEventListener('click', (e) => {
      e.preventDefault();
      // Se houver nova versão disponível, tocar no botão adota a versão mais atual
      if (btnHome.classList.contains('has-update')) {
        applyAppUpdate();
        return;
      }
      closePrayerScreen();
      closeOffersScreen();
      closeVisitorsScreen();
      closeVisitsScreen();
      closeEventsScreen();
      scrollToHome();
    });
  }

  // Interação de toque/clique para garantir o brilho laranja ao pressionar em qualquer dispositivo
  homeMenuItems.forEach((item) => {
    const link = item.querySelector('.home-menu-link');
    if (link) {
      const activateOrange = () => link.classList.add('is-pressed');
      const deactivateOrange = () => link.classList.remove('is-pressed');

      link.addEventListener('pointerdown', activateOrange);
      link.addEventListener('pointerup', deactivateOrange);
      link.addEventListener('pointercancel', deactivateOrange);
      link.addEventListener('pointerleave', deactivateOrange);
      link.addEventListener('click', (e) => {
        // feedback tátil curto
        activateOrange();
        setTimeout(deactivateOrange, 180);

        const href = link.getAttribute('href');
        if (href === '#pedidos-oracao') {
          e.preventDefault();
          openPrayerScreen();
        } else if (href === '#ofertas') {
          e.preventDefault();
          openOffersScreen();
        } else if (href === '#programacoes') {
          e.preventDefault();
          openEventsScreen();
        } else if (href === '#solicitar-visita') {
          e.preventDefault();
          openVisitsScreen();
        } else if (href === '#registrar-visitante' || href === '#registrar-visita') {
          e.preventDefault();
          requestAccessToVisitors();
        }
      });
    }
  });

  // Inicializa o sistema de orações, de visitantes, de visitas e de programações
  initPrayers();
  initVisitors();
  initVisits();
  initEvents();

  // PWA Service Worker com detecção em tempo real e atualização transparente
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((reg) => {
        if (reg.waiting) {
          setAppUpdateAvailable(true, reg.waiting);
        }

        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                setAppUpdateAvailable(true, newWorker);
              }
            });
          }
        });

        reg.update().catch(() => {});
      }).catch(() => {});

      // Checagem proativa de versão via version.json
      checkVersionFile();
      setInterval(checkVersionFile, 60000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          checkVersionFile();
        }
      });
      window.addEventListener('focus', checkVersionFile);
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        const targetUrl = new URL(window.location.href);
        targetUrl.searchParams.set('v_sync', Date.now().toString());
        window.location.replace(targetUrl.toString());
      }
    });
  }
})();
