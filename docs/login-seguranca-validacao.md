# Gerenciador de Escala — login e diagnóstico de segurança

## Escopo e preservação

Origem: a1b54ed81b384e78d5e9d531271c63f7e7805d1d da feature/windows-desktop-offline, repositório FernandoReys/gestor-de-subconjunto. Trabalho isolado em **feature/login-profissional**. Projeto exclusivo: gestor-desktop-test, equipe fernando-8621. Domínio público preservado: https://project-fj4by.vercel.app.

A stack efetivamente existente é DOM/JavaScript, APIs Node CommonJS, domínio de dashboard em TypeScript e Electron/SQLite. Não foi recriada como Next.js. Não houve migração, leitura de dados de funcionários do banco real, alteração de hashes, senhas, credenciais, registros operacionais, URLs OAuth ou papéis. O nome visual mudou; identificadores técnicos, tabelas, repositório e projeto permanecem.

Não usar a marca oficial Fresenius Kabi sem autorização. A imagem de referência de layout foi consultada e usada como inspiração; a imagem de logotipo recebida não foi incorporada. O aplicativo apresenta sua identidade independente.

## Interface

Desktop com painel azul de aproximadamente 55%, tipografia Inter, formas curvas e ilustração de planejamento; formulário ocupa 45%. A ilustração é decorativa, sem indicadores operacionais fictícios. Em celulares o formulário tem prioridade e o painel institucional fica compacto. Dark mode existente permanece compatível. Fonte e ícones Lucide servidos localmente, com licenças incluídas no build. Sem CDN ou chamadas externas para fontes/ícones.

Campos com rótulos explícitos, autocomplete adequado, limite de caracteres, foco visível, indicação de erro, mostrar/ocultar senha e indicador real de carregamento. O botão de entrada agora seleciona explicitamente type=submit, evitando confundir a ação com o botão de mostrar senha. Senha limpa após erro, sucesso e saída. Após autenticação, a navegação vai para #overview, sem aceitar redirecionamentos externos vindos da query string. Dados internos são retirados do DOM ao voltar para o login.

Não foi criado “Manter conectado”: a sessão atual continua com limite de 8 horas. “Esqueci minha senha” só aparece quando o backend não autenticado confirma passwordRecovery=true, isto é, identidades individuais habilitadas. A recuperação existente usa código único emitido pelo administrador, não um e-mail fictício. Foi corrigida a visibilidade do diálogo de recuperação antes do login. Falha ao encerrar sessão no servidor não é mais apresentada silenciosamente como logout concluído.

## Diagnóstico real do domínio atual — 19/10/2026

- HTTP redirecionou a HTTPS e respondeu 200.
- HTTPS respondeu 200 usando a validação TLS padrão do cliente, sem desabilitar validação de certificado.
- HSTS já presente no Vercel: max-age=63072000; includeSubDomains; preload. Não era uma ausência de HTTPS.
- CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy e X-Content-Type-Options não apareceram na resposta HTML inicial verificada.
- A conexão TLS direta por socket não pôde resolver o hostname neste ambiente; o tráfego HTTPS utiliza o caminho de rede/proxy disponível. Portanto, **a cadeia de origem, emissor e validade do certificado não foram homologados independentemente**. Essa limitação não prova certificado inválido.
- Não foi fornecida, nesta solicitação, uma captura da mensagem exata de segurança do navegador. Não foi confirmado um alerta Safe Browsing, certificado vencido ou mixed content. O relato de aplicativo Google não verificado é uma categoria separada de TLS/HTTPS.
- A análise dos recursos novos e do frontend não identificou carregamento de ativos por HTTP. xmlns=http://www.w3.org/... em SVG é um namespace, não mixed content.
- O callback Google do site público, acessado sem state, redirecionou de volta ao aplicativo com falha controlada. Isso indica configuração OAuth detectada pelo backend atual, não comprova autorização de conta ou eventos sincronizados.

## Correções de proteção propostas no Preview

CSP com script-src 'self', sem unsafe-inline/unsafe-eval para JavaScript; script-src-attr 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-src 'none'. Conexões, fontes e ativos restritos ao próprio aplicativo. Navegação de topo para OAuth Google continua possível. Vercel acrescenta upgrade-insecure-requests; o servidor local não força HTTPS sobre localhost.

X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy no-referrer, Permissions-Policy restringindo câmera/microfone/geolocalização/pagamento/USB e COOP same-origin. HSTS mantido/configurado para HTTPS. A mesma política base é exercitada pelo servidor de teste.

Exceção explícita: style-src permite unsafe-inline porque o sistema existente utiliza larguras dinâmicas de gráficos e estilos de tabelas. Isso não libera scripts inline. Retirar essa exceção exigiria refatoração e validação separadas do dashboard. CSP do Electron existente permanece preservada; não houve liberação de Node no renderer, desativação de sandbox do aplicativo ou inclusão de chaves no cliente.

## Autenticação, perfis e limitações existentes

Cookies já utilizam HttpOnly, SameSite=Strict e Secure no Vercel/HTTPS, com validade limitada. Rotas de dados verificam sessão e operações mutáveis verificam origem. Identidades individuais, revogação persistente, limitação de tentativas no SQL e auditoria já existem na migração 005 e dependem de AUTH_USERS_ENABLED=1.

Com esse flag desligado, continua existindo apenas o acesso legado de administrador configurado por hash. Nesse modo a limitação em memória não é distribuída entre instâncias, e logout remove o cookie do navegador mas um token previamente copiado pode continuar válido até expirar. Essa limitação não foi escondida nem “corrigida” com uma lista em memória inadequada a serverless. **Ativar e homologar o modo de identidades já existente é requisito para uso industrial**, com conferência do administrador e nova entrada, sem criar contas permanentes de teste.

Testes de interface usam PostgreSQL PGlite descartável e credenciais aleatórias apenas durante o processo. Não existe conta administrativa oculta no build ou no banco real. OpenAI/Google continuam no servidor; configurações e segredos não foram copiados para o Preview.

## Google OAuth: preparação profissional

Nome a cadastrar em Branding: **Gerenciador de Escala**. Não usar logo Fresenius sem autorização. Configurar e-mail real de suporte e contato do desenvolvedor; os valores não foram inventados nem alterados automaticamente.

O escopo implementado continua **https://www.googleapis.com/auth/calendar.app.created**: criar calendário exclusivo e gerenciar eventos em calendários criados pelo aplicativo, em vez de acesso amplo a todos os calendários. Confirmar no Google Auth Platform > Data Access a classificação atual e eventuais exigências do Google; não presumir aprovação por mudar o nome ou publicar o código.

Páginas públicas preparadas no mesmo domínio do aplicativo:

- /sobre.html — apresentação do aplicativo e finalidade das integrações.
- /privacidade.html — dados, finalidade, tratamento Google/OpenAI, armazenamento, desconexão e solicitações.
- /termos.html — condições do piloto e limites operacionais.

São documentos do piloto, com pendências explicitadas: controlador institucional, contato de privacidade, base legal, retenção/descarte, acordos com operadores e eventual transferência internacional. Não representam certificação LGPD nem política institucional aprovada. Não submeter à verificação oficial como se tais pendências já estivessem resolvidas.

Procedimento Google:

1. Identificar o projeto Google Cloud e conferir Branding, Audience, Data Access e Clients.
2. Em Testing, incluir somente contas autorizadas como test users; esse modo pode manter avisos e limitação de vida do refresh token.
3. Antes do uso amplo, definir responsável institucional e contatos, aprovar documentos públicos e conferir se a aplicação se enquadra em exceção ou precisa de verificação de marca e/ou escopos.
4. Verificar os domínios associados no Search Console quando exigido. O Google avalia os domínios do aplicativo, política, termos, origens e redirecionamentos.
5. Se solicitados, preparar justificativa do escopo, vídeo real mostrando consentimento e uso, e responder à equipe de verificação. A aprovação pertence ao Google.
6. Nome, branding e estado Published não significam que a aplicação já foi verificada. Não foi submetido um pedido nem aceita condição legal nesta etapa.

Callback atual preservado: **https://project-fj4by.vercel.app/api/google-callback.js**. Não substituir pela URL temporária do Preview. OAuth real não deve ser iniciado no Preview sem configurar um cliente/redirect de teste correspondente.

Fontes oficiais consultadas:

- https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification
- https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification
- https://developers.google.com/workspace/calendar/api/auth
- https://vercel.com/docs/project-configuration/git-configuration
- https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados
- https://www.gov.br/anpd/pt-br/assuntos/assuntos-internacionais/transferencia-internacional-de-dados

## Domínio próprio

É tecnicamente viável utilizar gerenciadordeescala.com.br no mesmo projeto, após autorização, registro/disponibilidade e validação DNS. Disponibilidade, titularidade e preço não foram confirmados; nada foi comprado ou alterado.

Depois de aprovado, conectar o domínio no Vercel, aguardar TLS, verificar o domínio no Search Console quando exigido, publicar políticas no domínio definitivo, acrescentar a origem e callback exatos no cliente OAuth e atualizar APP_ORIGIN/GOOGLE_REDIRECT_URI. Manter as URLs antigas durante a transição planejada; não redirecionar códigos de callback para domínios diferentes de forma improvisada. Uma alteração de branding/domínio pode exigir nova revisão Google.

## Publicação controlada

A branch feature/login-profissional está desabilitada para auto-deploy em vercel.json. Isso impede que o push gere publicações em outros projetos conectados ao mesmo repositório. O Preview deve ser criado manualmente **somente** em gestor-desktop-test. Production permanece na feature/windows-desktop-offline até a aprovação visual e dos testes.

O workflow de validação foi estendido à nova branch, incluindo testes de login em cinco resoluções e capturas desktop/celular/tema escuro. Não há solicitação de novo instalador Windows.

## Validação realizada até a preparação do Preview

- Instalação das dependências locais de fonte/ícones, build, lint e typecheck aprovados.
- 58 testes de backend/domínio aprovados: autenticação, permissões, SQL, escala, fila offline, conflitos, OpenAI Responses, OAuth/tokens e política de cabeçalhos.
- Novos testes UI preparados: login HTTP real contra SQL descartável, credencial inválida, cookie, reload, logout/revogação, rota protegida, teclado, recuperação, CSP, cinco viewports e temas.
- O primeiro harness de captura Electron falhou com UnknownVizError; foi corrigido e o teste completo passou localmente, conforme detalhado abaixo. O CI da correção foi confirmado com sucesso no runner Windows, conforme resultado final abaixo.
- Não há comprovação de aviso externo eliminado antes da publicação e testes efetivos do Preview. Verificação oficial Google, cadeia TLS independente e governança LGPD continuam etapas externas pendentes.

## Resultado da revisão de interface

O teste inicial de screenshots encontrou UnknownVizError ao capturar uma janela offscreen com capturePage. Corrigido o harness para usar paint/invalidate, conforme o fluxo oficial Electron; as capturas agora aguardam frame novo, dimensões corretas e fim das animações. Isso não enfraquece o sandbox do aplicativo entregue. O comando headless local de testes usa no-sandbox apenas no processo descartável deste container; a aplicação desktop e o CI mantêm sandbox no renderer.

Teste UI local completo aprovado com SQL descartável: entrada válida, rejeição de senha inválida, cookie HttpOnly, sessão após reload, logout com revogação SQL, roteamento #overview, proteção de dados, recuperação antes do login, teclado/Tab, CSP sem violações e viewports 1920x1080, 1366x768, 768x1024, 390x844 e 320x740. Capturas visuais revisadas em desktop/celular; refinados espaçamento no título mobile, azul principal do botão, contraste do placeholder e alvos de toque dos links.

Primeiro Preview criado manualmente no projeto gestor-desktop-test, branch feature/login-profissional, commit ba7ff70, Ready:
https://gestor-desktop-test-fmo9roy76-fernando-8621.vercel.app/

Inspeção real em Chrome: título correto, imagens carregadas, campos com autocomplete, links de privacidade/termos e sem overflow horizontal em 1363x936. Não houve erro de CSP registrado nessa inspeção; os únicos erros capturados vieram de uma extensão do navegador de testes, não do código do sistema.

**Limitação do Preview:** /api/auth.js responde 503 porque as credenciais estão configuradas em Production, não no novo ambiente Preview. Não se copiaram segredos para outro escopo nem se criou conta permanente de teste. O login funcional foi validado contra o SQL descartável, não contra usuários reais no Preview. Para testar uma conta real nesse Preview é necessário configurar credenciais autorizadas para esse ambiente (preferencialmente restritas à branch e com banco de teste) antes da homologação final.

Não afirmar que os avisos de verificação Google foram eliminados: o backend não decide a aprovação de marca, domínios ou consentimento. A versão pública permanece intacta para revisão do Preview, e o novo domínio não foi contratado nem configurado.

## Arquivos

Interface: src/client/index.html, src/client/login.css, src/client/login-ui.js, src/client/app.js e src/client/security-ui.js. Backend: api/auth.js (apenas capacidade pública da recuperação, sem alteração de credenciais). Servidor/proteções: server.js, shared/security-headers.cjs e vercel.json. Build/dependências: scripts/build.js, package.json e package-lock.json. Conteúdo público: public/favicon.svg, public/legal.css, public/sobre.html, public/privacidade.html e public/termos.html. Validação: tests/login-ui-smoke.cjs, tests/security-headers.test.js e .github/workflows/web-validation.yml. Este diagnóstico: docs/login-seguranca-validacao.md.

Capturas verificadas do mesmo código com autenticação de teste habilitada: [desktop](assets/login-desktop.png) e [celular](assets/login-mobile.png). Não mostram dados de produção.

A sondagem HTTP externa do Preview foi redirecionada à proteção Vercel. Seus headers pertencem à página de proteção, e não foram usados como comprovação dos headers do aplicativo. O navegador autenticado abriu a interface real; a verificação dos headers está coberta pelos testes locais e ainda requer inspeção autenticada da implantação final.

## Resultado final de homologação técnica

Código implantado: 5e2ff4eee8f07bbdd9ecd6e329236ceba6d8819a, branch feature/login-profissional. Preview Ready no projeto correto: https://gestor-desktop-test-e3qejj4yp-fernando-8621.vercel.app/ . Abertura real verificada no navegador.

GitHub Actions https://github.com/FernandoReys/gestor-de-subconjunto/actions/runs/39276336988 : job web concluído com sucesso. npm ci, lint, typecheck, 58 testes, build e três suítes de interface passaram, incluindo regressão operacional, segurança/perfis e login. O harness agora também aguarda a conclusão assíncrona do redimensionamento no Windows antes de conferir o viewport. Capturas desktop, notebook, tablet, celular, tela estreita e tema escuro foram geradas. Empacotamento Windows foi intencionalmente omitido.

O Preview mantém a limitação de autenticação 503 descrita acima. Não houve teste de credenciais reais nesse ambiente, autorização Google de uma conta real ou chamada OpenAI paga nesta etapa. A ausência de erros de aplicativo no console observado não substitui esses testes. Produção, main e banco real permanecem preservados. A aprovação visual não encerra as pendências de configuração e homologação externa.
