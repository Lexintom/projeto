import {
  Entity,
  PrimaryKey,
  Property,
  Unique,
  Index,
  Enum,
} from "@mikro-orm/core";
import { Money } from "../../../domain/money/money";
import { LedgerDirection } from "../../../domain/ledger/ledger-direction.enum";
import {
  WagerTransactionKind,
  WagerTransactionStatus,
} from "../../../domain/transaction/wager-transaction.enums";
import { FailureCode } from "../../../domain/transaction/failure-codes";

@Entity({ tableName: "wallets", schema: "jungle" })
@Unique({ properties: ["playerId", "currency"] })
@Index({ properties: ["playerId"] })
export class WalletEntity {
  @PrimaryKey({ type: "uuid" })
  id!: string;

  @Property({ type: "uuid" })
  playerId!: string;

  @Property({ type: "string", length: 3 })
  currency!: string;

  @Property({ type: "decimal", precision: 19, scale: 2 })
  balanceAmount!: string;

  @Property({ type: "string", length: 3 })
  balanceCurrency!: string;

  @Property({ type: "int" })
  version!: number;

  @Property({ type: "Date", onCreate: () => new Date() })
  createdAt!: Date;

  @Property({ type: "Date", onUpdate: () => new Date() })
  updatedAt!: Date;
}
