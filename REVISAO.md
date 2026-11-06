# Revisão frente ao desafio

## O projeto recebido

Não atendia a todos os requisitos. A documentação já reconhecia algumas lacunas, mas havia problemas que exigiam alterações no código: replay retornava o saldo atual; OPENING não era persistido como transação; ledger podia ser alterado pelo banco; reversão sem saldo usava o mesmo código de falha de BET; referências tinham polling fixo; métricas não estavam ligadas ao processamento; faltavam os testes distribuídos e a distinção entre erros da fila.

Não é possível descobrir a autoria de um código pelo estilo. A divisão em camadas e as classes também são exigidas pelo enunciado. Nesta revisão retirei o plano de implementação desatualizado, reduzi comentários que repetiam o código e reescrevi as explicações com decisões concretas. Não foram adicionados erros artificiais nem alegações de experiência pessoal.

## Comparação com o README recebido

“Implementado” indica que o comportamento foi incluído e revisado. Não significa que todos os cenários já tenham sido executados em containers reais.

| Seção / requisito | Situação após as mudanças | Onde conferir |
| --- | --- | --- |
| 2. Autenticação opcional | Adiada conforme permitido; guard e desenho de IdP documentados | AuthGuard; ARCHITECTURE.md |
| 4. Bun 1.x, TypeScript estrito, NestJS, PostgreSQL, SQS, Compose, MikroORM | Mantidos; perfil de testes e metadados do NestJS corrigidos | package.json; tsconfig; Dockerfile.test; Compose |
| 4. Migrations versionadas e reversíveis | Duas migrations; aplicação e reversão conferidas em PGlite | migrations |
| 5. Dinheiro exato, idempotência persistente, ledger e commit atômico | Implementados; SQL e cenários financeiros conferidos em PGlite | domínio; UnitOfWork; migration |
| 6. Factories, encapsulamento e rehydrate sem transições | Corrigida a criação de referências e a reidratação do ledger | classes de domínio |
| 6. Money imutável, entradas válidas e conflito de moeda | Implementado e testado em unidade | money.ts; testes |
| 6. Wallet única, sem saldo negativo e versão ligada a mudanças de saldo | Aplicação e schema protegem as regras | wallet; migration |
| 6. Ledger imutável e coerente com saldo/transação | Triggers, checks, FKs e unicidade; conferidos com SQL | migration; requirements.test.ts |
| 7. BET, WIN, LOSS, REFUND e ROLLBACK | Regras e validações implementadas; exemplos financeiros passaram | caso de uso; domínio; testes |
| 7. Replay com resultado original | Snapshot persistido para novos registros, inclusive LOSS e rejeições | resultBalance; testes |
| 7.1. Referências fora de ordem | Agenda persistida com backoff e TTL de 24h; teste de expiração passou | PendingReferenceWorker |
| 7.2. Códigos de falha | Reversão sem saldo tem código próprio; rejeições retornam failureCode | failure-codes; controller |
| 8. Lock por wallet e múltiplas instâncias | Implementado via PostgreSQL; validação real distribuída ainda pendente | wallet.repository; tests/concurrency |
| 8. Duas BETs de 80 disputando saldo 100 | Teste incluído com processos independentes; ainda não executado em containers | processes.test.ts |
| 9. Rotas HTTP, header e JSON canônico | Rotas do enunciado e aliases disponíveis; hash revisado | main; controllers; payload-hash |
| 9. Cursor estável e opaco | Ordem por data/ID, cursor codificado e validado | get-ledger; ledger.repository |
| 9. Reconciliação e health | Reconciliação consistente sob lock, contagem paginada, métrica e log de divergência; liveness conferida | casos de uso; controllers |
| 9. Status HTTP distintos | 400, 409, 422, 202 e 503 têm funções diferentes | filtro; caso de uso; ARCHITECTURE.md |
| 10. Inbox, ACK após commit, retry, DLQ e shutdown | Implementados; testes com SQS real incluídos, execução pendente | SqsConsumer; sqs.test.ts |
| 11. Outbox atômica e publishers concorrentes | SKIP LOCKED, reenvio do eventId e retry sem abandono; teste de kill incluído | OutboxPublisher; sqs.test.ts |
| 11. Eventos mínimos e envelope com classes | Quatro eventos, inclusive LOSS e abertura; valores serializados como MoneyProps | domain/outbox |
| 12. Logs, métricas e checks | Instrumentação ligada aos fluxos; sem debug SQL nem payload financeiro completo nos logs | observability; workers |
| 13. Unidade | 93 testes aprovados | test/unit |
| 13. PostgreSQL + LocalStack em containers | Suítes e comando Docker incluídos; execução ainda não comprovada | test:docker |
| 13. 50 repetições, três processos, kill, publishers, fora de ordem e reinício | Cenários incluídos; ainda não executados no ambiente exigido | processes.test.ts; sqs.test.ts |
| 14. Documentação | Setup, comandos, decisões, custos e limites atualizados | README.md; ARCHITECTURE.md |
| Diferenciais opcionais | Script de carga disponível; sem medição, tracing ou dashboard | scripts/load-test.ts |

## Verificações desta revisão

Ambiente: Linux, Bun 1.3.1, TypeScript das dependências do projeto.

| Verificação | Resultado |
| --- | --- |
| Instalação limpa com bun install --frozen-lockfile | Aprovada |
| Typecheck de aplicação, scripts e testes | Aprovado |
| Build TypeScript | Aprovado |
| ESLint | Aprovado |
| Testes unitários | 93 aprovados, nenhuma falha |
| HTTP da aplicação compilada, com workers desligados e sem conexão inicial ao banco | Liveness 200; valor monetário numérico recusado com 400 |
| SQL das duas migrations em PGlite | Aplicação e reversão aprovadas |
| Suítes database.test.ts e requirements.test.ts contra PGlite via protocolo PostgreSQL | 12 testes aprovados, nenhuma falha |
| PostgreSQL e LocalStack em containers | Não executado: Docker indisponível |
| Concorrência distribuída, SIGKILL, publishers e DLQ real | Testes incluídos; não executados nesta revisão |

PGlite usa o motor PostgreSQL em WebAssembly e permitiu conferir o SQL, o ORM e cenários financeiros sequenciais. Sua conexão multiplexada não reproduz a concorrência de um servidor PostgreSQL com múltiplas sessões. Os 12 testes aprovados nesse ambiente não substituem a suíte exigida em containers.

## Conclusão

As lacunas encontradas receberam implementação e testes, mas ainda não é correto certificar 100% dos requisitos: falta executar `bun run test:docker` e confirmar os cenários distribuídos com PostgreSQL e LocalStack reais. Também não é correto apresentar este pacote como resultado de um teste de carga ou como código cuja autoria foi comprovada por estilo.
