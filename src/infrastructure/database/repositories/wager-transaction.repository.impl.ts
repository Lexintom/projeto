import { EntityManager } from "@mikro-orm/postgresql";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@mikro-orm/nestjs";
import { EntityRepository } from "@mikro-orm/core";
import { WagerTransaction } from "../../../domain/transaction/wager-transaction";
import type { WagerTransactionRepository } from "../../../domain/transaction/wager-transaction.repository.interface";
import {
  WagerTransactionStatus,
  WagerTransactionKind,
} from "../../../domain/transaction/wager-transaction.enums";
import { FailureCode } from "../../../domain/transaction/failure-codes";
import { WagerTransactionEntity } from "./wager-transaction.entity";

@Injectable()
export class WagerTransactionRepositoryImpl implements WagerTransactionRepository {
  constructor(
    @InjectRepository(WagerTransactionEntity)
    private readonly repo: EntityRepository<WagerTransactionEntity>,
    private readonly em: EntityManager,
  ) {}

  async hasReversal(
    referenceId: string,
    kind: WagerTransactionKind,
  ): Promise<boolean> {
    return (
      (await this.repo.count({
        referenceTransactionId: referenceId,
        kind,
        status: WagerTransactionStatus.Processed,
      })) > 0
    );
  }

  async findById(id: string): Promise<WagerTransaction | null> {
    const entity = await this.repo.findOne({ id });
    return entity ? this.toDomain(entity) : null;
  }

  async findByIdempotencyKey(key: string): Promise<WagerTransaction | null> {
    const entity = await this.repo.findOne({ idempotencyKey: key });
    return entity ? this.toDomain(entity) : null;
  }

  async findByProviderAndExternalId(
    providerId: string,
    externalTransactionId: string,
  ): Promise<WagerTransaction | null> {
    const entity = await this.repo.findOne({
      providerId,
      externalTransactionId,
    });
    return entity ? this.toDomain(entity) : null;
  }

  async findByReference(
    providerId: string,
    referenceExternalTransactionId: string,
  ): Promise<WagerTransaction | null> {
    // Looks up by provider + externalTransactionId (which is the reference's external ID)
    const entity = await this.repo.findOne({
      providerId,
      externalTransactionId: referenceExternalTransactionId,
    });
    return entity ? this.toDomain(entity) : null;
  }

  async findPendingReferences(
    walletId: string,
    limit: number,
  ): Promise<WagerTransaction[]> {
    // For background worker: find transactions waiting for a reference to appear
    const entities = await this.repo.find(
      { walletId, status: WagerTransactionStatus.PendingReference },
      { limit, orderBy: { createdAt: "ASC" } },
    );
    return entities.map((e) => this.toDomain(e));
  }

  async findPendingReferencesGlobal(
    limit: number,
  ): Promise<WagerTransaction[]> {
    // Global scan for pending references (multi-instance worker coordination)
    const entities = await this.repo.find(
      {
        status: WagerTransactionStatus.PendingReference,
        $or: [
          { nextReferenceAttemptAt: null },
          { nextReferenceAttemptAt: { $lte: new Date() } },
        ],
      },
      { limit, orderBy: { createdAt: "ASC" } },
    );
    return entities.map((e) => this.toDomain(e));
  }

  async save(transaction: WagerTransaction): Promise<void> {
    await this.em.upsert(WagerTransactionEntity, this.toEntity(transaction));
  }

  async saveAll(transactions: WagerTransaction[]): Promise<void> {
    const entities = transactions.map((t) =>
      this.repo.create(this.toEntity(t)),
    );
    await this.em.persistAndFlush(entities);
  }

  async updateStatus(
    id: string,
    status: WagerTransactionStatus,
    failureCode?: FailureCode,
  ): Promise<void> {
    // Direct SQL for status updates - avoids loading full entity, reduces lock time
    // Used by background workers to transition PENDING_REFERENCE -> PROCESSED/REJECTED
    await this.em.execute(
      `UPDATE jungle.wager_transactions
       SET status = ?, failure_code = ?, processed_at = ?, updated_at = ?
       WHERE id = ?`,
      [status, failureCode ?? null, new Date(), id],
    );
  }

  private toDomain(entity: WagerTransactionEntity): WagerTransaction {
    return WagerTransaction.rehydrate({
      resultBalance: entity.resultBalance,
      resultCurrency: entity.resultCurrency,
      referenceAttempts: entity.referenceAttempts,
      nextReferenceAttemptAt: entity.nextReferenceAttemptAt,
      id: entity.id,
      providerId: entity.providerId,
      externalTransactionId: entity.externalTransactionId,
      idempotencyKey: entity.idempotencyKey,
      payloadHash: entity.payloadHash,
      walletId: entity.walletId,
      playerId: entity.playerId,
      roundId: entity.roundId,
      gameId: entity.gameId,
      kind: entity.kind,
      moneyAmount: entity.moneyAmount,
      moneyCurrency: entity.moneyCurrency,
      referenceExternalTransactionId:
        entity.referenceExternalTransactionId ?? null,
      referenceTransactionId: entity.referenceTransactionId ?? null,
      status: entity.status,
      failureCode: entity.failureCode ?? null,
      createdAt: entity.createdAt,
      processedAt: entity.processedAt ?? null,
      updatedAt: entity.updatedAt,
    });
  }

  private toEntity(transaction: WagerTransaction): WagerTransactionEntity {
    return {
      resultBalance: transaction.resultBalance?.amount,
      resultCurrency: transaction.resultBalance?.currency,
      referenceAttempts: transaction.referenceAttempts,
      nextReferenceAttemptAt: transaction.nextReferenceAttemptAt,
      id: transaction.id,
      providerId: transaction.providerId,
      externalTransactionId: transaction.externalTransactionId,
      idempotencyKey: transaction.idempotencyKey,
      payloadHash: transaction.payloadHash,
      walletId: transaction.walletId,
      playerId: transaction.playerId,
      roundId: transaction.roundId,
      gameId: transaction.gameId,
      kind: transaction.kind,
      moneyAmount: transaction.money.amount,
      moneyCurrency: transaction.money.currency,
      referenceExternalTransactionId:
        transaction.referenceExternalTransactionId,
      referenceTransactionId: transaction.referenceTransactionId,
      status: transaction.status,
      failureCode: transaction.failureCode,
      createdAt: transaction.createdAt,
      processedAt: transaction.processedAt,
      updatedAt: transaction.updatedAt,
    };
  }
}
