import { EntityManager } from "@mikro-orm/postgresql";
import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@mikro-orm/nestjs";
import { EntityRepository } from "@mikro-orm/core";
import { WalletLedgerEntry } from "../../../domain/ledger/wallet-ledger-entry";
import type { LedgerRepository } from "../../../domain/ledger/ledger.repository.interface";
import { WalletLedgerEntryEntity } from "./wallet-ledger-entry.entity";
import { LedgerDirection } from "../../../domain/ledger/ledger-direction.enum";
import { Money } from "../../../domain/money/money";

@Injectable()
export class LedgerRepositoryImpl implements LedgerRepository {
  constructor(
    @InjectRepository(WalletLedgerEntryEntity)
    private readonly repo: EntityRepository<WalletLedgerEntryEntity>,
    private readonly em: EntityManager,
  ) {}

  async findByTransactionId(
    transactionId: string,
  ): Promise<WalletLedgerEntry[]> {
    const entities = await this.repo.find(
      { transactionId },
      { orderBy: { createdAt: "ASC" } },
    );
    return entities.map((e) => this.toDomain(e));
  }

  async findByWalletId(
    walletId: string,
    cursor?: string,
    limit: number = 50,
  ): Promise<WalletLedgerEntry[]> {
    const query: Record<string, unknown> = { walletId };
    if (cursor) {
      const anchor = await this.repo.findOne({ id: cursor, walletId });
      if (!anchor)
        throw new BadRequestException("Cursor does not belong to this wallet");
      query.$or = [
        { createdAt: { $gt: anchor.createdAt } },
        { createdAt: anchor.createdAt, id: { $gt: cursor } },
      ];
    }
    const entities = await this.repo.find(query, {
      limit,
      orderBy: { createdAt: "ASC", id: "ASC" },
    });
    return entities.map((e) => this.toDomain(e));
  }

  async save(entry: WalletLedgerEntry): Promise<void> {
    const entity = this.repo.create(this.toEntity(entry));
    await this.em.persistAndFlush(entity);
  }

  async saveAll(entries: WalletLedgerEntry[]): Promise<void> {
    const entities = entries.map((e) => this.repo.create(this.toEntity(e)));
    await this.em.persistAndFlush(entities);
  }

  async calculateBalance(
    walletId: string,
  ): Promise<{ amount: string; currency: string } | null> {
    const result = await this.em.execute(
      `SELECT
         COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN money_amount ELSE -money_amount END), 0) as balance,
         money_currency as currency
       FROM jungle.wallet_ledger_entries
       WHERE wallet_id = ?
       GROUP BY money_currency`,
      [walletId],
    );

    if (result.length === 0) return null;
    return { amount: result[0]!.balance, currency: result[0]!.currency };
  }

  private toDomain(entity: WalletLedgerEntryEntity): WalletLedgerEntry {
    return WalletLedgerEntry.rehydrate({
      id: entity.id,
      walletId: entity.walletId,
      transactionId: entity.transactionId,
      direction: entity.direction,
      moneyAmount: entity.moneyAmount,
      moneyCurrency: entity.moneyCurrency,
      balanceBeforeAmount: entity.balanceBeforeAmount,
      balanceBeforeCurrency: entity.balanceBeforeCurrency,
      balanceAfterAmount: entity.balanceAfterAmount,
      balanceAfterCurrency: entity.balanceAfterCurrency,
      createdAt: entity.createdAt,
    });
  }

  private toEntity(entry: WalletLedgerEntry): WalletLedgerEntryEntity {
    return {
      id: entry.id,
      walletId: entry.walletId,
      transactionId: entry.transactionId,
      direction: entry.direction,
      moneyAmount: entry.money.amount,
      moneyCurrency: entry.money.currency,
      balanceBeforeAmount: entry.balanceBefore.amount,
      balanceBeforeCurrency: entry.balanceBefore.currency,
      balanceAfterAmount: entry.balanceAfter.amount,
      balanceAfterCurrency: entry.balanceAfter.currency,
      createdAt: entry.createdAt,
    };
  }
}
