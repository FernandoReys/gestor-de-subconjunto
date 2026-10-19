# Evolução industrial — diagnóstico de 19/10/2026

Base: commit 0948c596, branch feature/windows-desktop-offline. Main e banco de produção fora do escopo autorizado. O prompt recebido cita Next.js/React, mas o projeto desta branch tem interface DOM em JavaScript, servidor HTTP Node para desenvolvimento, APIs CommonJS na Vercel e Electron. Não há migração implícita para outro framework.

## Estado comprovado

- Interface compartilhada web/desktop com menu recolhível, temas e adaptação móvel.
- Motor único de rodízio com 120 minutos por posto, 60 no Preckoff, pausas e até 10 posições.
- PostgreSQL/Neon: site de teste usa desktop_workspace e desktop_changes; banco legado com tabelas relacionais é outro caminho de persistência. Nenhum desses caminhos deve servir como desvio de autorização.
- Login piloto compartilhado: hash scrypt no ambiente, sessão HMAC HttpOnly/SameSite Strict por 8h, limite de tentativas em memória. Não há contas individuais, revogação de sessão no banco ou recuperação de senha.
- Histórico Pronta/Finalizada/Rascunho/Incompleta/Cancelada. Pronta significa confirmação antiga; não comprova aprovação de um líder identificado.
- Versões completas e autoria em desktop_changes são evidência de revisão, mas não auditoria por entidade/ação.
- SQLite guarda o estado e outbox em transações, arquiva conflitos; a credencial usa Electron safeStorage. O arquivo SQLite não possui criptografia de conteúdo.
- Não há assinatura de instalador ou atualização automática. Workflow Windows manual; web primeiro.
- Google tem implementação de exportação com revisão, mas falta OAuth no projeto. IA tem tool calling e revisão; resposta do modelo no ambiente publicado ainda não validada após recusa do login.
- 45 testes e fluxo web no Windows aprovados na base.

## Dados e recuperação

Consulta somente de contagens no banco isolado, 19/10: revisão 31, 11 funcionários, 2 FPs, 0 escalas, 0 programações. Não foram usados nomes nem informações pessoais no diagnóstico.

Antes de qualquer nova migração, foi criada a branch de recuperação Neon backup-test-before-industrial-20261019 (br-jolly-hill-b4wx7zdm), filha exclusiva de windows-desktop-test. Código recuperável no commit acima e bundle local de verificação. O backup não é uma autorização para modificar produção. Migrações futuras devem ser testadas em PGlite e numa branch isolada antes da ativação.

## Plano de implementação

1. Dashboard em TypeScript estrito com modelo puro dos dados já carregados do SQL, datas em São Paulo, filtros, gráficos acessíveis e alertas verificáveis. Não indicar realização sem registros de execução.
2. Contas individuais e sessões revogáveis, perfis Administrador/Líder/Assistente, autorização no backend e transacional no caminho de sincronização. Rejeitar alterações de campos não autorizados em payloads de estado completo.
3. Auditoria por entidade sem senhas, tokens, motivos de restrição ou cópias indiscriminadas de dados pessoais; consultas paginadas e exportações autorizadas. Aprovação online identificada, preservando legados.
4. Desktop: revalidar permissões na reconexão, limitar escrita offline a rascunhos, proteger conteúdo local e manter migração recuperável de SQLite. Chat e auditoria dependem de rede.
5. Testar todos os papéis por acesso direto, migrações e rollback, isolamento, interface e ciclo offline. Publicar prévia e somente depois validar novo instalador; produção exige confirmação.

## Limitações que impedem declarar conclusão

TypeScript será introduzido por módulos compartilhados; a interface legada não é automaticamente convertida nem verificada integralmente. Validar instalador em CI não substitui teste de instalação em Windows 10 e 11 reais. Integrações externas exigem credenciais e consentimento próprios. Produção não será migrada ou publicada nesta etapa.
