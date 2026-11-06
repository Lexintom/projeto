import {
  Entity,
  PrimaryKey,
  Property,
  Unique,
  Index,
  Enum,
} from "@mikro-orm/core";
import { LedgerDirection } from "../../../domain/ledger/ledger-direction.enum";

@Entity({ tableName: "wallet_ledger_entries", schema: "jungle" })
@Unique({ properties: ["transactionId", "walletId"] })
@Index({ properties: ["walletId", "createdAt"] })
@Index({ properties: ["transactionId"] })
export class WalletLedgerEntryEntity {
  @PrimaryKey({ type: "uuid" })
  id!: string;

  @Property({ type: "uuid" })
  walletId!: string;

  @Property({ type: "uuid" })
  transactionId!: string;

  @Enum(() => LedgerDirection)
  direction!: LedgerDirection;

  @Property({ type: "decimal", precision: 19, scale: 2 })
  moneyAmount!: string;

  @Property({ type: "string", length: 3 })
  moneyCurrency!: string;

  @Property({ type: "decimal", precision: 19, scale: 2 })
  balanceBeforeAmount!: string;

  @Property({ type: "string", length: 3 })
  balanceBeforeCurrency!: string;

  @Property({ type: "decimal", precision: 19, scale: 2 })
  balanceAfterAmount!: string;

  @Property({ type: "string", length: 3 })
  balanceAfterCurrency!: string;

  @Property({ type: "Date", onCreate: () => new Date() })
  createdAt!: Date;
}
