# Agenda de produção — Desktop 2.1.0

A branch `feature/windows-desktop-offline` inclui uma visão semanal de segunda a domingo. O usuário pode criar, editar e cancelar programações com data, turno, horários, FP, produto/variação, código de produto, quantidade e observações. Horários após a meia-noite são aceitos. A linha não aceita intervalos sobrepostos. A FP fica copiada no registro; se a revisão ou os postos mudarem, o atalho de montagem pede revisão da programação.

O calendário fica em `config.productionAgenda` e participa da mesma gravação SQLite/outbox, revisão remota e resolução de conflitos já existentes. Cancelar mantém o registro. FPs referenciadas não são excluídas pelas ações de limpeza.

## Google Agenda: envio em uma direção

1. Abrir Agenda de produção, cadastrar a semana e conferir a lista em **Enviar semana ao Google**.
2. Autorizar os itens explicitamente. Esse consentimento persistido permite reenviar alterações futuras e cancelamentos dos mesmos itens.
3. O programa envia ao backend quando as alterações do Gestor estiverem sincronizadas e sem conflito. Uma fila pendente no SQLite ou um conflito bloqueia exportação. Sem internet, o consentimento e o planejamento permanecem locais, com nova tentativa periódica.
4. O servidor lê o registro já confirmado no Neon, nunca aceita um evento arbitrário montado pelo cliente. Tokens do Google são obtidos no servidor via Vercel Connect, vinculados ao usuário da sessão.
5. O ID Google é determinístico por usuário, calendário e programação. Um retry não cria outro evento.
6. Alterações diretas no Google exigem revisão. Atualização usa `If-Match`/ETag. O botão **Revisar Google** mostra as versões e exige uma escolha explícita antes de substituir o evento. Um evento removido ou que não pertença à programação não é recriado automaticamente.

Não são enviados nomes de funcionários ou convites. Os eventos são privados e usam America/Sao_Paulo. O calendário é definido no servidor, não em parâmetros enviados pelo cliente.

## Ativação necessária (pendente)

O formulário Google da Vercel exige **Client ID e Client Secret próprios**. A conexão Google Calendar do ChatGPT não é reutilizada pelo programa.

- Registrar um aplicativo OAuth Web no Google Cloud, habilitar Calendar API, configurar a tela de consentimento/testadores e incluir `https://connect.vercel.com/callback` como URI de redirecionamento.
- Criar um conector Google dedicado ao projeto de teste e vinculá-lo somente ao ambiente correspondente.
- Solicitar somente `https://www.googleapis.com/auth/calendar.events`. O usuário deve revisar e autorizar esse acesso na tela Google.
- Definir, somente no servidor de teste: `GOOGLE_CALENDAR_CONNECTOR` (UID retornado pela Vercel), `GOOGLE_CALENDAR_ID` (calendário escolhido) e `APP_ORIGIN=https://project-fj4by.vercel.app`.
- Aplicar `db/migrations/004_production_agenda_google.sql` apenas na branch Neon `windows-desktop-test`. Credenciais e tokens nunca entram no código nem no instalador.
- Redeploy do backend; clicar em **Conectar Google Agenda**, autorizar no navegador e voltar ao aplicativo.

A integração só estará operacional após esse cadastro e autorização. Até lá a agenda local e a sincronização Gestor/Neon funcionam; o programa informa que Google não está configurado.

## Validação

Testes cobrem datas inválidas, semana/mês/ano, turno noturno, sobreposição de linha, persistência/fila offline, privacidade do payload, ID idempotente, edições concorrentes no Google, exclusão remota e autenticação do endpoint. O smoke Windows confere a renderização de sete dias e os controles da integração, com captura `agenda-windows.png` no artefato.

Ainda pendente: consentimento Google real e envio/alteração/cancelamento de um evento no calendário escolhido, além de teste manual da agenda no computador do usuário. A política de 8 horas offline e a autenticação administrativa compartilhada permanecem nesta versão de teste.
