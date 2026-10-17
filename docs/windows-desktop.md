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

## Evidências da execução em 17/10/2026

- Commit de implementação: `cb317b51dbad671eaf7a5d199b3d43bb164020ca`.
- [GitHub Actions Windows Desktop #1](https://github.com/FernandoReys/gestor-de-subconjunto/actions/runs/39074277150): **sucesso**. Os 24 testes passaram no runner Windows; smoke Electron real passou; NSIS gerado e SHA256 emitido. Assinatura verificada como `NotSigned`, conforme esperado sem certificado.
- [Baixar artefato Windows x64](https://github.com/FernandoReys/gestor-de-subconjunto/actions/runs/39074277150/artifacts/12116840852): ZIP de aproximadamente 105 MB, contém `Gestor-de-Subconjunto-2.0.0-Setup.exe` e `SHA256SUMS.txt`, expira em 16/11/2026. Requer acesso ao GitHub.
- Neon: criada a branch isolada `windows-desktop-test` (`br-cold-sun-b4vrukpl`) no projeto `gestor-de-subconjunto` (`silent-block-63843978`). Migração 003 aplicada **somente nessa branch**. Teste no Neon real de primeira revisão, reenvio idempotente e conflito de revisão passou; fixtures foram revertidas por subtransação. Conferência final: revisão `0`, estado vazio, histórico com `0` linhas. Produção não foi modificada.
- Backend HTTPS de teste: **bloqueado**. A conexão Vercel retornou HTTP 403 ao criar `gestor-desktop-test`: sem permissão de criação. Não há CLI Vercel autenticada disponível neste ambiente. Nenhum projeto Vercel existente foi alterado. É necessário disponibilizar um backend de teste e suas variáveis antes de usar o primeiro login/sincronização.
- Não há teste completo desktop → HTTPS → Neon, instalação interativa em Windows 10/11, impressão ou assinatura corporativa concluídos. O sucesso da build não significa aceite de produção.

## Backend de teste configurado — continuação em 17/10/2026

O bloqueio da integração Vercel foi contornado usando a sessão autorizada no navegador. Projeto separado criado: `gestor-desktop-test` (`prj_WRJOX5uyWODywN7GxOh8D5Fs5prZ`), conectado ao repositório existente e com branch de implantação `feature/windows-desktop-offline`.

- Servidor a informar no aplicativo Windows: `https://project-fj4by.vercel.app`.
- [Deploy configurado e Ready](https://vercel.com/fernando-8621/gestor-desktop-test/BWYm6BexbS48kzKGQizZMhtHGzsT), commit `1469c5d`. O ambiente chamado Production pertence apenas a este novo projeto de teste; os projetos web originais e o banco de produção não foram alterados.
- Variáveis `DESKTOP_DATABASE_URL`, `AUTH_SESSION_SECRET` e `PILOT_ADMIN_PASSWORD_HASH` salvas como **Secret** somente no projeto novo; `DESKTOP_SYNC_ENABLED=1` como Config. Valores e senha inicial não estão neste documento, no repositório nem no instalador.
- Banco conectado à branch Neon `windows-desktop-test` (`br-cold-sun-b4vrukpl`). A conexão existente da branch foi utilizada. A tentativa opcional de criar uma role mais restrita foi rejeitada pela revisão automática e não foi executada.
- Teste remoto real com os módulos Store/Sync do desktop e dois SQLite locais: autenticação, bloqueio sem sessão (401), envio SQLite A → HTTPS → Neon → SQLite B, edição offline persistida após reabertura, conflito compare-and-swap real sem perda da versão local, decisão explícita e retry idempotente aprovados.
- Logout validado: cookie removido e requisição autenticada seguinte retorna 401. O harness inicial mantinha indevidamente o cookie antigo; o tratamento de cookie vazio no harness foi corrigido e esse caso foi reexecutado com sucesso.
- Valores temporários removidos por nova revisão; conferência no Neon: revisão `4`, nenhum funcionário e nenhuma nota de teste no estado atual, quatro revisões no histórico de auditoria.
- Os testes usaram módulos desktop no runtime Node e API HTTPS real. Ainda faltam instalação/uso no Windows 10 e 11, dois computadores físicos, impressões e assinatura Authenticode.
- O instalador do Actions #1 continua válido: o código do desktop não foi alterado nesta configuração. A conta inicial do backend é `fernando`, com senha exclusiva fornecida ao proprietário fora do repositório.
