/**
 * Congregação Nova Aurora — Parallax Vertical Estendido
 * Topo: Toca no topo da camada 04
 * Fundo: Toca na parte inferior da camada 01
 * Nome da Congregação: Fade-in suave no topo quando atinge o nível mais baixo
 */

import { initPrayers, openPrayerScreen, closePrayerScreen } from './prayers.js';
import { initVisitors, requestAccessToVisitors, closeVisitorsScreen } from './visitors.js';

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

  function renderParallax(progress) {
    const H = mobileFrame.clientHeight || window.innerHeight;
    const L = H * 1.75;
    const delta = L - H;
    const p = Math.min(1, Math.max(0, progress));

    // Camada Base e Camada 04 (Céu e Cruz):
    const y4 = -p * (delta * 0.50);
    if (layerBase) layerBase.style.transform = `translate3d(-50%, ${y4}px, 0)`;
    if (layer04) layer04.style.transform = `translate3d(-50%, ${y4}px, 0)`;

    // Camada 03 (Colinas)
    const y3 = -p * (delta * 0.68);
    if (layer03) layer03.style.transform = `translate3d(-50%, ${y3}px, 0)`;

    // Camada 02 (Cidade)
    const y2 = -p * (delta * 0.85);
    if (layer02) layer02.style.transform = `translate3d(-50%, ${y2}px, 0)`;

    // Camada 01 (Rua):
    // Ao final (p = 1), y1 = -delta (a base toca perfeitamente no fundo da tela)
    const y1 = -p * delta;
    if (layer01) layer01.style.transform = `translate3d(-50%, ${y1}px, 0)`;

    // Nome da Congregação: Efeito Fade-In no topo ao atingir o nível mais baixo do scroll
    if (congregationBrand) {
      // Inicia a transição a partir de 70% da descida e atinge 100% de opacidade no nível mais baixo
      const fadeStart = 0.70;
      const fade = Math.max(0, Math.min(1, (p - fadeStart) / (1 - fadeStart)));
      congregationBrand.style.opacity = fade.toFixed(3);
      congregationBrand.style.transform = `translate(-50%, ${(1 - fade) * -12}px)`;
    }

    // Menu Inicial em Cascata:
    // Desliza da esquerda para a direita de cima para baixo sucessivamente
    // Quando topar o scroll na parte inferior (p = 1.0), o último item ("INFANTIL") aparece completamente.
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
        item.style.transform = `translateX(${offsetX.toFixed(1)}px)`;
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
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 1.0,
      touchMultiplier: 1.8,
    });

    function raf(time) {
      lenis.raf(time);
      renderParallax(lenis.progress || 0);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);
  }

  // Listener nativo do container para sincronismo imediato (mouse, toque, teclado)
  if (scrollContainer) {
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
    if (scrollContainer) {
      const scroll = scrollContainer.scrollTop;
      const maxScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight;
      const progress = maxScroll > 0 ? scroll / maxScroll : 0;
      renderParallax(progress);
    }
  });

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

  if (btnHome) {
    btnHome.addEventListener('click', (e) => {
      e.preventDefault();
      closePrayerScreen();
      closeOffersScreen();
      closeVisitorsScreen();
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
        } else if (href === '#registrar-visitante' || href === '#registrar-visita') {
          e.preventDefault();
          requestAccessToVisitors();
        }
      });
    }
  });

  // Inicializa o sistema de orações e o de visitantes
  initPrayers();
  initVisitors();

  // PWA Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then((reg) => {
        reg.update().catch(() => {});
      }).catch(() => {});
    });
  }
})();
