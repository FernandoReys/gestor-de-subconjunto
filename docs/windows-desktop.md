# Gestor de Subconjunto — Windows Desktop

Branch exclusiva: `feature/windows-desktop-offline`. A `main` e o banco de produção não fazem parte desta implementação.

## Implementado

- Electron, assets locais em protocolo `gestor://app`, preload isolado, sandbox, Node desabilitado no renderer, CSP e IPC restrito ao frame principal.
- SQLite persistente em `app.getPath('userData')/gestor.sqlite`, WAL, synchronous FULL, migração versionada e backup consistente pelo botão **Backup SQLite**. Reinstalação/desinstalação não apaga os dados.
- Fila transacional: alteração e outbox gravadas juntas. O envio em andamento é imutável; edições posteriores permanecem no estado local e ganham nova operação após o ACK. Repetições usam a mesma chave UUID.
- Sincronização autenticada por HTTPS, com cursor de revisão, backoff de até 60 segundos, validação no servidor, autor derivado da sessão e device UUID. Cookies não são expostos ao renderer nem credenciais de banco incluídas no pacote. A sessão é protegida pelo `safeStorage` do Windows.
- Acesso offline após login online enquanto a sessão de oito horas é válida. Ao expirar, é preciso reconectar e entrar. Logout remove a credencial, preservando o SQLite e as pendências.
- Indicadores de conexão, pendências, última sincronização, erro, repetição manual e revisão de versões.
- Conflitos conservadores por **espaço de trabalho inteiro**: nenhum merge automático de funcionários, FPs ou escalas. Alterações simultâneas e versões remotas mais recentes exigem decisão explícita; confirmação de escala bloqueada enquanto houver conflito. A revisão mostra os dois JSONs completos. A escolha arquiva ambos no SQLite. Se o servidor mudou de novo, o próximo envio conflita novamente.
- Histórico remoto imutável de revisões completas: exclusões são representadas pela ausência na nova revisão, preservando os registros antigos no histórico. Não há remoção física do histórico nem tombstones individuais nesta primeira versão.
- Importação opcional **Importar dados web**, lendo `/api/state.js`, somente no espaço desktop vazio e conectado. A web não é escrita.
- NSIS x64, atalho, escolha de pasta e desinstalador; workflow Windows com testes, smoke Electron, instalador e SHA256 no artefato por 30 dias.

## Isolamento e configuração do servidor de teste

A sincronização usa tabelas próprias (`desktop_workspace`, `desktop_changes`) e **não compartilha gravações com as tabelas legadas da web**. Os desktops sincronizam entre si; alterações posteriores na web não entram automaticamente. Isso evita que o endpoint legado, que não controla revisões, invalide a proteção de concorrência. A unificação web/desktop é uma próxima migração que exige autorização e revisão do endpoint legado.

1. Escolha/crie uma branch Neon ou PostgreSQL de teste isolado. Não use a conexão de produção.
2. Revise e aplique `db/migrations/003_desktop_sync.sql` nessa conexão direta de teste. O aplicativo não executa migração PostgreSQL automaticamente.
3. Publique um backend de teste com o código desta branch. Configure apenas no servidor:
   - `DESKTOP_SYNC_ENABLED=1`
   - `DESKTOP_DATABASE_URL` (conexão do banco isolado)
   - `AUTH_SESSION_SECRET` (mínimo de 32 caracteres)
   - `PILOT_ADMIN_PASSWORD_HASH` (gerado por `node scripts/hash-password.js`)
   - `DATABASE_URL` somente se for importar a cópia dos dados web; nunca é usada pelo endpoint desktop.
4. No instalador, informe a origem HTTPS do backend (sem caminho) e entre com a conta do backend. O backend atual mantém a conta administrativa `fernando`; a senha nunca é fixada no aplicativo.
5. Cadastre dados no desktop ou importe uma única cópia web. Instale num segundo computador, entre no mesmo backend e sincronize.

**Nenhuma conexão real, migração remota ou publicação do backend é executada pelo workflow de build.** Sem o backend acima, o instalador abre, mas não permite primeiro login nem sincronização. Não confundir geração do instalador com homologação do ambiente completo.

## Desenvolvimento e empacotamento

Requer Node 24 e Windows com ferramentas nativas caso não exista prebuild SQLite.

```powershell
npm ci
node node_modules/electron/install.js
npm test
npm run build
npm run desktop:rebuild
npm run test:electron
npm run desktop:pack
```

Para abrir em desenvolvimento, após rebuild: `npm run desktop`. O rebuild adapta SQLite à ABI do Electron. Para voltar aos testes executados pelo Node, `npm rebuild better-sqlite3`.

O push nesta branch inicia `.github/workflows/windows-desktop.yml`. Em Actions → Windows Desktop → execução bem-sucedida → Artifacts, baixe `Gestor-Windows-x64-<commit>`, extraia o ZIP e execute `Gestor-de-Subconjunto-2.0.0-Setup.exe`. O ZIP contém `SHA256SUMS.txt` para conferência. Também há `workflow_dispatch`, sempre restrito a esta branch.

## Validação e limites

Validação local inicial: 24 testes aprovados, build estático e verificação de sintaxe. Testes de PostgreSQL usam PGlite (motor PostgreSQL embarcado), não Neon real. Cobrem migração repetível, revisão compare-and-swap, idempotência, autor, histórico de exclusões e disputa pela mesma revisão. Testes SQLite cobrem reinício, backup, fila imutável, resposta perdida, edição durante envio, conflitos e sessão expirada. Testes do endpoint cobrem autenticação, origem, configuração desabilitada e dados inválidos.

O workflow executa o smoke no Electron real em Windows: assets locais, preload, isolamento, sandbox, ausência de Node no renderer, SQLite e bloqueio de primeiro acesso offline. Ele **não substitui testes manuais de instalação e operação em Windows 10 e 11**.

Pendente para homologação:

- Backend HTTPS de teste configurado e migração aplicada com autorização ao banco escolhido.
- Teste em dois computadores contra Neon de teste, desconectar durante edição, reconectar, reiniciar e resolver conflito conferindo todas as entidades.
- Instalação, upgrade, desinstalação, impressão/PDF, exportação CSV e restauração de backup em Windows 10 e 11. Para restaurar: fechar o app, guardar uma cópia do perfil e substituir o SQLite com a mesma versão, sem arquivos WAL/SHM residuais; não restaurar enquanto aberto.
- SQLite não é cifrado. Cookie é cifrado via Windows, mas dados e backups requerem conta Windows protegida, ACL/BitLocker e política corporativa. Expiração offline não protege contra leitura direta do arquivo por alguém com acesso ao perfil.
- Autenticação herdada usa uma conta administrativa compartilhada. Autor registrado é a identidade dessa sessão; ainda não há perfis individuais. Não declarar auditoria nominal multiusuário.
- Assinatura Authenticode depende de certificado/serviço de assinatura da organização. A build inicial é sem assinatura; não há credenciais de assinatura no repositório. TI deve homologar antes de distribuir.
- O merge manual assistido é escolha de uma versão inteira; para combinar dados, compare os snapshots e ajuste antes de selecionar a local. Backups mantêm ambas as versões, mas não há editor de merge por campo.

Não é uma liberação automática para produção. A entrega de código e do instalador deve ser acompanhada das evidências da execução Actions e das validações ainda pendentes.
