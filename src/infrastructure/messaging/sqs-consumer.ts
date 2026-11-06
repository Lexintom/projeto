import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  HttpException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { plainToInstance } from "class-transformer";
import { validateOrReject } from "class-validator";
import type { Message } from "@aws-sdk/client-sqs";
import { SubmitTransactionDto } from "../http/dtos";
import { Money } from "../../domain/money/money";
import { computePayloadHash } from "../../application/payload-hash";
import { SubmitWagerTransactionUseCase } from "../../application/use-cases/submit-wager-transaction.use-case";
import { MetricsService } from "../observability/metrics";
import { AppLogger } from "../observability/logger";
import { SqsClient } from "./sqs-client";

@Injectable()
export class SqsConsumer implements OnModuleInit, OnModuleDestroy {
  private running = false;
  private loop?: Promise<void>;

  constructor(
    private readonly config: ConfigService,
    private readonly sqs: SqsClient,
    private readonly submit: SubmitWagerTransactionUseCase,
    private readonly metrics: MetricsService,
    private readonly logger: AppLogger,
  ) {}

  onModuleInit(): void {
    this.running = true;
    this.loop = this.poll();
  }
  async onModuleDestroy(): Promise<void> {
    this.running = false;
    await this.loop;
  }

  private async poll(): Promise<void> {
    while (this.running) {
      try {
        const response = await this.sqs.receiveMessages(1, 5);
        for (const message of response.Messages ?? [])
          await this.process(message);
      } catch {
        this.logger.warn("SQS poll failed; retrying");
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  async process(message: Message): Promise<void> {
    if (!message.ReceiptHandle) return;
    const receipt = message.ReceiptHandle;
    let messageId = message.MessageId;
    const attempt = Number(message.Attributes?.ApproximateReceiveCount ?? "1");
    const timeout = this.config.get<number>("SQS_VISIBILITY_TIMEOUT") ?? 60;
    const heartbeat = setInterval(
      () => {
        void this.sqs
          .changeVisibility(receipt, timeout)
          .catch(() => this.logger.warn("Visibility renewal failed"));
      },
      Math.max(1000, (timeout * 1000) / 3),
    );

    try {
      const parsed = JSON.parse(message.Body ?? "");
      if (!parsed || typeof parsed !== "object") throw new InvalidMessage();
      const envelope = "data" in parsed;
      if (
        envelope &&
        (parsed.type !== "WagerTransactionRequested" ||
          typeof parsed.messageId !== "string" ||
          !parsed.messageId.trim() ||
          parsed.messageId.length > 200 ||
          typeof parsed.occurredAt !== "string" ||
          !Number.isFinite(Date.parse(parsed.occurredAt)))
      )
        throw new InvalidMessage();
      messageId = envelope ? parsed.messageId : message.MessageId;
      if (!messageId) throw new InvalidMessage();
      const data = envelope ? parsed.data : parsed;
      if (!data || typeof data !== "object" || Array.isArray(data))
        throw new InvalidMessage();
      const { idempotencyKey, ...payload } = data;
      const dto = plainToInstance(SubmitTransactionDto, payload);
      await validateOrReject(dto, {
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      const key =
        idempotencyKey ?? `${dto.providerId}:${dto.externalTransactionId}`;
      if (typeof key !== "string" || !key.trim() || key.length > 300)
        throw new InvalidMessage();
      const money = Money.from(dto.money);
      await this.submit.execute({
        ...dto,
        money,
        idempotencyKey: key,
        payloadHash: computePayloadHash({ ...payload, money: money.toJSON() }),
        inboxMessageId: messageId,
        consumerName: this.config.get("SQS_CONSUMER_NAME") ?? "wager-processor",
      });
      await this.sqs.deleteMessage(receipt);
    } catch (error) {
      const code = (error as { code?: string })?.code;
      const permanent =
        error instanceof InvalidMessage ||
        error instanceof SyntaxError ||
        Array.isArray(error) ||
        (error instanceof HttpException && error.getStatus() < 500) ||
        [
          "IDEMPOTENCY_CONFLICT",
          "INVALID_AMOUNT_FORMAT",
          "AMOUNT_REQUIRED",
          "CURRENCY_REQUIRED",
          "INVALID_CURRENCY",
          "INVALID_AMOUNT_BUSINESS",
        ].includes(code ?? "");
      const limit = this.config.get<number>("SQS_MAX_RECEIVE_COUNT") ?? 5;
      if (permanent || attempt >= limit) {
        // Only remove the original after the DLQ confirms receipt. A crash here may redeliver safely.
        await this.sqs.sendToDlq(
          {
            originalBody: message.Body ?? "",
            messageId,
            reason: permanent ? "INVALID_MESSAGE" : "RETRY_EXHAUSTED",
          },
          receipt,
        );
        await this.sqs.deleteMessage(receipt);
        this.metrics.dlqMessagesTotal.inc({
          reason: permanent ? "permanent" : "retry_exhausted",
        });
      } else {
        this.metrics.retriesTotal.inc({ operation: "sqs" });
        await this.sqs.changeVisibility(
          receipt,
          Math.min(300, 2 ** Math.min(attempt, 8)),
        );
      }
      this.logger
        .child({ messageId, attempt })
        .warn(permanent ? "Message sent to DLQ" : "Message processing failed");
    } finally {
      clearInterval(heartbeat);
    }
  }
}
class InvalidMessage extends Error {}
