import { Wallet } from "../../domain/wallet/wallet";
import { WagerTransaction } from "../../domain/transaction/wager-transaction";
import { WalletLedgerEntry } from "../../domain/ledger/wallet-ledger-entry";
import { InboxMessage } from "../../domain/inbox/inbox-message";
import { OutboxMessage } from "../../domain/outbox/outbox-message";
import { IntegrationEvent } from "../../domain/outbox/integration-event";

export interface ProcessingContext {
  wallet: Wallet;
  transaction: WagerTransaction;
  ledgerEntry?: WalletLedgerEntry;
  inboxMessage?: InboxMessage;
  outboxEvents: IntegrationEvent<unknown>[];
}

export interface TransactionProcessor {
  process(ctx: ProcessingContext): Promise<void>;
}
