import { it, expect, beforeEach, afterEach } from "bun:test";
import { ConfigService } from "@nestjs/config";
import {
  CreateQueueCommand,
  DeleteQueueCommand,
  SendMessageCommand,
  ReceiveMessageCommand,
} from "@aws-sdk/client-sqs";
import { getTestOrm, clearDatabase } from "../utils/test-container";
import { fixture, command } from "../utils/database-fixture";
import { Money } from "../../src/domain/money/money";
import { ReconcileWalletUseCase } from "../../src/application/use-cases/reconcile-wallet.use-case";
import { SqsClient } from "../../src/infrastructure/messaging/sqs-client";
import { SqsConsumer } from "../../src/infrastructure/messaging/sqs-consumer";
import { MetricsService } from "../../src/infrastructure/observability/metrics";
import { AppLogger } from "../../src/infrastructure/observability/logger";
import {
  WagerTransactionStatus as Status,
  WagerTransactionKind as Kind,
} from "../../src/domain/transaction/wager-transaction.enums";

let f: ReturnType<typeof fixture>;
let sqs: SqsClient;
let config: ConfigService;
let urls: string[];
let names: Record<string, string>;
let consumer: SqsConsumer;
beforeEach(async () => {
  const orm = await getTestOrm();
  await clearDatabase(orm);
  f = fixture(orm);
  const suffix = crypto.randomUUID();
  names = {
    SQS_QUEUE_NAME: `test-${suffix}.fifo`,
    SQS_EVENTS_QUEUE_NAME: `events-${suffix}.fifo`,
    SQS_DLQ_NAME: `dlq-${suffix}.fifo`,
  };
  config = new ConfigService({
    ...process.env,
    ...names,
    SQS_VISIBILITY_TIMEOUT: 2,
    SQS_MAX_RECEIVE_COUNT: 3,
    LOG_PRETTY: false,
    LOG_LEVEL: "error",
    METRICS_ENABLED: false,
  });
  sqs = new SqsClient(config);
  urls = [];
  for (const name of Object.values(names)) {
    const created = await sqs
      .getClient()
      .send(
        new CreateQueueCommand({
          QueueName: name,
          Attributes: {
            FifoQueue: "true",
            ContentBasedDeduplication: "false",
            VisibilityTimeout: "2",
          },
        }),
      );
    urls.push(created.QueueUrl!);
  }
  const logger = new AppLogger(config);
  consumer = new SqsConsumer(
    config,
    sqs,
    f.submit,
    new MetricsService(config, logger),
    logger,
  );
});
afterEach(async () => {
  for (const url of urls ?? [])
    await sqs.getClient().send(new DeleteQueueCommand({ QueueUrl: url }));
  await sqs?.onApplicationShutdown();
});
async function open() {
  return (
    await f.create.execute({
      playerId: crypto.randomUUID(),
      initialBalance: Money.from({ amount: "100.00", currency: "BRL" }),
    })
  ).wallet;
}
async function invariant(id: string) {
  expect(
    (
      await new ReconcileWalletUseCase(f.wallets, f.ledger, f.unit).execute({
        walletId: id,
      })
    ).consistent,
  ).toBe(true);
}
// Send only business data; transport fields must not leak into the hash.
function wire(cmd: ReturnType<typeof command>) {
  const { payloadHash, ...data } = cmd;
  void payloadHash;
  return data;
}
async function enqueue(
  cmd: ReturnType<typeof command>,
  id = crypto.randomUUID(),
) {
  await sqs
    .getClient()
    .send(
      new SendMessageCommand({
        QueueUrl: await sqs.getQueueUrl(),
        MessageGroupId: cmd.walletId,
        MessageDeduplicationId: crypto.randomUUID(),
        MessageBody: JSON.stringify({
          messageId: id,
          type: "WagerTransactionRequested",
          occurredAt: new Date().toISOString(),
          data: wire(cmd),
        }),
      }),
    );
}
async function processOne() {
  const response = await sqs.receiveMessages(1, 2);
  expect(response.Messages?.length).toBe(1);
  await consumer.process(response.Messages![0]!);
}
function worker(mode: string) {
  return Bun.spawn([process.execPath, "test/support/process-worker.ts", mode], {
    env: { ...process.env, ...names, NODE_ENV: "test" },
    stdout: "pipe",
    stderr: "pipe",
  });
}
async function finish(proc: ReturnType<typeof worker>, crash = false) {
  const [code, errors] = await Promise.all([
    proc.exited,
    new Response(proc.stderr).text(),
    new Response(proc.stdout).text(),
  ]);
  if (crash) expect(code).not.toBe(0);
  else if (code !== 0) throw new Error(errors);
}
it("persistent inbox deduplicates two broker messages with the same envelope identity", async () => {
  const w = await open(),
    cmd = command(w.id, w.playerId),
    id = crypto.randomUUID();
  await enqueue(cmd, id);
  await processOne();
  await enqueue(cmd, id);
  await processOne();
  expect(
    (await f.unit.run(() => f.wallets.findById(w.id)))?.balance.amount,
  ).toBe("90.00");
  const rows = await (
    await getTestOrm()
  ).em.execute(
    "select count(*)::int as n from jungle.inbox_messages where message_id=?",
    [id],
  );
  expect(rows[0]?.n).toBe(1);
  await invariant(w.id);
}, 15000);
it("crash after commit and before ACK recovers on a new process without another debit", async () => {
  const w = await open();
  await enqueue(command(w.id, w.playerId));
  await finish(worker("consume-crash"), true);
  await Bun.sleep(2200);
  await finish(worker("consume"));
  expect(
    (await f.unit.run(() => f.wallets.findById(w.id)))?.balance.amount,
  ).toBe("90.00");
  await invariant(w.id);
}, 20000);
it("two publishers recover an event sent before its publisher died", async () => {
  const w = await open();
  await f.submit.execute(command(w.id, w.playerId));
  await finish(worker("publish-crash"), true);
  await Promise.all([finish(worker("publish")), finish(worker("publish"))]);
  const rows = await (
    await getTestOrm()
  ).em.execute(
    "select count(*)::int as n from jungle.outbox_messages where published_at is null",
  );
  expect(rows[0]?.n).toBe(0);
  const received = await sqs
    .getClient()
    .send(
      new ReceiveMessageCommand({
        QueueUrl: await sqs.getQueueUrl(names.SQS_EVENTS_QUEUE_NAME),
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 2,
      }),
    );
  const ids = received.Messages?.map((m) => JSON.parse(m.Body!).eventId) ?? [];
  expect(ids.length).toBe(4);
  expect(new Set(ids).size).toBe(4);
  await invariant(w.id);
}, 20000);
it("permanent malformed messages reach a real DLQ", async () => {
  const w = await open();
  await sqs
    .getClient()
    .send(
      new SendMessageCommand({
        QueueUrl: await sqs.getQueueUrl(),
        MessageGroupId: w.id,
        MessageDeduplicationId: crypto.randomUUID(),
        MessageBody: "invalid-json",
      }),
    );
  await processOne();
  const dlq = await sqs
    .getClient()
    .send(
      new ReceiveMessageCommand({
        QueueUrl: await sqs.getQueueUrl(names.SQS_DLQ_NAME),
        WaitTimeSeconds: 2,
      }),
    );
  expect(dlq.Messages?.length).toBe(1);
  await invariant(w.id);
}, 15000);
it("transient failures retry with backoff, then reach DLQ after the configured limit", async () => {
  const w = await open();
  await enqueue(command(w.id, w.playerId));
  const original = f.submit.execute.bind(f.submit);
  f.submit.execute = async () => {
    throw Object.assign(new Error("temporary"), { code: "ECONNREFUSED" });
  };
  try {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const response = await sqs.receiveMessages(1, 2);
      const message = response.Messages?.[0];
      expect(message).toBeDefined();
      expect(Number(message!.Attributes?.ApproximateReceiveCount)).toBe(
        attempt,
      );
      await consumer.process(message!);
      if (attempt < 3) {
        const hidden = await sqs.receiveMessages(1, 0);
        expect(hidden.Messages?.length ?? 0).toBe(0);
        await Bun.sleep(2 ** attempt * 1000 + 200);
      }
    }
  } finally {
    f.submit.execute = original;
  }
  const dlq = await sqs
    .getClient()
    .send(
      new ReceiveMessageCommand({
        QueueUrl: await sqs.getQueueUrl(names.SQS_DLQ_NAME),
        WaitTimeSeconds: 2,
      }),
    );
  expect(dlq.Messages?.length).toBe(1);
  await invariant(w.id);
}, 25000);
it("a refund delivered before its bet is applied after a service restart", async () => {
  const w = await open(),
    bet = command(w.id, w.playerId);
  const refund = {
    ...command(w.id, w.playerId),
    kind: Kind.Refund,
    referenceExternalTransactionId: bet.externalTransactionId,
  };
  await enqueue(refund);
  await processOne();
  await enqueue(bet);
  await processOne();
  const pending = await f.unit.run(() =>
    f.transactions.findByProviderAndExternalId(
      refund.providerId,
      refund.externalTransactionId,
    ),
  );
  expect(pending?.status).toBe(Status.PendingReference);
  // A new process uses the persisted pending transaction, just as the scheduled worker does.
  const job = {
    ...refund,
    money: refund.money.toJSON(),
    payloadHash: pending!.payloadHash,
  };
  const proc = Bun.spawn(
    [
      process.execPath,
      "test/support/process-worker.ts",
      "apply",
      JSON.stringify([job]),
    ],
    {
      env: { ...process.env, ...names, NODE_ENV: "test" },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  await finish(proc);
  expect(
    (await f.unit.run(() => f.wallets.findById(w.id)))?.balance.amount,
  ).toBe("100.00");
  await invariant(w.id);
}, 20000);
