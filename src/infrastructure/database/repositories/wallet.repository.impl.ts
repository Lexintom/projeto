import { EntityManager } from "@mikro-orm/postgresql";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@mikro-orm/nestjs";
import { EntityRepository, LockMode } from "@mikro-orm/core";
import { Wallet } from "../../../domain/wallet/wallet";
import { Money } from "../../../domain/money/money";
import type { WalletRepository } from "../../../domain/wallet/wallet.repository.interface";
import { WalletEntity } from "./wallet.entity";

@Injectable()
export class WalletRepositoryImpl implements WalletRepository {
  constructor(
    @InjectRepository(WalletEntity)
    private readonly repo: EntityRepository<WalletEntity>,
    private readonly em: EntityManager,
  ) {}

  async findById(id: string, forUpdate = false): Promise<Wallet | null> {
    const entity = await this.repo.findOne(
      { id },
      {
        refresh: true,
        ...(forUpdate ? { lockMode: LockMode.PESSIMISTIC_WRITE } : {}),
      },
    );
    return entity ? this.toDomain(entity) : null;
  }

  async findByPlayerIdAndCurrency(
    playerId: string,
    currency: string,
  ): Promise<Wallet | null> {
    const entity = await this.repo.findOne({ playerId, currency });
    return entity ? this.toDomain(entity) : null;
  }

  async save(wallet: Wallet): Promise<void> {
    const entity = this.repo.create(this.toEntity(wallet));
    await this.em.persistAndFlush(entity);
  }

  async saveAll(wallets: Wallet[]): Promise<void> {
    const entities = wallets.map((w) => this.repo.create(this.toEntity(w)));
    await this.em.persistAndFlush(entities);
  }

  async saveWithOptimisticLock(
    wallet: Wallet,
    expectedVersion: number,
  ): Promise<boolean> {
    const result = await this.em.execute(
      `UPDATE jungle.wallets
       SET balance_amount = ?, balance_currency = ?, version = version + 1, updated_at = ?
       WHERE id = ? AND version = ? RETURNING id`,
      [
        wallet.balance.amount,
        wallet.balance.currency,
        wallet.updatedAt,
        wallet.id,
        expectedVersion,
      ],
    );
    return result.length === 1;
  }

  private toDomain(entity: WalletEntity): Wallet {
    return Wallet.rehydrate({
      id: entity.id,
      playerId: entity.playerId,
      currency: entity.currency,
      balance: entity.balanceAmount,
      version: entity.version,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }

  private toEntity(wallet: Wallet): WalletEntity {
    return {
      id: wallet.id,
      playerId: wallet.playerId,
      currency: wallet.currency,
      balanceAmount: wallet.balance.amount,
      balanceCurrency: wallet.balance.currency,
      version: wallet.version,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
    };
  }
}
