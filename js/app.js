/**
 * Congregação Nova Aurora — Parallax Vertical Estendido
 * Topo: Toca no topo da camada 04
 * Fundo: Toca na parte inferior da camada 01
 * Nome da Congregação: Fade-in suave no topo quando atinge o nível mais baixo
 */

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

  // PWA Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
})();
