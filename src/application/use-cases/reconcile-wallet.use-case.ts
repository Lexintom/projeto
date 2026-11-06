import type { UnitOfWork } from "../ports/unit-of-work";
import { NotFoundException } from "@nestjs/common";
import { Wallet } from "../../domain/wallet/wallet";
import { Money } from "../../domain/money/money";
import type { WalletRepository } from "../../domain/wallet/wallet.repository.interface";
import type { LedgerRepository } from "../../domain/ledger/ledger.repository.interface";

export interface ReconcileWalletCommand {
  walletId: string;
}

export interface ReconcileWalletResult {
  walletId: string;
  storedBalance: Money;
  calculatedBalance: Money;
  difference: Money;
  consistent: boolean;
  checkedEntries: number;
}

export class ReconcileWalletUseCase {
  constructor(
    private readonly walletRepository: WalletRepository,
    private readonly ledgerRepository: LedgerRepository,
    private readonly unit: UnitOfWork,
  ) {}

  async execute(
    command: ReconcileWalletCommand,
  ): Promise<ReconcileWalletResult> {
    return this.unit.run(async () => {
      const wallet = await this.walletRepository.findById(
        command.walletId,
        true,
      );
      if (!wallet) {
        throw new NotFoundException(`Wallet not found: ${command.walletId}`);
      }

      const calculated = await this.ledgerRepository.calculateBalance(
        command.walletId,
      );
      const storedBalance = wallet.balance;

      let calculatedBalance: Money;
      if (calculated) {
        calculatedBalance = Money.from(calculated);
      } else {
        calculatedBalance = Money.zero(wallet.currency);
      }

      const difference = storedBalance.subtract(calculatedBalance);
      const consistent = difference.isZero();

      // Count ledger entries
      const entries = await this.ledgerRepository.findByWalletId(
        command.walletId,
        undefined,
        10000,
      );
      let checkedEntries = entries.length;
      let page = entries;
      while (page.length === 10000) {
        page = await this.ledgerRepository.findByWalletId(
          command.walletId,
          page[page.length - 1]!.id,
          10000,
        );
        checkedEntries += page.length;
      }

      return {
        walletId: command.walletId,
        storedBalance,
        calculatedBalance,
        difference,
        consistent,
        checkedEntries,
      };
    });
  }
}
