import {
  Entity,
  PrimaryKey,
  Property,
  Unique,
  Index,
  Enum,
} from "@mikro-orm/core";
import {
  WagerTransactionKind,
  WagerTransactionStatus,
} from "../../../domain/transaction/wager-transaction.enums";
import { FailureCode } from "../../../domain/transaction/failure-codes";

@Entity({ tableName: "wager_transactions", schema: "jungle" })
@Unique({ properties: ["idempotencyKey"] })
@Unique({ properties: ["providerId", "externalTransactionId"] })
@Index({ properties: ["walletId"] })
@Index({ properties: ["providerId", "referenceExternalTransactionId"] })
@Index({ properties: ["status"] })
@Index({ properties: ["roundId"] })
export class WagerTransactionEntity {
  @Property({ type: "decimal", precision: 19, scale: 2, nullable: true })
  resultBalance?: string;

  @Property({ type: "string", length: 3, nullable: true })
  resultCurrency?: string;

  @Property({ type: "integer", default: 0 })
  referenceAttempts = 0;

  @Property({ type: "Date", nullable: true })
  nextReferenceAttemptAt?: Date;

  @PrimaryKey({ type: "uuid" })
  id!: string;

  @Property({ type: "string", length: 100 })
  providerId!: string;

  @Property({ type: "string", length: 200 })
  externalTransactionId!: string;

  @Property({ type: "string", length: 300 })
  idempotencyKey!: string;

  @Property({ type: "string", length: 64 })
  payloadHash!: string;

  @Property({ type: "uuid" })
  walletId!: string;

  @Property({ type: "uuid" })
  playerId!: string;

  @Property({ type: "string", length: 100 })
  roundId!: string;

  @Property({ type: "string", length: 100 })
  gameId!: string;

  @Enum(() => WagerTransactionKind)
  kind!: WagerTransactionKind;

  @Property({ type: "decimal", precision: 19, scale: 2 })
  moneyAmount!: string;

  @Property({ type: "string", length: 3 })
  moneyCurrency!: string;

  @Property({ type: "string", length: 200, nullable: true })
  referenceExternalTransactionId?: string;

  @Property({ type: "uuid", nullable: true })
  referenceTransactionId?: string;

  @Enum(() => WagerTransactionStatus)
  status!: WagerTransactionStatus;

  @Enum({ items: () => FailureCode, nullable: true })
  failureCode?: FailureCode;

  @Property({ type: "Date", onCreate: () => new Date() })
  createdAt!: Date;

  @Property({ type: "Date", nullable: true })
  processedAt?: Date;

  @Property({ type: "Date", onUpdate: () => new Date() })
  updatedAt!: Date;
}
