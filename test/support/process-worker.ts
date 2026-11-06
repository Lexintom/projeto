import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import { createMikroORM } from "../../src/infrastructure/database/mikro-orm.config";
import { fixture } from "../utils/database-fixture";
import { Money } from "../../src/domain/money/money";
import { SqsClient } from "../../src/infrastructure/messaging/sqs-client";
import { SqsConsumer } from "../../src/infrastructure/messaging/sqs-consumer";
import { OutboxPublisher } from "../../src/infrastructure/messaging/outbox-publisher";
import { AppLogger } from "../../src/infrastructure/observability/logger";
import { MetricsService } from "../../src/infrastructure/observability/metrics";

if (!process.env.DATABASE_NAME?.endsWith("_test"))
  throw new Error("Only a _test database is allowed");
const orm = await createMikroORM();
const f = fixture(orm);
const config = new ConfigService({
  ...process.env,
  SQS_VISIBILITY_TIMEOUT: 2,
  SQS_MAX_RECEIVE_COUNT: 3,
  OUTBOX_POLL_INTERVAL_MS: 20,
  OUTBOX_BATCH_SIZE: 10,
  LOG_LEVEL: "error",
  LOG_PRETTY: false,
  METRICS_ENABLED: false,
});
const sqs = new SqsClient(config);
const mode = process.argv[2];
try {
  if (mode === "apply") {
    const jobs = JSON.parse(process.argv[3]!);
    await Promise.all(
      jobs.map(
        (
          job: Parameters<typeof f.submit.execute>[0] & {
            money: { amount: string; currency: string };
          },
        ) => f.submit.execute({ ...job, money: Money.from(job.money) }),
      ),
    );
  } else if (mode === "consume" || mode === "consume-crash") {
    const logger = new AppLogger(config);
    const metrics = new MetricsService(config, logger);
    if (mode === "consume-crash")
      sqs.deleteMessage = async () => {
        process.kill(process.pid, "SIGKILL");
      };
    const consumer = new SqsConsumer(config, sqs, f.submit, metrics, logger);
    const received = await sqs.receiveMessages(1, 5);
    if (!received.Messages?.length) throw new Error("No message received");
    for (const message of received.Messages) await consumer.process(message);
  } else if (mode === "publish" || mode === "publish-crash") {
    if (mode === "publish-crash") {
      const publish = sqs.publish.bind(sqs);
      sqs.publish = async (event) => {
        await publish(event);
        process.kill(process.pid, "SIGKILL");
      };
    }
    const publisher = new OutboxPublisher(config, f.outbox, sqs, f.unit);
    await publisher.start();
    await Bun.sleep(400);
    await publisher.stop();
  } else throw new Error(`Unknown worker mode: ${mode}`);
} finally {
  await sqs.onApplicationShutdown();
  await orm.close(true);
}
