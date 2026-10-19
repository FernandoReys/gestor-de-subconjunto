# Web 2.5 — OpenAI e Google Agenda

## Alvo verificado

- Repositório FernandoReys/gestor-de-subconjunto, branch feature/windows-desktop-offline.
- Projeto Vercel gestor-desktop-test, equipe fernando-8621, domínio https://project-fj4by.vercel.app.
- Painel confirmou Ready no commit e79700c antes da intervenção. Production neste projeto significa o ambiente do piloto, não o projeto principal.
- Neon windows-desktop-test (br-cold-sun-b4vrukpl), projeto silent-block-63843978. Backup sem compute: br-winter-queen-b4kkjfjd.
- Migração 006 aditiva: tokens criptografados, estados OAuth descartáveis, orçamento de IA e auditoria de integrações. Nenhum registro de funcionário, FP, escala ou agenda apagado.

## Diagnóstico e implementação

A rota /api/support.js ignorava OPENAI_API_KEY e tentava apenas Vercel AI Gateway. Agora usa o SDK oficial openai (7.39.0) e Responses, com store:false, histórico limitado, gpt-6-luna configurável em OPENAI_MODEL, sem retry automático. Não há mais dependência funcional do Gateway para o chat.

O backend exige sessão e origem do site; ferramentas são uma allowlist, sem shell/SQL dinâmico. consult_production consulta o SQL autorizado (FPs, agenda até 31 dias, equipe, diagnóstico recalculado). Nomes e habilitações operacionais podem ser necessários; matrícula, motivos de ausência e notas pessoais não são enviados automaticamente. Dados vindos do navegador não substituem consulta ao SQL. Não inclui alterações locais ainda não sincronizadas.

Ferramentas de alteração só preenchem propostas e formulários existentes. A aplicação recalcula a escala, verifica versão local, exige revisão e só grava após confirmação. Limpezas exigem confirmação digitada. Papéis são verificados no backend; o banco aplica permissões quando AUTH_USERS_ENABLED=1. Ações não corrigem ou publicam código arbitrário. Auditoria de propostas/respostas/falhas e gravações marcadas assistant fica em gestor_integration_audit, sem prompt, resposta, senha ou token. A fonte assistant é telemetria; não é prova criptográfica da origem de uma edição. Com identidades ativas, auditoria geral existente também permanece.

Limites persistentes: 10 requisições/minuto por usuário, 100/dia por usuário, 500/dia no piloto, até 3 rodadas de ferramentas e 1.500 tokens de saída por rodada. Isso limita uso, não é um orçamento financeiro exato; configure limite financeiro também na conta OpenAI. Erros distinguem credencial, quota/saldo, rate limit, timeout e indisponibilidade. Guia local é identificado e nunca rotulado IA conectada. Indicador conectado só aparece após resposta real bem-sucedida. Web usa NDJSON incremental; desktop usa JSON e prazo maior, sem segredos no instalador. Conversa fica em memória da sessão; limpar/sair remove o contexto.

Google antes usava Vercel Connect, sem callback próprio. Agora o início é POST /api/calendar-export.js action authorize; callback implementado em GET /api/google-callback.js. State aleatório de uso único, cookie HttpOnly Secure SameSite=Lax, PKCE S256 e validade 10 minutos. Sessão original é criptografada junto ao verificador e revalidada no callback; logout/expiração/revogação impede conexão. Refresh tokens são AES-256-GCM, com AAD por usuário e chave HKDF separada. Nunca vão ao navegador. Reconexão preserva calendário e vínculos; desconectar revoga no Google e remove os tokens utilizáveis, preservando eventos e dados locais.

Escopo exclusivo calendar.app.created: cria calendário **Gestor de Subconjunto — Produção** e gerencia somente calendários criados pelo aplicativo. Não seleciona calendários pessoais arbitrários. Exportação preserva IDs determinísticos, lease, ETag/If-Match, revisão de alterações externas, consentimento por programação e cancelamento explícito. Eventos incluem produto/FP/turno/horário/observações operacionais, sem equipe. Nenhuma importação bidirecional automática. As falhas ficam na auditoria; conflito requer comparação explícita.

## Configuração exata no Vercel do piloto — Production

| Variável | Configuração |
| --- | --- |
| OPENAI_API_KEY | Secret; já observada no painel, nunca revelada |
| OPENAI_MODEL | Opcional; padrão gpt-6-luna |
| GOOGLE_CLIENT_ID | ID do cliente OAuth Web |
| GOOGLE_CLIENT_SECRET | Secret do mesmo cliente OAuth |
| APP_ORIGIN | https://project-fj4by.vercel.app |
| GOOGLE_REDIRECT_URI | https://project-fj4by.vercel.app/api/google-callback.js |
| GOOGLE_TOKEN_ENCRYPTION_KEY | Secret opcional >=32 caracteres; se ausente deriva de AUTH_SESSION_SECRET existente |
| DESKTOP_DATABASE_URL | Secret já existente; somente banco de teste |
| DESKTOP_SYNC_ENABLED | 1, já existente |
| AUTH_SESSION_SECRET | Secret >=32 caracteres existente; não rotacionar sem planejar migração dos tokens |
| AUTH_USERS_ENABLED | 1 para ativar identidades individuais já implementadas; ainda não observado no painel |

APP_ORIGIN e GOOGLE_REDIRECT_URI possuem os valores padrão acima, mas é recomendável cadastrá-los explicitamente. Não use a URL temporária de cada deploy no OAuth. AI_GATEWAY_API_KEY, GOOGLE_CALENDAR_CONNECTOR e GOOGLE_CALENDAR_ID não são necessários nesta implementação.

Google Cloud: cliente Web Gestor de Subconjunto Web, origem https://project-fj4by.vercel.app, URI autorizada **https://project-fj4by.vercel.app/api/google-callback.js**. Calendar API ativada; tela de consentimento com calendar.app.created. Em modo Testing, inclua a conta nos usuários de teste. Autorize pelo botão da agenda do Gestor após redeploy. O consentimento final é do titular da conta. Aplicativos Google externos em teste podem exigir nova autorização quando o refresh token expira conforme política Google.

## Windows

Electron/SQLite/outbox/conflitos existentes preservados. IA e Google só usam backend HTTPS online. A autorização Google no Windows abre a agenda do site no navegador externo; faça login com o mesmo usuário, conecte e retorne ao programa. Não se copiam cookies ou tokens para o navegador. Nenhum novo instalador deve ser gerado nesta etapa.

## Validação

- Lint, typecheck do domínio tipado, build e 56 testes locais aprovados na implementação inicial.
- Novos testes: contrato Responses, contexto, leitura por ferramenta e proposta sem gravação; erros e allowlist; OAuth/PKCE/state/cookie, replay, criptografia/AAD, renovação, desconexão/reconexão, limite persistente e auditoria imutável em PostgreSQL PGlite.
- Testes existentes: IDs determinísticos/ETag/criação/atualização/cancelamento Google com transporte simulado; regressões de regras de escala, permissões, SQL, offline e conflitos.
- Login público real aprovado antes da publicação.
- **Os testes simulados não comprovam chamada real OpenAI nem consentimento/eventos reais Google.** Resultados públicos após deploy serão registrados ao final da validação.

Rollback: voltar o código à versão anterior na mesma branch/projeto; manter tabelas da migração 006 e registros de auditoria. Não apagar ou voltar banco de produção.
