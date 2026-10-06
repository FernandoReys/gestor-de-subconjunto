# Gestor de Subconjunto

Protótipo privado para planejar uma linha com seis postos: 20 BSD, 30 Clampe, 40 Preckoff, 50 Y, 60 Agulha e 70 Contagem. A abertura usa vídeo ilustrativo. As placas no vídeo e os tipos provisórios não substituem uma FP aprovada.

## Executar

Node.js 22 ou superior:

```sh
npm ci
npm run build
npm start
npm test
```

O servidor local serve `dist/`. Sem banco configurado, a interface inicia vazia e guarda um rascunho no navegador. Cadastros antigos da demonstração não são importados. Limpar os dados do site remove o rascunho local.

## Banco PostgreSQL

1. Crie um **banco novo e vazio** em PostgreSQL ou Neon. Não execute a migração sobre um banco operacional existente sem revisão.
2. Execute [`db/schema.sql`](db/schema.sql) nesse banco. O esquema cria `employees` e `app_settings` sem inserir pessoas, escalas ou dados fictícios. Em um banco criado pela versão anterior, execute uma vez [`db/migrations/001_employee_role.sql`](db/migrations/001_employee_role.sql) antes de publicar o código novo; a migração preserva os cadastros existentes e classifica os anteriores como Operador.
3. Configure `DATABASE_URL` como variável de ambiente **somente no servidor** no projeto Vercel. Jamais coloque a URL no repositório ou no JavaScript servido ao navegador.
4. Implante novamente. `/api/state.js` passa a ler e salvar funcionários, setor, presença, restrições e configuração do turno em transação. O rodízio é calculado no navegador a partir desses dados; o estado de geração é persistido para recalcular ao reabrir.

Os setores aceitos são Sala de máquinas, Linha de bolsa, Subconjunto e Embalagem final. A categoria é **Operador** ou **Assistente**. Só operadores marcados **Ativo na linha** entram nos postos; assistentes ativos podem organizar o turno. Postos adicionais são atribuídos manualmente a um operador, que sai do rodízio principal. O catálogo de FPs e essas escolhas ficam em `app_settings.config` (JSONB). O cadastro inicial de pessoas fica vazio. O banco é a origem dos dados quando configurado; rascunhos locais anteriores não são enviados automaticamente.

Em Configurações, **Limpar escalas** zera a distribuição e as escolhas do turno, mantendo pessoas e FPs; **Limpar funcionários** apaga os cadastros e a escala, mantendo FPs. Ambas as ações exigem digitar a palavra de confirmação. Abrir a página não altera dados.

O projeto Vercel deve manter **Vercel Authentication** ativo em produção e prévias. O domínio padrão já é protegido; não acrescente domínio personalizado sem rever a proteção. A entrada visual da abertura não autentica ninguém. A API usa essa proteção de implantação, então não exponha suas rotas em outro host sem autenticação equivalente.

## Limites

O gerador respeita postos permitidos, fixos, pausas, limite de 60 minutos efetivos em Preckoff, 120 em Contagem e proibição de retorno ao posto após saída no turno. Pode deixar lacunas quando a equipe é insuficiente. As opções de tipo de subconjunto são provisórias, sem FP técnica cadastrada. CSV e impressão mostram uma simulação para revisão, sem liberar produção.

`npm test` cobre o algoritmo de escala. O banco exige provisionamento e a variável `DATABASE_URL` para teste integrado e sincronização entre aparelhos.
