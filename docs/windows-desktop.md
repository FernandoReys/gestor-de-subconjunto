# Gestor de Subconjunto — Windows Desktop (planejamento de implementação)

Branch de trabalho: `feature/windows-desktop-offline`. A versão web na `main` permanece intacta.

## Estado atual verificado
- Frontend em `src/client` (HTML, CSS e JavaScript), compilado para `dist` por `scripts/build.js`.
- Servidor Node `server.js` e endpoints `api/auth.js`, `api/state.js`.
- Persistência remota PostgreSQL/Neon. O modo local documentado no README é rascunho, **não** sincronização multiusuário.
- README avisa que faltam perfis individuais e auditoria por autor; não liberar piloto com dados reais antes de corrigir.

## Entrega prevista
1. Electron: janela desktop com ícone, preload isolado, contextIsolation e nodeIntegration desabilitado. Carregar os assets locais, não simplesmente abrir a URL Vercel.
2. SQLite: armazenamento persistente em `app.getPath('userData')`, com migrações e cópia de segurança. Não embutir DATABASE_URL nem segredos de servidor no executável.
3. API de sincronização autenticada no backend: alterações com UUID, revision, deviceId, authorId, timestamps e idempotency key. Regras de autorização verificadas no servidor.
4. Outbox local transacional; push e pull incrementais com cursor. Retentativas exponenciais e reprocessamento idempotente.
5. Conflitos: não sobrescrever silenciosamente FP, funcionários ou escalas confirmadas. Exibir revisão e bloqueio de confirmação quando necessário. Exclusões com tombstones.
6. Sessão offline: acesso local controlado após autenticação prévia e prazo configurado; dados locais protegidos conforme política da empresa.
7. UI: indicadores Online / Offline / Sincronizando / Conflito, quantidade pendente, última sincronização e ação de repetir.
8. Empacotamento Windows x64 com electron-builder/NSIS; instalador Setup.exe, desinstalador e atalho. Assinatura de código para distribuição corporativa.
9. Testes: desligar internet durante edição, reiniciar app, sincronizar novamente, duplicação, alterações simultâneas, migração de schema, sessão expirada e backup/restore.

## Critérios de aceite
- Inicializa offline após primeira autenticação e instalação.
- Alterações locais sobrevivem a reinício e não desaparecem em falhas de rede.
- Nenhuma mutação é aplicada duas vezes após retry.
- Conflitos não destroem registros de outro dispositivo.
- A versão web continua operacional.
- Instalador testado no Windows 10/11, com verificação de assinatura e política de TI.

## Segurança e implantação
A implementação exige revisão dos endpoints e do esquema antes de codificar sincronização. Nenhum banco de produção deve ser alterado sem backup/branch de teste. Não usar o modo de apresentação como persistência definitiva. A distribuição para computadores da empresa depende de autorização de TI.

**Status:** planejamento inicial; Electron, SQLite, sincronização e instalador ainda não implementados.
