import type {
  SubmitWagerTransactionCommand,
  SubmitWagerTransactionResult,
} from "../../application/use-cases/submit-wager-transaction.use-case";
import { AppLogger } from "./logger";
import { Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
} from "prom-client";

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly registry: Registry;
  private readonly enabled: boolean;

  public readonly transactionsTotal: Counter;
  public readonly duplicatesDetected: Counter;
  public readonly retriesTotal: Counter;
  public readonly dlqMessagesTotal: Counter;
  public readonly lockConflictsTotal: Counter;
  public readonly idempotencyConflictsTotal: Counter;
  public readonly reconciliationMismatches: Counter;

  public readonly processingDuration: Histogram;
  public readonly outboxLag: Histogram;

  public readonly walletsTotal: Gauge;
  public readonly pendingTransactions: Gauge;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: AppLogger,
  ) {
    this.registry = new Registry();
    this.enabled = config.get("METRICS_ENABLED") ?? true;

    {
      if (this.enabled)
        collectDefaultMetrics({ register: this.registry, prefix: "jungle_" });

      this.reconciliationMismatches = new Counter({
        name: "jungle_reconciliation_mismatches_total",
        help: "Wallet and ledger mismatches",
        registers: [this.registry],
      });
      this.transactionsTotal = new Counter({
        name: "jungle_transactions_total",
        help: "Total number of transactions processed by status",
        labelNames: ["status", "kind"],
        registers: [this.registry],
      });

      this.duplicatesDetected = new Counter({
        name: "jungle_duplicates_detected_total",
        help: "Total number of duplicate transactions detected",
        labelNames: ["source"],
        registers: [this.registry],
      });

      this.retriesTotal = new Counter({
        name: "jungle_retries_total",
        help: "Total number of retries",
        labelNames: ["operation"],
        registers: [this.registry],
      });

      this.dlqMessagesTotal = new Counter({
        name: "jungle_dlq_messages_total",
        help: "Total number of messages sent to DLQ",
        labelNames: ["reason"],
        registers: [this.registry],
      });

      this.lockConflictsTotal = new Counter({
        name: "jungle_lock_conflicts_total",
        help: "Total number of optimistic lock conflicts",
        registers: [this.registry],
      });

      this.idempotencyConflictsTotal = new Counter({
        name: "jungle_idempotency_conflicts_total",
        help: "Total number of idempotency key conflicts",
        registers: [this.registry],
      });

      this.processingDuration = new Histogram({
        name: "jungle_processing_duration_seconds",
        help: "Transaction processing duration in seconds",
        labelNames: ["kind"],
        buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
        registers: [this.registry],
      });

      this.outboxLag = new Histogram({
        name: "jungle_outbox_lag_seconds",
        help: "Outbox message lag in seconds",
        buckets: [1, 5, 10, 30, 60, 120, 300, 600],
        registers: [this.registry],
      });

      this.walletsTotal = new Gauge({
        name: "jungle_wallets_total",
        help: "Total number of wallets",
        registers: [this.registry],
      });

      this.pendingTransactions = new Gauge({
        name: "jungle_pending_transactions",
        help: "Number of pending transactions",
        labelNames: ["status"],
        registers: [this.registry],
      });
    }
  }

  completed(
    command: SubmitWagerTransactionCommand,
    result: SubmitWagerTransactionResult,
    seconds: number,
  ): void {
    if (result.idempotentReplay)
      this.duplicatesDetected.inc({
        source: command.inboxMessageId ? "sqs" : "http",
      });
    else
      this.transactionsTotal.inc({
        status: result.transaction.status,
        kind: result.transaction.kind,
      });
    this.processingDuration.observe({ kind: result.transaction.kind }, seconds);
    this.logger
      .child({
        correlationId: command.correlationId ?? result.transaction.id,
        messageId: command.inboxMessageId ?? null,
        transactionId: result.transaction.id,
        walletId: command.walletId,
        providerId: command.providerId,
        status: result.transaction.status,
      })
      .log("Transaction committed");
  }

  retry(): void {
    this.retriesTotal.inc({ operation: "financial_transaction" });
    this.lockConflictsTotal.inc();
  }
  idempotencyConflict(): void {
    this.idempotencyConflictsTotal.inc();
  }

  onModuleInit(): void {}

  getRegistry(): Registry {
    return this.registry;
  }

  getContentType(): string {
    return this.registry.contentType;
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
}
