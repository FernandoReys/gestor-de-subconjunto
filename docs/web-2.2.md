# Validação web 2.2.0

Esta etapa volta à versão site, somente na branch `feature/windows-desktop-offline` e no projeto Vercel `gestor-desktop-test`. Main e o banco de produção não são alterados. O workflow Windows passa a ser exclusivamente manual; nenhum instalador é gerado nesta etapa.

## Interface

- Menu lateral expandido ou recolhido com seta no topo; preferência gravada por navegador. Os ícones mantêm nome acessível e dica de navegação.
- Tema claro azul/branco e escuro azul/preto. Tabelas e agenda se adaptam à largura; em telas pequenas a escala vira blocos por horário. O menu mobile usa sobreposição com botão de abertura.
- Assistente do Gestor com chat, guia de uso, mensagens em texto seguro e limpeza da conversa. A conversa fica apenas em memória da aba.

## Rodízio

Cada permanência tem 120 minutos efetivos; Preckoff tem 60. Café e almoço suspendem a contagem, sem zerá-la. A troca do Preckoff não retira outros operadores antes do prazo. O fim do turno pode encurtar o último período. A proibição de retorno é por processo, incluindo múltiplas posições de Preckoff.

Postos adicionais agora participam do mesmo rodízio, com sua seleção manual valendo para o início. Assistentes ficam fora da linha. A linha aceita até 10 posições no total. Fixações não permitem ultrapassar o limite: se impedirem uma troca válida, a posição fica pendente. Históricos antigos são preservados como snapshots; novas gerações usam a regra atual.

## Dados web e Google

Quando `DESKTOP_SYNC_ENABLED=1` e `DESKTOP_DATABASE_URL` existem, o site de teste usa o espaço isolado já criado para o piloto. Não copia ou apaga dados de produção. Cada salvamento usa revisão e operação idempotente de `/api/desktop-sync.js`. Duas abas concorrentes causam conflito explícito; versões podem ser baixadas antes de carregar o servidor. Um envio sem confirmação fica na sessionStorage desta aba, inclusive a versão editada após uma falha. Não é uma promessa de funcionamento web offline completo.

A agenda usa esse mesmo espaço confirmado antes de publicar eventos. Consentimento por item, ID determinístico, ETag, leases e revisão continuam ativos. Alterações/cancelamentos autorizados são reenviados enquanto o site estiver aberto. O envio é Gestor → Google; não há importação de alterações feitas no Google.

Ativação Google ainda exige um conector OAuth próprio: Client ID, Client Secret, Calendar API, tela de consentimento, testadores quando aplicável, redirect `https://connect.vercel.com/callback`; `GOOGLE_CALENDAR_CONNECTOR`, `GOOGLE_CALENDAR_ID` e `APP_ORIGIN` somente no servidor de teste. Tokens nunca vão para o navegador. Sem essa configuração o site informa a pendência, sem afirmar envio bem-sucedido. Não foram aceitos termos ou criadas permissões Google automaticamente.

## Chat de suporte

API autenticada e protegida por origem, limitada a 12 mensagens/14.000 caracteres e 10 requisições por minuto por instância. `ai@7.0.143`, modelo `openai/gpt-6-luna` confirmado no catálogo em 18/10/2026; pode ser substituído por `AI_GATEWAY_MODEL`. Autenticação OIDC na Vercel, ou `AI_GATEWAY_API_KEY` no servidor fora dela. Limite de saída 1.000 tokens e timeout 20 s. Não inclui ferramentas nem acessa cadastros, nomes ou restrições de funcionários. Somente as mensagens digitadas são enviadas à IA, com aviso no formulário.

O manual versionado orienta o modelo sobre recursos reais. Se não houver credenciais/créditos ou a IA falhar, o retorno é identificado como **Guia local**, com artigos relevantes. Isso não é uma resposta gerada por IA. O usuário não deve informar senhas ou informações internas no chat. Ativação comercial ou cadastro de pagamento não são feitos automaticamente.

## Verificação

41 testes locais aprovados: datas, agenda, persistência, CAS, idempotência, conflitos, rodízio, restrições, limite de linha, chat e autenticação. Build e checagens de sintaxe aprovados. O workflow Web validation verifica interface web em navegador Electron, com servidor HTTP local e sessão descartável de teste, e publica capturas dos temas/menu sem gerar instalador.

Ainda exige validação no ambiente publicado: login/salvamento real, acesso AI Gateway e suas condições de conta, consentimento Google e criação/edição/cancelamento de evento no calendário escolhido. Somente após validar o site será preparada outra versão instalável.

### Resultado da publicação em 18/10/2026

- Código: `7f6fa6397e8b137495b4affdbcacf81922978465` na feature branch.
- Site de teste: https://project-fj4by.vercel.app/ respondeu HTTP 200 com `WEB 2.2.0` e arquivos versionados `?v=2.2.0`.
- Vercel criou o deploy `AjXGXJQ1iWtbi3mqkFTgik5aTnBX` para esse commit no projeto de teste. A conexão continua apontando para o banco isolado já configurado.
- [Web validation](https://github.com/FernandoReys/gestor-de-subconjunto/actions/runs/39168742648) passou: 41 testes, build e testes visuais de agenda, temas, menu desktop/mobile e guia de suporte. Capturas no artefato `Web-visual-checks-7f6fa6397e8b137495b4affdbcacf81922978465`.
- O painel Connect da Vercel informa que não há conector vinculado. Google OAuth não foi ativado.
- A tentativa de autenticação pelo formulário seguro do site retornou “Usuário ou senha inválidos”. Não houve redefinição de senha. O teste autenticado do banco publicado e da IA real continua pendente; não confundir o guia local aprovado em CI com uma resposta real do modelo.
- Nenhum instalador novo foi gerado nesta etapa.
