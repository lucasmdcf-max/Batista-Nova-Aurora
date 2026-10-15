# Regras do Projeto Nova Aurora

## Visão Geral da Arquitetura
- **Tipo**: Progressive Web App (PWA) com Parallax (4 camadas) e Firebase Hosting / Firestore.
- **Stack**: Vanilla JavaScript (`js/`), HTML5 (`index.html`), CSS3 moderno (`css/`), Service Worker (`sw.js`).
- **Servidor Local**: `server.js` (Node.js).
- **Deploy**: Firebase Hosting via CLI (`firebase deploy`).

## Diretrizes de Otimização no Projeto
- Priorize Vanilla JS limpo e modular.
- Não introduza frameworks pesados (React/Vue) a menos que explicitamente solicitado.
- Para alterações de estilos ou lógica, edite cirurgicamente os arquivos correspondentes em `css/` ou `js/`.
- Mantenha assets de imagem otimizados em `icons/` e `FUNDO APP/`.
- **Auto Commit & Deploy Obrigatório**: Sempre commitar as alterações no Git, fazer `git push` e executar `firebase deploy` diretamente ao finalizar qualquer modificação, sem solicitar confirmação prévia do usuário.
