import {
  Injectable,
  Inject,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from "@nestjs/common";
import type { WagerTransactionRepository } from "../../domain/transaction/wager-transaction.repository.interface";
import { Money } from "../../domain/money/money";
import { SubmitWagerTransactionUseCase } from "../../application/use-cases/submit-wager-transaction.use-case";
import { DatabaseUnitOfWork } from "../database/unit-of-work";

@Injectable()
export class PendingReferenceWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = false;
  private active?: Promise<void>;
  private readonly logger = new Logger(PendingReferenceWorker.name);
  constructor(
    @Inject("WagerTransactionRepository")
    private readonly transactions: WagerTransactionRepository,
    private readonly submit: SubmitWagerTransactionUseCase,
    private readonly unit: DatabaseUnitOfWork,
  ) {}
  onModuleInit(): void {
    this.active = this.tick();
  }
  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.active;
  }
  private async tick(): Promise<void> {
    try {
      const pending = await this.unit.run(() =>
        this.transactions.findPendingReferencesGlobal(100),
      );
      for (const tx of pending) {
        if (this.stopped) break;
        await this.submit.execute({
          ...tx.toJSON(),
          money: tx.money,
          payloadHash: tx.payloadHash,
        });
      }
    } catch (error) {
      this.logger.warn("Pending reference processing failed; will retry");
    }
    if (!this.stopped)
      this.timer = setTimeout(() => {
        this.active = this.tick();
      }, 1000);
  }
}
