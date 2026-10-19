# Gestor 2.4 — instalação, operação e validação

## Escopo da prévia

Usar somente feature/windows-desktop-offline, projeto gestor-desktop-test e Neon windows-desktop-test. Produção exige autorização separada. Base anterior recuperável: 0948c596. Backup Neon antes da migração: br-jolly-hill-b4wx7zdm, criado a partir de br-cold-sun-b4vrukpl.

## Ativar identidade e auditoria no teste

1. Confirmar backup e executar 005_identity_audit.sql no banco isolado. Nenhuma tabela de funcionários, FP ou histórico é substituída.
2. Habilitar AUTH_USERS_ENABLED=1 somente no projeto Vercel de teste, preservando DESKTOP_DATABASE_URL, AUTH_SESSION_SECRET e o hash inicial existente. Fazer novo deployment da feature branch.
3. O administrador piloto existente é convertido em conta individual no primeiro acesso válido. O segredo inicial não é definido no código. Após login com senha antiga, o hash é atualizado para scrypt N=131072/r=8/p=1; novas senhas exigem pelo menos 12 caracteres.
4. Em Usuários, cadastrar titulares com perfil apropriado. Mudança de perfil, desativação ou recuperação de senha invalida sessões. A sessão dura no máximo 8h e exige novo login; não há renovação silenciosa.
5. Recuperação: administrador emite código aleatório de uso único com validade de 20 minutos; somente o hash do código fica no banco. Entregar ao titular por meio seguro; o titular usa Redefinir senha. Não existe envio de e-mail configurado.

As APIs conferem sessão e origem. O caminho legado de state.js é bloqueado quando a identidade está habilitada. gestor_push confere perfil e versão do usuário sob bloqueio transacional, protege o histórico aprovado, registra operações e recusas e preserva CAS/idempotência. A lista fixa de três perfis está na função SQL; não há concessões arbitrárias pelo navegador. O banco não é exposto ao navegador; consultas usam credencial do servidor. Não foi ativado RLS em tabelas consumidas apenas pelo backend.

## Aprovação

Salvar uma proposta mantém Rascunho/Incompleta. Solicitar aprovação grava Aguardando aprovação. Administrador ou Líder revisa o histórico e aprova online. O servidor recalcula a distribuição com FP e equipe atuais, confere os intervalos e o responsável e registra approvedBy/approvedAt. Uma alteração posterior no cadastro exige nova proposta. Pronta/Finalizada antigas são preservadas como confirmações legadas, sem inventar aprovador.

A auditoria é paginada em 50 registros no servidor. Administrador consulta tudo; Líder consulta somente módulos de planejamento; Assistente não acessa a API. Exportação CSV e impressão/PDF contêm os registros autorizados carregados, com essa limitação explícita na tela. Metadados de funcionário não incluem nome, matrícula, notas ou motivo de restrição. O campo origem é uma classificação informada pelo cliente (web/windows/assistant), não atestação criptográfica de um dispositivo.

## Windows e dados locais

Electron compartilha interface e motor com o site. SQLite usa transações/outbox e a revisão inteira do espaço de trabalho. Conflitos exigem revisão e arquivam as duas versões. Ainda não há mesclagem automática por registro.

A versão 2.4 protege os valores de metadados, estado, fila e arquivos de recuperação locais usando safeStorage/DPAPI do Windows. Migração local é transacional, faz checkpoint e VACUUM; a versão antiga não deve abrir o banco de formato 2. O banco e seus backups dependem do mesmo perfil Windows para descriptografar. Não copiar um backup protegido para outro computador esperando que funcione. Essa proteção não substitui controle de acesso/BitLocker e não garante apagar cópias externas de versões antigas.

Primeiro acesso exige servidor HTTPS e login online. A autorização local expira com a sessão de 8h. Offline permite ler os dados já sincronizados e criar/editar apenas rascunhos de montagem; não permite alterar cadastros, FPs, agenda ou aprovar. Na reconexão, o servidor revalida sessão, perfil e revisão. Revogação bloqueia a credencial na próxima resposta de autenticação. Recusas de permissão preservam a fila e oferecem revisão com a versão remota.

Chat, usuários, auditoria e Google dependem de conexão. Google ainda exige OAuth próprio. A resposta real do modelo de IA ainda precisa de teste autenticado no ambiente publicado; o guia local nunca equivale a essa validação.

## Instalação e atualização manual

Após validar a prévia web, executar Windows Desktop na feature branch. O artefato inclui o instalador x64 e SHA256SUMS.txt. Conferir o hash com Get-FileHash antes de executar. O instalador não é assinado sem certificado, e avisos do Windows podem aparecer.

Fechar a aplicação após sincronizar; fazer backup protegido; instalar a nova versão no mesmo perfil do Windows. Dados locais não são removidos na desinstalação padrão. Não atualizar durante fila pendente ou conflito. Verificar atualização compara a versão instalada à versão do servidor e abre o workflow oficial do repositório somente quando não há pendências; não baixa nem executa pacotes automaticamente. Um servidor com versão diferente não prova que um instalador dessa versão já foi aprovado.

## Evidências e limitações

Local: 52 testes unitários/integração aprovados; ESLint (regras básicas de correção), TypeScript estrito dos novos módulos de domínio e build aprovados. Existem testes de interface HTTP no Electron/Windows e de aplicação empacotada; seus resultados precisam ser conferidos no run da versão entregue.

TypeScript foi introduzido no modelo do dashboard. A interface DOM e as APIs existentes continuam majoritariamente JavaScript, com validações de execução; não se deve declarar o repositório integralmente convertido nem totalmente tipado. Não foi reescrito como Next.js/React.

Pendente de validação externa: login e ações de cada titular na Vercel/Neon, resposta real da IA, consentimento/publicação Google, instalação/desinstalação/atualização em Windows 10 e 11 reais, recuperação por backup no perfil Windows, e avaliação das regras com os responsáveis pela linha. Não há registro de execução industrial, SLA, aprovação regulatória ou evidência de produção realizada.

O workflow Windows também executa instalação silenciosa, abre a aplicação instalada e executa o desinstalador em uma máquina descartável do GitHub Actions. Isso verifica empacotamento/instalação nesse runner, sem substituir os testes manuais em Windows 10/11. Além do disparo manual, um commit explicitamente marcado [windows-build] na feature branch solicita o build somente após todos os testes web passarem; commits normais não geram instalador.

## Resultado da entrega em 19/10/2026

Código verificado: 6d254c7b15bb11b05aabe59f82e7a52251cbe307, versão 2.4.0. Run: https://github.com/FernandoReys/gestor-de-subconjunto/actions/runs/39253023481.

- 52 testes unitários/integração, lint, tipos e build aprovados no Windows.
- Fluxo web anterior preservado; teste novo percorreu dashboard SQL, submissão de escala, aprovação recalculada no servidor, auditoria e restrições de Assistente; ambos passaram.
- NSIS x64 gerado; Electron isolado/SQLite, aplicativo empacotado, instalação silenciosa, abertura da aplicação instalada e execução do desinstalador passaram no runner Windows.
- Artefato Gestor-Windows-x64-6d254c7b15bb11b05aabe59f82e7a52251cbe307, ID 12186224117: instalador e SHA256SUMS.txt, retido no GitHub até 18/11/2026. Sem assinatura digital configurada.
- Prévia https://project-fj4by.vercel.app respondeu HTTP 200 com WEB 2.4.0 e os módulos novos.
- Migração 005 aplicada somente em windows-desktop-test. Consulta após migração preservou revisão 31, 11 funcionários e 2 FPs. Não foram criadas contas fictícias no banco conectado; dados dos testes ficaram em bancos descartáveis.

**Ativação pendente:** adicionar AUTH_USERS_ENABLED=1 ao ambiente Production do projeto isolado gestor-desktop-test (não aos projetos de produção) e refazer o deployment. O conector Vercel retornou projeto não encontrado; a proteção de credenciais do navegador impediu editar a variável mesmo após recuperação da navegação. Portanto Usuários/Auditoria/aprovações individuais não devem ser anunciados como ativos na prévia até esse ajuste. As telas e regras foram validadas com a configuração habilitada apenas nos testes.

Validações externas ainda pendentes: contas reais na prévia após ativação, IA real, OAuth Google e ciclo offline/instalação/atualização em Windows 10 e 11 dos usuários. O instalador entregue é candidato a piloto, não uma homologação de ambiente industrial.
