import { MetricsService } from "../observability/metrics";
import type { UnitOfWork } from "../../application/ports/unit-of-work";
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { OutboxRepository } from "../../domain/outbox/outbox.repository.interface";
import type { EventPublisher } from "../../application/ports/event-publisher";

@Injectable()
export class OutboxPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxPublisher.name);
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private readonly maxAttempts: number;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;
  private isRunning = false;
  private pollTimeout?: NodeJS.Timeout;
  private active?: Promise<void>;

  constructor(
    private readonly config: ConfigService,
    private readonly outboxRepository: OutboxRepository,
    private readonly eventPublisher: EventPublisher,
    private readonly unitOfWork: UnitOfWork,
    private readonly metrics?: MetricsService,
  ) {
    this.pollIntervalMs = config.get("OUTBOX_POLL_INTERVAL_MS") ?? 1000;
    this.batchSize = config.get("OUTBOX_BATCH_SIZE") ?? 100;
    this.maxAttempts = config.get("OUTBOX_MAX_ATTEMPTS") ?? 10;
    this.baseBackoffMs = config.get("OUTBOX_BASE_BACKOFF_MS") ?? 1000;
    this.maxBackoffMs = config.get("OUTBOX_MAX_BACKOFF_MS") ?? 60000;
  }

  async onModuleInit(): Promise<void> {
    await this.start();
  }

  async onModuleDestroy(): Promise<void> {
    await this.stop();
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.active = this.poll();
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
    }
    await this.active;
  }

  private async poll(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const now = new Date();
      const messages = await this.unitOfWork.run(async () => {
        const items = await this.outboxRepository.findPending(
          this.batchSize,
          now,
        );
        await this.processBatch(items);
        return items;
      });

      if (messages.length === 0) {
        this.logger.debug("No pending outbox messages");
      } else {
        this.logger.debug(`Processing ${messages.length} outbox messages`);
      }
    } catch (error) {
      this.logger.warn("Outbox poll failed; will retry");
    } finally {
      if (this.isRunning) {
        this.pollTimeout = setTimeout(() => {
          this.active = this.poll();
        }, this.pollIntervalMs);
      }
    }
  }

  private async processBatch(
    messages: Awaited<ReturnType<OutboxRepository["findPending"]>>,
  ): Promise<void> {
    for (const message of messages) {
      if (!this.isRunning) break;

      try {
        await this.eventPublisher.publish({
          eventType: message.eventType,
          payload: message.payload,
        });

        this.metrics?.outboxLag.observe(
          (Date.now() - message.occurredAt.getTime()) / 1000,
        );
        await this.outboxRepository.markPublished(message.id, new Date());
        this.logger.debug(
          `Published outbox message ${message.id} (${message.eventType})`,
        );
      } catch (error) {
        this.logger.error(`Failed to publish outbox message ${message.id}`);
        this.metrics?.retriesTotal.inc({ operation: "outbox" });
        message.scheduleRetry(
          new Date(),
          this.baseBackoffMs,
          this.maxBackoffMs,
          this.maxAttempts,
        );
        await this.outboxRepository.save(message);
      }
    }
  }
}
