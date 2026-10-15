# STORYBOARD — Nova Aurora (Launch Film 30s)

## 0. Diagnóstico & Fundamentos (PAGE)

- **Problem:** Igrejas modernas lidam com fragmentação: pedidos de oração perdidos em grupos de mensagens, visitas desorganizadas e avisos que ninguém lê, dependendo de planilhas frias ou soluções genéricas.
- **Audience:** Lideranças pastorais, diáconos, equipes de comunicação e membros de igrejas que buscam uma experiência digital viva, acolhedora e mobile-first.
- **Goal:** Fazer o espectador desejar o Nova Aurora como o aplicativo oficial da sua comunidade, reconhecendo que tecnologia para a igreja pode ser bela, calorosa e em tempo real.
- **Emotion:** Transição de uma sensação de contemplação e reverência espiritual inicial até a empolgação vibrante e pertencimento da comunhão ativa ("A igreja viva no bolso").

### Script Cues & Mapeamento Visual
- *"Entre o céu que inspira e a rua onde a comunidade acontece"*: Camadas Z em profundidade 3D (04.png céu/cruz a 0.50x descendo até 01.png rua a 1.00x).
- *"Não precisa parecer uma planilha fria"*: Menu em cascata cúbica e fluidez PWA nativa com halo solar laranja (`#ff7700`).
- *"Pedidos de oração chegam em tempo real"*: Transição em vidro fosco (`backdrop-filter: blur(22px)`) e contadores ao vivo incrementando com sinc Firestore.
- *"Transformando pedidos em testemunhos em ouro"*: Switch elástico `#swipeAnswered` acende e expande o card dourado `#prayerGoldAnswer` (`#ffd700`).
- *"A presença digital da sua igreja, viva todos os dias"*: Pulso na marca (`Logo branca - Nova Aurora_transparente.png`) e recuo para o smartphone emoldurado na aurora.

### Orçamento de Importância (Importance Budget)
- **Ato 1 (00:00 - 00:05 | 150 frames):** Importância 2 (Atmosfera, imersão, ancoragem de marca).
- **Ato 2 (00:05 - 00:11 | 180 frames):** Importância 2 (Ritmo, amplitude dos 7 módulos, primeiro toque).
- **Ato 3 (00:11 - 00:18 | 210 frames):** Importância 2 (Funcionalidade real, Firestore em tempo real).
- **Ato 4 (00:18 - 00:25 | 210 frames):** **Importância 3 (HERO BEAT)** — 100% do foco visual e sonoro no switch mecânico e na explosão de luz dourada do testemunho.
- **Ato 5 (00:25 - 00:30 | 150 frames):** Importância 1 (Assinatura, estabilização de 1.0s, end hold limpo sem poluição).

---

## 1. Identidade & Paleta do Mundo Visual

- **Noite Profunda (Ground Primário):** `#020408` (infinito externo), `#060b18` (chassi do aparelho).
- **Superfícies Glassmorphism:** `rgba(6, 11, 24, 0.95)` com `backdrop-filter: blur(22px)` e bordas sutis `rgba(255, 255, 255, 0.08)`.
- **Luz Guia (Tipografia & Vetores):** `#ffffff` com glow difuso `0 0 18px rgba(255, 255, 255, 0.5)`.
- **Ignição da Aurora (Ação do Toque):** `#ffaa33` → `#ff7700` → `#ff3700` (glow no menu e switch).
- **Ouro de Testemunho (Hero Clímax):** Gradiente dourado `#ffd700` / `#fbbf24` com ressonância translúcida `rgba(245, 158, 11, 0.12)`.
- **Tipografia:** Questrial / Montserrat (peso 300 / 500, caixa alta, `letter-spacing: 0.18em`).

---

## 2. Decupagem dos 5 Atos (30 segundos @ 30fps = 900 frames)

```
00:00                00:05                00:11                00:18                00:25           00:30
|---- ATO 1 (150f) ----|---- ATO 2 (180f) ----|---- ATO 3 (210f) ----|---- ATO 4 (210f) ----|-- ATO 5 (150f) --|
  A CONTEMPLAÇÃO        O DESPERTAR          CUIDADO REAL-TIME     HERO BEAT: TESTEMUNHO  ASSINATURA & CTA
```

### Ato 1: A Contemplação (Frames 0 a 150 | 00:00 – 00:05)
- **Câmera & Composição:**
  - Inicia em plano fechado macro na camada superior do céu com a cruz (`04.png`, Z-depth 0.50x).
  - Movimento vertical contínuo com interpolação Lenis (`1 - 2^(-10t)`), revelando as colinas (`03.png`, 0.68x), a cidade iluminada (`02.png`, 0.85x) e a rua de paralelepípedos (`01.png`, 1.00x).
  - A moldura `.mobile-frame` (`border-radius: 36px`, sombra de profundidade) envolve o cenário suavemente.
  - No topo, o logotipo `nome-trimmed.png` entra em fade e scale sutil aos 90 frames (00:03).
- **Tipografia Cinética:** Sem textos intrusivos no início; a arte respira para estabelecer a atmosfera sagrada.
- **Locução:** *"Toda igreja vive entre o céu que inspira... e a rua onde a comunidade acontece."*
- **Áudio / SFX:** Drone analógico grave em sintetizador + sopro de vento noturno com abertura harmônica suave.

### Ato 2: O Despertar da Plataforma (Frames 150 a 330 | 00:05 – 00:11)
- **Câmera & Composição:**
  - **Corte no movimento (Cut on motion)** no frame 150 exatamente quando a rua toca a base do viewport.
  - Cascata dos 7 itens do menu vindos da esquerda (`translateX(-45px) → 0` com curva cúbica `1 - (1 - t)^3`):
    `QUEM SOMOS`, `PROGRAMAÇÕES`, `PEDIDOS DE ORAÇÃO`, `SOLICITAR VISITA`, `REGISTRAR VISITA`, `MEMBROS`, `INFANTIL`.
  - Câmera avança em ligeiro zoom (`scale: 1.15`) focando no cluster central.
  - Cursor tátil clica em `PEDIDOS DE ORAÇÃO`, gerando pulso radial e expansão de luz laranja (#ffaa33 → #ff7700).
- **Tipografia Cinética:**
  - Entrada desacelerada: `TODA A SUA COMUNIDADE` / `EM UM SÓ MOVIMENTO` (Questrial, tracking `0.18em`, escala 1.8x para 1.0x).
  - Sai acelerando no exato momento do clique.
- **Locução:** *"Mas conectar membros, visitas, programação e cuidado pastoral não precisa parecer uma planilha fria. Conheça o Nova Aurora."*
- **Áudio / SFX:** Pulso rítmico moderno e sutil; 7 micro-cliques cristalinos em cascata rápida, seguidos de um grave aveludado no clique laranja.

### Ato 3: Cuidado em Tempo Real (Frames 330 a 540 | 00:11 – 00:18)
- **Câmera & Composição:**
  - A expansão laranja abre o painel `#prayerScreen` em vidro fosco com desfoque de fundo (`blur(22px)`).
  - Cabeçalho em destaque nítido: `Em oração: 12 • Respondidos: 8`.
  - Um card com o pedido *"Recuperação de saúde da minha mãe"* entra deslizando suavemente (`y: 40px → 0px`).
  - O contador `Em oração` salta de 12 para 13 em tempo real, acompanhado de pulso suave.
- **Tipografia Cinética:**
  - `SINCRONIZAÇÃO AO VIVO` / `MESMO OFFLINE` ancorada no movimento de chegada do card.
- **Locução:** *"Um aplicativo próprio da sua igreja, instalável no celular, onde cada pedido de oração e cada necessidade chegam em tempo real."*
- **Áudio / SFX:** Whoosh aveludado de vidro fosco + chime suave e limpo de notificação no incremento do contador.

### Ato 4: O Hero Beat — Do Pedido ao Testemunho (Frames 540 a 750 | 00:18 – 00:25)
- **Câmera & Composição (Clímax):**
  - Macro zoom no modal `#modalViewPrayer` exibindo o pedido de Maria Silva.
  - O switch mecânico `#swipeAnswered` desliza para a direita com física elástica (`cubic-bezier(0.34, 1.56, 0.64, 1)`).
  - Ao atingir o final da pista, o botão acende em luz âmbar/laranja vívida (`#ff7700`) com `box-shadow: 0 0 16px rgba(255, 119, 0, 0.8)`.
  - Imediatamente, o card dourado `#prayerGoldAnswer` se desdobra banhado em luz ouro (`#ffd700`): *"Graças a Deus ela teve alta hospitalar ontem!"*.
  - Ao fundo, o contador `Respondidos` salta de 8 para 9 com brilho expansivo.
- **Tipografia Cinética:**
  - `TRANSFORMANDO PEDIDOS` / `EM TESTEMUNHOS VIVOS` em tipografia com acabamento dourado e glow sutil.
- **Locução:** *"E quando a resposta chega, toda a igreja celebra junta — transformando pedidos em testemunhos registrados em ouro."*
- **Áudio / SFX:** Snap mecânico tátil no switch, seguido por um acorde cintilante e quente (shimmer chord) na expansão dourada.

### Ato 5: Assinatura & Call to Action (Frames 750 a 900 | 00:25 – 00:30)
- **Câmera & Composição:**
  - Toque no botão `#btnHome`: a `Logo branca - Nova Aurora_transparente.png` pulsa (`scale(0.92) → scale(1.1)`).
  - O modal se recolhe em transição rápida e a câmera recua com grande angular, mostrando o smartphone completo flutuando sobre o fundo noturno com a aurora.
  - A marca `Nome congregação.png` ou `NOVA AURORA` surge centralizada com o subtítulo *"A presença digital da sua igreja, viva todos os dias"*.
  - **End Hold:** O quadro final estabiliza rigorosamente por 1.0 segundo (30 frames) sem cortes abruptos, respeitando o gate G3 do Motionmaxxing.
- **Tipografia Cinética:**
  - `NOVA AURORA`
  - `A presença digital da sua igreja, viva todos os dias.`
- **Locução:** *"Nova Aurora. A presença digital da sua igreja, viva todos os dias."*
- **Áudio / SFX:** Acorde pleno e quente que se sustenta e dissolve suavemente no silêncio aos 30.0s.

---

## 3. Conformidade com os Gates do Motionmaxxing (Mog Check)

| Gate | Requisito do Protocolo | Implementação no Roteiro |
| :--- | :--- | :--- |
| **G0 (Render)** | Arquivo decodificável, sem telas pretas, áudio e duração precisos (30s) | Configurado para 1920x1080 @ 30fps (900 frames) |
| **G1 (Proof Readable)** | Texto de interface legível (altura mínima $\ge 0.04 H$), enquadramento $\ge 0.55 W$ | Enquadramentos macro de celular com fontes nítidas e escala apropriada |
| **G2 (No Dead Frames)** | Sem estagnação visual $> 3$ quadros consecutivos | Câmera em drift contínuo, luzes pulsantes e física nas transições |
| **G3 (End Hold)** | Tela final mantida entre 0.6s e 1.4s; bloco final $\le 25\%$ do filme | End hold exato de 1.0s (30 frames); Ato 5 dura 5s (16.6% do filme) |
| **G4 (One Hero)** | Um protagonista visual por frame (hierarquia nítida) | Alternância clara: Céu/Rua → Menu → Lista de Oração → Switch Dourado → Marca |
| **G5 (No Page Chrome)** | Zero contadores de slides, rótulos de cantos ou elementos falsos | Layout 100% nativo do app, eliminando todo HUD artificial |
