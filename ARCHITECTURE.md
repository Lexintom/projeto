# Decisões do projeto

## Organização

As regras de dinheiro, carteira, transação e ledger ficam em `src/domain`. Os casos de uso ficam em `src/application`. HTTP, MikroORM, PostgreSQL e SQS ficam em `src/infrastructure`. A API e o consumidor chamam `SubmitWagerTransactionUseCase`; não há dois processamentos financeiros diferentes.

Usei MikroORM porque está entre as opções do desafio e permite compartilhar a transação entre os repositórios. As entidades de persistência ficam separadas das classes do domínio. Cada operação usa um `EntityManager` novo dentro de `transactional()`, sem reaproveitar objetos após rollback.

## Dinheiro

`Money` usa `decimal.js`. A entrada é string decimal sem sinal negativo, notação científica ou mais de duas casas. A saída tem sempre duas casas. A moeda é validada com a lista ISO do runtime. O banco usa `numeric(19,2)`, mapeado como string pelo ORM. Entradas e resultados acima desse limite são recusados.

Soma, subtração e comparação verificam a moeda. Resultados internos podem ser negativos, por exemplo a diferença da reconciliação; contratos de entrada não podem. Arredondamento interno usa half-up. Uma carteira recebe apenas movimentações positivas; LOSS pode informar zero porque não movimenta saldo.

## Concorrência e consistência

A operação financeira começa com `SELECT FOR UPDATE` na carteira. Esse lock pertence ao PostgreSQL, então funciona entre processos e entre instâncias. Carteiras diferentes não compartilham um lock global. Mantive o UPDATE condicionado à versão como verificação adicional. A versão começa em 1 e só aumenta quando o saldo muda.

O lock cobre também LOSS, rejeições e reprocessamento de referências. Isso evita que dois workers tratem o mesmo estado pendente como se ambos fossem a primeira tentativa. Deadlocks, conflitos de unicidade e de versão e timeout de lock têm retry limitado em uma transação nova. O timeout de lock é de cinco segundos.

A mesma transação SQL grava carteira, operação, ledger, inbox e outbox. Uma abertura positiva cria OPENING, CREDIT e eventos; abertura zero não cria movimentação. O ID da carteira também identifica a transação interna de abertura.

Além dos índices únicos, o schema contém checks de saldo, moeda, valores e aritmética; FKs; proteção contra UPDATE/DELETE do ledger; proteção de transações terminais; validação de versão e da sequência de saldos do ledger. Triggers diferidas comparam o saldo materializado com a soma do ledger e exigem o lançamento de cada operação financeira processada no commit. LOSS e operações rejeitadas não podem ter lançamento.

Essa conferência no banco privilegia clareza e segurança, mas soma o histórico da carteira a cada escrita. Carteiras com histórico grande precisam de medição antes de otimizar. Não há promessa de throughput neste projeto.

## Idempotência

A chave do header é obrigatória e fica em uma coluna única. Também há unicidade de `(providerId, externalTransactionId)`. O hash usa SHA-256 sobre JSON com as chaves de objetos ordenadas por código de caractere, recursivamente. Campos undefined são omitidos; a ordem dos arrays é mantida. Entram os campos de negócio, com Money normalizado. Header e metadados de transporte não entram.

Uma repetição com conteúdo diferente retorna conflito. Uma operação terminal tem seu saldo de resposta salvo, inclusive LOSS e rejeições. Por isso um replay não passa a devolver o saldo de uma aposta posterior.

A inbox tem unicidade de `(consumerName, messageId)` e verifica o hash. No envelope SQS usa-se o messageId da aplicação, preservado mesmo se o produtor reenviar a mensagem ao broker. O formato direto antigo continua aceito e usa o MessageId do SQS.

A migration consegue recuperar snapshots de operações antigas com ledger. LOSS e rejeições gravadas pela versão anterior não têm informação suficiente para reconstruir o saldo original; para avaliar esse requisito sem ambiguidade, use um banco de teste novo. Não há expiração automática das chaves de idempotência.

## Operações e referências

BET debita; WIN credita; LOSS só registra. WIN pode indicar uma BET da mesma carteira, jogador, provedor, moeda e rodada, sem exigir prêmio igual à aposta. REFUND só reverte BET; ROLLBACK aceita BET, WIN e REFUND. As reversões precisam do valor integral da referência. A unicidade parcial no banco impede repetir uma reversão do mesmo tipo. REFUND e ROLLBACK sobre a mesma referência são permitidos uma vez cada, como descrito no desafio.

A referência deve estar PROCESSED. Se ainda não chegou ou está pendente, a operação fica PENDING_REFERENCE. Cada espera grava a próxima tentativa no banco: 2s, 4s, 8s, até o teto de cinco minutos. O worker consulta operações vencidas a cada segundo. O limite é o TTL de 24h; depois disso uma referência ainda ausente gera REFERENCE_TIMEOUT e evento de rejeição. O TTL evita manter referências inexistentes indefinidamente, enquanto o teto do backoff limita a demora para aproveitar uma referência que acabou de chegar.

Transições: PENDING pode ir para PENDING_REFERENCE, PROCESSED, REJECTED ou FAILED. PENDING_REFERENCE pode continuar aguardando ou ir para um estado terminal. PROCESSED, REJECTED e FAILED não mudam de estado. Rehydrate apenas reconstrói o estado persistido. OPENING é uma operação interna já aplicada na criação; HTTP e SQS recusam sua submissão.

## HTTP e falhas

| HTTP | Significado |
| --- | --- |
| 200 / 201 | Processamento concluído / carteira criada |
| 202 | Aguardando referência |
| 400 | Contrato inválido, inclusive dinheiro numérico ou referência obrigatória ausente |
| 403 / 404 | Jogador não corresponde à carteira / recurso inexistente |
| 409 | Identidade duplicada ou conflito de idempotência |
| 422 | Rejeição de negócio persistida, com failureCode |
| 503 | Infraestrutura temporariamente indisponível ou disputa de lock esgotada |
| 500 | Erro inesperado que precisa ser investigado |

Os códigos estão em `failure-codes.ts`: INSUFFICIENT_FUNDS, NEGATIVE_BALANCE_AFTER_REVERSAL, REFERENCE_ALREADY_REVERSED, REFERENCE_MISMATCH, INVALID_KIND_FOR_REFERENCE, INVALID_AMOUNT, CURRENCY_MISMATCH e REFERENCE_TIMEOUT distinguem as rejeições. REFERENCE_NOT_FOUND representa uma referência ausente; WALLET_NOT_FOUND, IDEMPOTENCY_CONFLICT e INTERNAL_ERROR também existem para diagnóstico. Não se deve reenviar uma rejeição terminal esperando que ela mude; uma correção usa uma nova identidade de operação.

## SQS e outbox

O ACK ocorre depois que o caso de uso retorna do commit. Rejeições financeiras são confirmadas. Payloads inválidos e conflitos permanentes vão para a DLQ. Falhas transitórias alteram a visibilidade com backoff; a quinta tentativa é o limite padrão. A mensagem original só é removida após confirmação do envio à DLQ. A política de redrive do broker permanece como proteção adicional.

O consumidor renova a visibilidade durante o processamento e, ao encerrar, aguarda o trabalho em andamento. Cliente SQS é fechado depois dos hooks dos workers. Uma morte abrupta libera a mensagem pelo timeout; a inbox e a idempotência tornam a reentrega segura.

A outbox usa `FOR UPDATE SKIP LOCKED`, permite publishers concorrentes e publica numa fila separada dos comandos. O envio fica dentro da transação do publisher, depois do commit financeiro. Se o publisher morrer depois do envio e antes da marcação, outra instância reenviará o mesmo eventId. O consumidor do evento deve ter sua própria inbox; a deduplicação FIFO é apenas uma otimização.

Falhas de publicação continuam agendadas, com backoff limitado a 60s; não se abandona um evento confirmado após dez falhas. OUTBOX_MAX_ATTEMPTS limita a potência do backoff, não remove eventos. O shutdown aguarda a publicação em andamento. A transação aberta durante a chamada SQS ocupa uma conexão; um lease seria uma evolução possível, mas exigiria mais estados e recuperação.

## Autenticação

Optei por adiar a integração com um IdP para priorizar as garantias financeiras. Isso é permitido na seção 2. `AuthGuard` é o ponto de extensão: com AUTH_ENABLED=false, aceita as rotas de desenvolvimento; com true, recusa acesso enquanto não há implementação. Não existe cadastro próprio nem hash de senha.

A integração prevista é OIDC com Keycloak: validar assinatura pelo JWKS, issuer, audience e expiração, e vincular o claim de provedor ao providerId recebido. Health permanece aberto. Mensagens SQS vêm de um canal interno confiável, mas passam pelas validações do domínio. Não se deve habilitar acesso externo como se a autenticação já existisse.

## Observabilidade e limites

Os logs JSON do processamento incluem correlationId, messageId, transactionId, walletId e providerId; mensagens HTTP sem messageId registram null. Não se grava o payload financeiro completo. Debug SQL fica desligado. Há métricas de resultados por status/tipo, duplicatas, conflitos de idempotência, retries, DLQ, locks, tempo de processamento, atraso dos eventos publicados e divergências de reconciliação. Liveness e readiness são separados.

Os testes incluem cenários de três subprocessos Bun, kill após commit e antes do ACK, publishers concorrentes, reinício, inbox, reversões fora de ordem e DLQ. A execução em containers ainda precisa ser comprovada neste pacote: veja `REVISAO.md`. Não foram feitos teste de carga medido, tracing distribuído ou dashboard. Limpeza e retenção do ledger/inbox/outbox também não foram implementadas.
