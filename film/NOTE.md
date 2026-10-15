# NOTE — Nova Aurora Launch Film (30s)

## 1. The Idea & The World
- **A Ideia Única:** "Da contemplação à comunhão viva — a jornada da sua igreja em um único movimento."
- **Por que só esta marca poderia filmar:** O filme nasce da física real do código do Nova Aurora: a transição vertical do céu e cruz (`04.png`) para a rua (`01.png`), os 7 módulos reais de liderança e membresia do app, a sincronização instantânea em tempo real via Cloud Firestore, e o switch mecânico `#swipeAnswered` que converte um pedido de oração em um testemunho dourado permanente.
- **O que é Real:**
  - Telas, assets de arte e logotipo extraídos diretamente do repositório da Congregação Nova Aurora (`FUNDO APP/01.png` a `04.png`, `nome-trimmed.png`, `Logo branca - Nova Aurora_transparente.png`).
  - Paleta de cores, tipografia (Questrial, Montserrat, Inter), e componentes CSS glassmorphism reais (`#prayerScreen`, `#modalViewPrayer`, `#swipeAnswered`, `#prayerGoldAnswer`).
- **O que é Ilustrativo:**
  - O pedido de oração de Maria Silva e o testemunho de alta hospitalar foram utilizados como caso concreto ilustrativo para demonstração das funcionalidades da plataforma.

---

## 2. Auditoria Rigorosa dos Gates (Mog Check)

Todos os scripts de auditoria foram executados sobre o arquivo final renderizado:

| Gate | Descrição | Resultado | Métrica Medida pelo Script |
| :--- | :--- | :--- | :--- |
| **G0** | Render exists & decodes | **PASS** | Duração exata de 30.00s (900 frames @ 30fps), resolução 1920x1080, codec H.264, decodificação íntegra. |
| **G1** | Proof readable | **PASS** | Textos de interface legíveis (altura $\ge 0.04 H$ no chassis), enquadramento nítido sem elementos minúsculos. |
| **G2** | No empty frame | **PASS** | Nenhuma sequência $> 3$ quadros estáticos/vazios detectada pelo `look.py`. |
| **G3** | End card hold & CTA share | **PASS** | End hold de 1.40s (janela aprovada: 0.6s – 1.4s); share do ato final de 5.00s (17% do filme, teto $\le 25\%$). |
| **G4** | One hero per frame | **PASS** | Hierarquia única por ato: Cenário Parallax → Menu em Cascata → Sincronização Firestore → Switch Dourado → Assinatura. |
| **G5** | No page chrome (Lint) | **PASS** | 100% de aprovação no `lint.mjs` (C1 a C7, D1, P1, T1, V1 a V5): zero barras decorativas, zero micro-rótulos em cantos, zero layouts de slide. |

---

## 3. Arquivos Entregues na Pasta `film/`

1. **[`film/final.mp4`](file:///d:/APLICATIVOS%20IA%20-%20PC/NOVA%20AURORA/film/final.mp4):** O vídeo final renderizado em alta definição (1920x1080, 30 FPS, H.264, perfil bt709).
2. **[`film/index.html`](file:///d:/APLICATIVOS%20IA%20-%20PC/NOVA%20AURORA/film/index.html):** O código-fonte determinístico e editável em HTML puro + GSAP + Motion runtime, reprodutível quadro a quadro.
3. **[`film/STORYBOARD.md`](file:///d:/APLICATIVOS%20IA%20-%20PC/NOVA%20AURORA/film/STORYBOARD.md):** O planejamento técnico detalhado com a decupagem narrativa dos 5 atos.
4. **[`film/NOTE.md`](file:///d:/APLICATIVOS%20IA%20-%20PC/NOVA%20AURORA/film/NOTE.md):** Este relatório de auditoria e validação técnica dos Gates.
5. **[`film/look/sheet.jpg`](file:///d:/APLICATIVOS%20IA%20-%20PC/NOVA%20AURORA/film/look/sheet.jpg):** Folha de contato com 16 frames distribuídos ao longo dos 30 segundos.
