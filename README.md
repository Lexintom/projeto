# Carteiras e processamento de apostas

API em NestJS, TypeScript estrito e Bun 1.x. Usa PostgreSQL com MikroORM e SQS no LocalStack. As regras são compartilhadas pela entrada HTTP e pela fila.

O enunciado recebido está em `DESAFIO.md`. As decisões estão em `ARCHITECTURE.md`. A comparação com os requisitos e os resultados desta revisão estão em `REVISAO.md`.

## Rodar localmente

Instale Bun 1.x e Docker com Compose. Abra o terminal na pasta do `package.json`:

```bash
bun install --frozen-lockfile
```

Copie `.env.example` para `.env`. No PowerShell:

```powershell
Copy-Item .env.example .env
docker compose up -d --wait
bun run migration:run
bun run start:dev
```

No Linux/macOS, use `cp .env.example .env` no lugar de `Copy-Item`.

`start:dev` compila com tsc e acompanha mudanças no código e no resultado compilado. Isso preserva os metadados dos decorators usados pelo NestJS. Para execução sem watchers:

```bash
bun run build
bun start
```

A API usa a porta 3000. Os caminhos do desafio funcionam diretamente; os mesmos caminhos com prefixo `/api` também continuam disponíveis. As filas podem ser conferidas com:

```bash
docker compose exec localstack awslocal sqs list-queues
```

Devem existir `wager-transactions.fifo`, `wager-transactions-dlq.fifo` e `wager-events.fifo`. Se não aparecerem, veja `docker compose logs localstack` e confirme se o script `docker/init-sqs.sh` está com final de linha LF.

## Rotas

| Método | Caminho | Uso |
| --- | --- | --- |
| POST | `/wallets` | Criar carteira |
| GET | `/wallets/:walletId` | Consultar saldo |
| GET | `/wallets/:walletId/ledger?limit=50&cursor=...` | Histórico com cursor opaco |
| POST | `/wallets/:walletId/reconciliation` | Comparar saldo com a soma do ledger |
| POST | `/wagering/transactions` | Enviar operação com header Idempotency-Key |
| GET | `/wagering/transactions/:transactionId` | Consultar operação pelo ID interno |
| GET | `/providers/:providerId/wagering/transactions/:externalTransactionId` | Consultar operação pelo ID externo |
| GET | `/health/live` | Verificar se o processo responde |
| GET | `/health/ready` | Verificar acesso ao banco e ao SQS |
| GET | `/metrics` | Métricas Prometheus |

A consulta antiga `/api/wagering/transactions/provider/:providerId/:externalTransactionId` também funciona. O cursor deve ser reutilizado como recebido, sem interpretá-lo.

Crie uma carteira enviando este corpo para `POST /wallets`:

```json
{
  "playerId": "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1",
  "initialBalance": { "amount": "100.00", "currency": "BRL" }
}
```

Depois envie para `POST /wagering/transactions`, com `Content-Type: application/json` e `Idempotency-Key: provider-a:aposta-1`:

```json
{
  "providerId": "provider-a",
  "externalTransactionId": "aposta-1",
  "playerId": "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1",
  "walletId": "SUBSTITUA_PELO_ID_RETORNADO",
  "roundId": "rodada-1",
  "gameId": "jogo-1",
  "kind": "BET",
  "money": { "amount": "25.00", "currency": "BRL" }
}
```

O saldo passa para 75.00. Repetir a chamada devolve a mesma operação e o saldo observado originalmente, com `idempotentReplay: true`. Reutilizar a chave com outro conteúdo gera 409. Uma rejeição financeira gera 422 e traz `failureCode`. Referência ainda ausente gera 202. Erro temporário de infraestrutura gera 503; nesse caso, tente novamente com a mesma chave.

BET debita; WIN credita; LOSS não movimenta o saldo. REFUND e ROLLBACK exigem `referenceExternalTransactionId`. OPENING é interno e não pode ser enviado. Referências pendentes têm backoff persistente e prazo de 24h.

## Mensagem SQS

Use este envelope na fila de comandos. O campo `data` tem os mesmos campos de negócio da API e inclui `idempotencyKey`:

```json
{
  "messageId": "mensagem-aposta-1",
  "type": "WagerTransactionRequested",
  "occurredAt": "2026-11-06T08:00:00.000Z",
  "data": {
    "providerId": "provider-a",
    "externalTransactionId": "aposta-1",
    "idempotencyKey": "provider-a:aposta-1",
    "playerId": "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1",
    "walletId": "SUBSTITUA_PELO_ID_RETORNADO",
    "roundId": "rodada-1",
    "gameId": "jogo-1",
    "kind": "BET",
    "money": { "amount": "25.00", "currency": "BRL" }
  }
}
```

Informe `MessageGroupId` com o ID da carteira e `MessageDeduplicationId` com um identificador estável da operação. A inbox usa o messageId do envelope. A correção financeira não depende da deduplicação FIFO. Os eventos saem em `wager-events.fifo` e carregam eventId para deduplicação pelo destinatário.

O corpo direto antigo também é aceito; nesse formato usa-se o MessageId do broker. Se idempotencyKey não estiver no corpo, o consumidor usa `providerId:externalTransactionId`.

## Testes

Verificações sem banco nem fila:

```bash
bun run typecheck
bun run build
bun run lint
bun run test:unit
```

Para executar tudo em containers reais, sem instalar PostgreSQL ou LocalStack no host:

```bash
bun run test:docker
```

Esse comando usa um banco separado, `jungle_gaming_test`, cria filas temporárias, aplica migrations e roda também os testes com três processos Bun e falhas por SIGKILL. Não execute essas suítes apontando para um banco de trabalho: elas limpam as tabelas do banco de testes. Os processos de teste verificam o sufixo `_test` antes de prosseguir. A API de desenvolvimento pode continuar usando `jungle_gaming`, pois é outro banco.

Para usar Bun no host com os serviços do Compose:

```powershell
docker compose --profile test run --rm test-db
$env:DATABASE_NAME = "jungle_gaming_test"
bun run test:integration
bun run test:concurrency
Remove-Item Env:DATABASE_NAME
```

`bun run test:all` reúne tipagem, build, lint e todas as suítes, e também precisa dos serviços reais e do banco de testes selecionado. Os testes de crash iniciam subprocessos Linux no perfil Docker; esse é o caminho recomendado para executá-los no Windows.

Os resultados comprovados nesta revisão estão em `REVISAO.md`. A suíte completa com LocalStack e múltiplos processos ainda não foi executada neste ambiente.

## Banco e ferramentas opcionais

```bash
bun run migration:run
bun run migration:revert
```

`migration:revert` desfaz a última migration. As migrations ficam em `src/infrastructure/database/migrations` e são registradas explicitamente em `mikro-orm.config.ts`. Leia o SQL antes de desfazer alterações num banco que tenha dados.

O pgAdmin é opcional: `docker compose --profile tools up -d pgadmin`. Acesse `http://localhost:5050`, com as credenciais locais do Compose. O host do banco, visto pelo pgAdmin, é `postgres`.

`docker compose down` preserva volumes. `bun run docker:reset` apaga os dados locais.

`bun run test:load` executa uma carga de BETs sobre uma carteira. USERS, DURATION e BASE_URL podem ser configurados pelo ambiente. A saída JSON informa ambiente, metodologia, throughput, p50/p95/p99, erros, métricas antes/depois e reconciliação. Nenhum resultado de capacidade foi medido nesta entrega.

## Autenticação

A integração com IdP foi adiada conforme a opção permitida pelo desafio. AUTH_ENABLED=false mantém as rotas abertas para desenvolvimento; true recusa chamadas enquanto não houver a integração. O ponto de extensão e o desenho OIDC/Keycloak estão em `ARCHITECTURE.md`. Health permanece aberto.
