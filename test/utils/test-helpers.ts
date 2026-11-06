import { Money } from "../../src/domain/money/money";
import { Wallet } from "../../src/domain/wallet/wallet";
import {
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
} from "../../src/domain/transaction/wager-transaction";
import {
  WalletLedgerEntry,
  LedgerDirection,
} from "../../src/domain/ledger/wallet-ledger-entry";
import { InboxMessage } from "../../src/domain/inbox/inbox-message";
import { OutboxMessage } from "../../src/domain/outbox/outbox-message";
import { IntegrationEvent } from "../../src/domain/outbox/integration-event";

export function createMoney(amount: string, currency = "BRL"): Money {
  return Money.from({ amount, currency });
}

export function createWallet(
  overrides: Partial<{
    id: string;
    playerId: string;
    currency: string;
    initialBalance: Money;
  }> = {},
): Wallet {
  return Wallet.open({
    id: overrides.id ?? crypto.randomUUID(),
    playerId: overrides.playerId ?? crypto.randomUUID(),
    initialBalance:
      overrides.initialBalance ??
      createMoney("1000.00", overrides.currency ?? "BRL"),
  });
}

export function createWagerTransaction(
  overrides: Partial<{
    id: string;
    providerId: string;
    externalTransactionId: string;
    idempotencyKey: string;
    payloadHash: string;
    walletId: string;
    playerId: string;
    roundId: string;
    gameId: string;
    kind: WagerTransactionKind;
    money: Money;
    referenceExternalTransactionId: string | undefined;
  }> = {},
): WagerTransaction {
  return WagerTransaction.create({
    id: overrides.id ?? crypto.randomUUID(),
    providerId: overrides.providerId ?? "provider-a",
    externalTransactionId:
      overrides.externalTransactionId ?? `txn-${crypto.randomUUID()}`,
    idempotencyKey:
      overrides.idempotencyKey ??
      `${overrides.providerId ?? "provider-a"}:${overrides.externalTransactionId ?? "txn-123"}`,
    payloadHash: overrides.payloadHash ?? "hash123",
    walletId: overrides.walletId ?? crypto.randomUUID(),
    playerId: overrides.playerId ?? crypto.randomUUID(),
    roundId: overrides.roundId ?? `round-${crypto.randomUUID()}`,
    gameId: overrides.gameId ?? "fortune-chimp",
    kind: overrides.kind ?? WagerTransactionKind.Bet,
    money: overrides.money ?? createMoney("25.00"),
    referenceExternalTransactionId:
      overrides.referenceExternalTransactionId ??
      ([WagerTransactionKind.Refund, WagerTransactionKind.Rollback].includes(
        overrides.kind!,
      )
        ? "referenced-bet"
        : undefined),
    createdAt: new Date(),
  });
}

export function createLedgerEntry(
  overrides: Partial<{
    walletId: string;
    transactionId: string;
    direction: LedgerDirection;
    money: Money;
    balanceBefore: Money;
    balanceAfter: Money;
  }> = {},
): WalletLedgerEntry {
  const money = overrides.money ?? createMoney("25.00");
  const balanceBefore = overrides.balanceBefore ?? createMoney("1000.00");
  const balanceAfter =
    overrides.balanceAfter ??
    ((overrides.direction ?? LedgerDirection.Debit) === LedgerDirection.Debit
      ? createMoney("975.00")
      : createMoney("1025.00"));

  return WalletLedgerEntry.create({
    walletId: overrides.walletId ?? crypto.randomUUID(),
    transactionId: overrides.transactionId ?? crypto.randomUUID(),
    direction: overrides.direction ?? LedgerDirection.Debit,
    money,
    balanceBefore,
    balanceAfter,
    createdAt: new Date(),
  });
}

export function createInboxMessage(
  overrides: Partial<{
    messageId: string;
    consumerName: string;
    payloadHash: string;
  }> = {},
): InboxMessage {
  return InboxMessage.receive({
    messageId: overrides.messageId ?? `msg-${crypto.randomUUID()}`,
    consumerName: overrides.consumerName ?? "wager-processor",
    payloadHash: overrides.payloadHash ?? "hash123",
    receivedAt: new Date(),
  });
}

export function createOutboxMessage(
  event: IntegrationEvent<unknown>,
): OutboxMessage {
  return OutboxMessage.enqueue({ event });
}

export function canonicalJson(data: Record<string, unknown>): string {
  return JSON.stringify(data, Object.keys(data).sort());
}

export function computePayloadHash(data: Record<string, unknown>): string {
  const canonical = canonicalJson(data);
  let hash = 0;
  for (let i = 0; i < canonical.length; i++) {
    hash = (hash << 5) - hash + canonical.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(16, "0");
}
