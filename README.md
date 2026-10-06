# Gestor de Subconjunto — evolução piloto

Planejamento de uma linha de subconjuntos. Esta revisão parte do aplicativo existente e mantém os seis processos 20 BSD, 30 Clampe, 40 Preckoff, 50 Y, 60 Agulha e 70 Contagem. É um projeto independente para avaliação interna; não substitui uma FP aprovada nem sistemas oficiais.

## Estado desta revisão

- Visão Geral mostra data/hora, FP, produto, turno, responsável, disponibilidade e cobertura por posição.
- Funcionários têm matrícula opcional, categoria, setor, presença, habilitações, restrições por posto e observações.
- FPs começam vazias. É possível criar, editar, duplicar, arquivar e excluir uma FP sem histórico; cada FP informa os postos e quantas pessoas são necessárias.
- A montagem seleciona data, turno, FP e assistentes, permite posição inicial e fixação, gera escala com avisos de falta de cobertura e aceita postos adicionais com quantidade e observação.
- Uma escala completa pode ser confirmada e consultada no Histórico. A confirmação aguarda resposta do banco SQL antes de mostrar sucesso.
- Configurações permitem gerenciar setores e turnos, além de limpar dados com confirmação digitada.

**Esta revisão ainda não está apta a um piloto real.** Autenticação individual com perfis e auditoria atribuída a um usuário não estão implementadas. A proteção de implantação da Vercel mantém o ambiente privado, mas não equivale a controle de funções no aplicativo. Não remova essa proteção. A interface continua em JavaScript, e o PDF é gerado pela impressão do navegador. O fluxo integrado em navegador e banco de produção precisa de validação antes de publicação.

## Desenvolvimento local

Node.js 22 ou superior:

```sh
npm ci
npm test
npm run build
npm start
```

Sem `DATABASE_URL`, o aplicativo salva somente um rascunho local. **Não confirme escalas locais como registros oficiais.** Nenhuma pessoa, FP ou escala fictícia é inserida automaticamente.

## Migração SQL, backup e restauração

1. Antes de qualquer alteração no Neon/PostgreSQL, crie um backup consistente ou um branch do banco e registre o horário e a origem. Confira contagens de `employees` e `app_settings`.
2. No banco existente, aplique `db/migrations/001_employee_role.sql` se ainda não foi aplicada; depois execute `db/migrations/002_pilot_foundation.sql` em transação. A segunda migração cria tabelas relacionais e preserva os dados anteriores. Faça uma revisão das FPs legadas com identificadores não UUID antes de habilitar o novo código.
3. Verifique índices e chaves estrangeiras, execute leituras e escrita reversível em um banco de prévia, e só então publique a aplicação.
4. Para restaurar, interrompa gravações, restaure o backup/branch anterior e volte ao deploy compatível com aquele esquema. Não reverta apenas o código enquanto o banco recebe gravações de uma versão nova.
5. Mantenha `DATABASE_URL` apenas no servidor, configurada como segredo da Vercel. Nunca copie a string de conexão para o frontend, logs ou repositório.

`db/schema.sql` descreve a base anterior. `002_pilot_foundation.sql` amplia o esquema com `users`, `sectors`, `employee_skills`, `employee_restrictions`, `fps`, `fp_stations`, `shifts`, `schedules`, `schedule_stations`, `schedule_employees`, `schedule_organizers`, `settings` e `audit_logs`. O endpoint sincroniza os dados centrais com tabelas normalizadas, mantendo `app_settings` para compatibilidade. A estrutura de usuários e auditoria está preparada, mas ainda carece de provedor de identidade e aplicação de permissões no servidor.

## Regras e limites

O gerador considera apenas operadores ativos e habilitados; ausentes e assistentes ficam fora dos postos. Fixações incompatíveis e seleções iniciais duplicadas geram erro. A mesma pessoa não ocupa duas posições no mesmo período. Os limites de permanência e pausas continuam presentes, e falta de equipe gera pendências em vez de uma escala inventada. Postos adicionais são atribuições manuais durante o turno. Para FP com mais de uma posição em Preckoff, a lista horária separada é ocultada; use a escala principal.

Ações de limpeza são irreversíveis no aplicativo e exigem digitação explícita. O histórico preserva nomes e posições em um snapshot, inclusive quando o cadastro de um funcionário for removido. A auditoria com identificação do autor e os papéis Administrador, Assistente e Visualização devem ser concluídos antes de uso com dados reais.
