import type { MikroORM } from "@mikro-orm/postgresql";
import { WalletEntity } from "../../src/infrastructure/database/repositories/wallet.entity";
import { WagerTransactionEntity } from "../../src/infrastructure/database/repositories/wager-transaction.entity";
import { WalletLedgerEntryEntity } from "../../src/infrastructure/database/repositories/wallet-ledger-entry.entity";
import { InboxMessageEntity } from "../../src/infrastructure/database/repositories/inbox-message.entity";
import { OutboxMessageEntity } from "../../src/infrastructure/database/repositories/outbox-message.entity";
import { WalletRepositoryImpl } from "../../src/infrastructure/database/repositories/wallet.repository.impl";
import { WagerTransactionRepositoryImpl } from "../../src/infrastructure/database/repositories/wager-transaction.repository.impl";
import { LedgerRepositoryImpl } from "../../src/infrastructure/database/repositories/ledger.repository.impl";
import { InboxRepositoryImpl } from "../../src/infrastructure/database/repositories/inbox.repository.impl";
import { OutboxRepositoryImpl } from "../../src/infrastructure/database/repositories/outbox.repository.impl";
import { DatabaseUnitOfWork } from "../../src/infrastructure/database/unit-of-work";
import { CreateWalletUseCase } from "../../src/application/use-cases/create-wallet.use-case";
import { SubmitWagerTransactionUseCase } from "../../src/application/use-cases/submit-wager-transaction.use-case";
import { WagerTransactionKind } from "../../src/domain/transaction/wager-transaction.enums";
import { Money } from "../../src/domain/money/money";
import { computePayloadHash } from "../../src/application/payload-hash";

export function fixture(orm: MikroORM) {
  const em = orm.em;
  const unit = new DatabaseUnitOfWork(em);
  const wallets = new WalletRepositoryImpl(em.getRepository(WalletEntity), em);
  const transactions = new WagerTransactionRepositoryImpl(
    em.getRepository(WagerTransactionEntity),
    em,
  );
  const ledger = new LedgerRepositoryImpl(
    em.getRepository(WalletLedgerEntryEntity),
    em,
  );
  const inbox = new InboxRepositoryImpl(
    em.getRepository(InboxMessageEntity),
    em,
  );
  const outbox = new OutboxRepositoryImpl(
    em.getRepository(OutboxMessageEntity),
    em,
  );
  return {
    unit,
    wallets,
    ledger,
    transactions,
    inbox,
    outbox,
    create: new CreateWalletUseCase(
      wallets,
      ledger,
      unit,
      transactions,
      outbox,
    ),
    submit: new SubmitWagerTransactionUseCase(
      wallets,
      transactions,
      ledger,
      inbox,
      outbox,
      unit,
      25,
      2,
    ),
  };
}
export function command(walletId: string, playerId: string, amount = "10.00") {
  const payload = {
    providerId: "test-provider",
    externalTransactionId: crypto.randomUUID(),
    walletId,
    playerId,
    roundId: "round-1",
    gameId: "game-1",
    kind: WagerTransactionKind.Bet,
    money: { amount, currency: "BRL" },
  };
  return {
    ...payload,
    money: Money.from(payload.money),
    idempotencyKey: crypto.randomUUID(),
    payloadHash: computePayloadHash(payload),
  };
}
