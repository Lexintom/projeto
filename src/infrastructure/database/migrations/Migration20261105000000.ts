import { Migration } from "@mikro-orm/migrations";

export class Migration20261105000000 extends Migration {
  async up(): Promise<void> {
    this.addSql('create schema if not exists "jungle";');
    this.addSql(
      'create table "jungle"."inbox_messages" ("id" uuid not null, "message_id" varchar(200) not null, "consumer_name" varchar(100) not null, "payload_hash" varchar(64) not null, "received_at" timestamptz not null, "processed_at" timestamptz null, constraint "inbox_messages_pkey" primary key ("id"));',
    );
    this.addSql(
      'create index "inbox_messages_consumer_name_processed_at_index" on "jungle"."inbox_messages" ("consumer_name", "processed_at");',
    );
    this.addSql(
      'alter table "jungle"."inbox_messages" add constraint "inbox_messages_consumer_name_message_id_unique" unique ("consumer_name", "message_id");',
    );
    this.addSql(
      'create table "jungle"."outbox_messages" ("id" uuid not null, "aggregate_id" uuid not null, "event_type" varchar(100) not null, "event_version" int not null, "payload" jsonb not null, "occurred_at" timestamptz not null, "attempts" int not null default 0, "next_attempt_at" timestamptz null, "published_at" timestamptz null, constraint "outbox_messages_pkey" primary key ("id"));',
    );
    this.addSql(
      'create index "outbox_messages_event_type_index" on "jungle"."outbox_messages" ("event_type");',
    );
    this.addSql(
      'create index "outbox_messages_aggregate_id_index" on "jungle"."outbox_messages" ("aggregate_id");',
    );
    this.addSql(
      'create index "outbox_messages_next_attempt_at_published_at_index" on "jungle"."outbox_messages" ("next_attempt_at", "published_at");',
    );
    this.addSql(
      'create table "jungle"."wager_transactions" ("id" uuid not null, "provider_id" varchar(100) not null, "external_transaction_id" varchar(200) not null, "idempotency_key" varchar(300) not null, "payload_hash" varchar(64) not null, "wallet_id" uuid not null, "player_id" uuid not null, "round_id" varchar(100) not null, "game_id" varchar(100) not null, "kind" text check ("kind" in (\'OPENING\', \'BET\', \'WIN\', \'LOSS\', \'REFUND\', \'ROLLBACK\')) not null, "money_amount" numeric(19,2) not null, "money_currency" varchar(3) not null, "reference_external_transaction_id" varchar(200) null, "reference_transaction_id" uuid null, "status" text check ("status" in (\'PENDING\', \'PENDING_REFERENCE\', \'PROCESSED\', \'REJECTED\', \'FAILED\')) not null, "failure_code" text check ("failure_code" in (\'INSUFFICIENT_FUNDS\', \'NEGATIVE_BALANCE_AFTER_REVERSAL\', \'REFERENCE_NOT_FOUND\', \'REFERENCE_ALREADY_REVERSED\', \'REFERENCE_MISMATCH\', \'INVALID_KIND_FOR_REFERENCE\', \'INVALID_AMOUNT\', \'CURRENCY_MISMATCH\', \'WALLET_NOT_FOUND\', \'IDEMPOTENCY_CONFLICT\', \'REFERENCE_TIMEOUT\', \'INTERNAL_ERROR\')) null, "created_at" timestamptz not null, "processed_at" timestamptz null, "updated_at" timestamptz not null, constraint "wager_transactions_pkey" primary key ("id"));',
    );
    this.addSql(
      'create index "wager_transactions_round_id_index" on "jungle"."wager_transactions" ("round_id");',
    );
    this.addSql(
      'create index "wager_transactions_status_index" on "jungle"."wager_transactions" ("status");',
    );
    this.addSql(
      'create index "wager_transactions_provider_id_reference_external__b8537_index" on "jungle"."wager_transactions" ("provider_id", "reference_external_transaction_id");',
    );
    this.addSql(
      'create index "wager_transactions_wallet_id_index" on "jungle"."wager_transactions" ("wallet_id");',
    );
    this.addSql(
      'alter table "jungle"."wager_transactions" add constraint "wager_transactions_provider_id_external_transaction_id_unique" unique ("provider_id", "external_transaction_id");',
    );
    this.addSql(
      'alter table "jungle"."wager_transactions" add constraint "wager_transactions_idempotency_key_unique" unique ("idempotency_key");',
    );
    this.addSql(
      'create table "jungle"."wallets" ("id" uuid not null, "player_id" uuid not null, "currency" varchar(3) not null, "balance_amount" numeric(19,2) not null, "balance_currency" varchar(3) not null, "version" int not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "wallets_pkey" primary key ("id"));',
    );
    this.addSql(
      'create index "wallets_player_id_index" on "jungle"."wallets" ("player_id");',
    );
    this.addSql(
      'alter table "jungle"."wallets" add constraint "wallets_player_id_currency_unique" unique ("player_id", "currency");',
    );
    this.addSql(
      'create table "jungle"."wallet_ledger_entries" ("id" uuid not null, "wallet_id" uuid not null, "transaction_id" uuid not null, "direction" text check ("direction" in (\'DEBIT\', \'CREDIT\')) not null, "money_amount" numeric(19,2) not null, "money_currency" varchar(3) not null, "balance_before_amount" numeric(19,2) not null, "balance_before_currency" varchar(3) not null, "balance_after_amount" numeric(19,2) not null, "balance_after_currency" varchar(3) not null, "created_at" timestamptz not null, constraint "wallet_ledger_entries_pkey" primary key ("id"));',
    );
    this.addSql(
      'create index "wallet_ledger_entries_transaction_id_index" on "jungle"."wallet_ledger_entries" ("transaction_id");',
    );
    this.addSql(
      'create index "wallet_ledger_entries_wallet_id_created_at_index" on "jungle"."wallet_ledger_entries" ("wallet_id", "created_at");',
    );
    this.addSql(
      'alter table "jungle"."wallet_ledger_entries" add constraint "wallet_ledger_entries_transaction_id_wallet_id_unique" unique ("transaction_id", "wallet_id");',
    );
    this.addSql(
      'alter table "jungle"."wallets" add constraint "wallets_nonnegative_balance" check (balance_amount >= 0);',
    );
    this.addSql(
      'alter table "jungle"."wager_transactions" add constraint "transactions_wallet_fk" foreign key (wallet_id) references "jungle"."wallets" (id);',
    );
    this.addSql(
      'alter table "jungle"."wallet_ledger_entries" add constraint "ledger_wallet_fk" foreign key (wallet_id) references "jungle"."wallets" (id);',
    );
    this.addSql(
      "create unique index \"one_reversal_per_kind\" on \"jungle\".\"wager_transactions\" (reference_transaction_id, kind) where status = 'PROCESSED' and kind in ('REFUND','ROLLBACK');",
    );
  }

  async down(): Promise<void> {
    for (const table of [
      "outbox_messages",
      "inbox_messages",
      "wallet_ledger_entries",
      "wager_transactions",
      "wallets",
    ]) {
      this.addSql(`drop table if exists "jungle"."${table}" cascade;`);
    }
  }
}
