import { Migration } from "@mikro-orm/migrations";

export class Migration20261106000000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`alter table jungle.wager_transactions
      add column result_balance numeric(19,2), add column result_currency varchar(3),
      add column reference_attempts int not null default 0,
      add column next_reference_attempt_at timestamptz;`);
    // Older versions recorded an opening ledger entry without its transaction.
    this.addSql(`insert into jungle.wager_transactions
      (id,provider_id,external_transaction_id,idempotency_key,payload_hash,wallet_id,player_id,round_id,game_id,kind,money_amount,money_currency,status,created_at,processed_at,updated_at,result_balance,result_currency)
      select l.transaction_id,'internal',l.wallet_id::text,'opening:'||l.wallet_id::text,repeat('0',64),l.wallet_id,w.player_id,'opening','internal','OPENING',l.money_amount,l.money_currency,'PROCESSED',l.created_at,l.created_at,l.created_at,l.balance_after_amount,l.money_currency
      from jungle.wallet_ledger_entries l join jungle.wallets w on w.id=l.wallet_id
      where l.transaction_id=l.wallet_id and not exists(select 1 from jungle.wager_transactions t where t.id=l.transaction_id);`);
    this
      .addSql(`update jungle.wager_transactions t set result_balance=l.balance_after_amount, result_currency=l.money_currency
      from jungle.wallet_ledger_entries l where t.id=l.transaction_id and t.result_balance is null;`);
    this
      .addSql(`alter table jungle.wallets add constraint wallet_currency_consistent check(currency=balance_currency),
      add constraint wallet_version_positive check(version>=1);`);
    this.addSql(`alter table jungle.wallet_ledger_entries
      add constraint ledger_transaction_fk foreign key(transaction_id) references jungle.wager_transactions(id),
      add constraint ledger_positive_amount check(money_amount>0),
      add constraint ledger_nonnegative check(balance_before_amount>=0 and balance_after_amount>=0),
      add constraint ledger_currencies check(money_currency=balance_before_currency and money_currency=balance_after_currency),
      add constraint ledger_arithmetic check(balance_after_amount=balance_before_amount + case when direction='CREDIT' then money_amount else -money_amount end);`);
    this.addSql(`alter table jungle.wager_transactions
      add constraint transaction_reference_fk foreign key(reference_transaction_id) references jungle.wager_transactions(id),
      add constraint transaction_amount check(money_amount>=0 and (kind='LOSS' or money_amount>0));`);
    this
      .addSql(`create function jungle.protect_ledger() returns trigger language plpgsql as $$
      begin raise exception 'Ledger is append-only' using errcode='23514'; end $$;`);
    this
      .addSql(`create trigger ledger_immutable before update or delete on jungle.wallet_ledger_entries
      for each row execute function jungle.protect_ledger();`);
    this
      .addSql(`create function jungle.protect_terminal_transaction() returns trigger language plpgsql as $$
      begin
        if tg_op='DELETE' or (old.status in ('PROCESSED','REJECTED','FAILED') and old is distinct from new) then
          raise exception 'Terminal transaction is immutable' using errcode='23514';
        end if;
        return new;
      end $$;`);
    this
      .addSql(`create trigger terminal_transaction_immutable before update or delete on jungle.wager_transactions
      for each row execute function jungle.protect_terminal_transaction();`);
    // Deferred constraints see all writes from the financial transaction at commit.
    this
      .addSql(`create function jungle.check_wallet_ledger() returns trigger language plpgsql as $$
      declare wid uuid; stored numeric; rebuilt numeric; wallet_currency text;
      begin
        if tg_table_name='wallets' then wid:=new.id; else wid:=new.wallet_id; end if;
        select balance_amount,currency into stored,wallet_currency from jungle.wallets where id=wid for update;
        select coalesce(sum(case when direction='CREDIT' then money_amount else -money_amount end),0) into rebuilt
          from jungle.wallet_ledger_entries where wallet_id=wid;
        if stored<>rebuilt or exists(select 1 from jungle.wallet_ledger_entries where wallet_id=wid and money_currency<>wallet_currency) then
          raise exception 'Wallet and ledger disagree' using errcode='23514';
        end if;
        return null;
      end $$;`);
    this
      .addSql(`create constraint trigger wallet_ledger_consistency after insert or update on jungle.wallets
      deferrable initially deferred for each row execute function jungle.check_wallet_ledger();`);
    this
      .addSql(`create constraint trigger ledger_wallet_consistency after insert on jungle.wallet_ledger_entries
      deferrable initially deferred for each row execute function jungle.check_wallet_ledger();`);
    this
      .addSql(`create function jungle.check_transaction_ledger() returns trigger language plpgsql as $$
      declare tid uuid; tx jungle.wager_transactions; n int;
      begin
        if tg_table_name='wager_transactions' then tid:=new.id; else tid:=new.transaction_id; end if;
        select * into tx from jungle.wager_transactions where id=tid;
        select count(*) into n from jungle.wallet_ledger_entries where transaction_id=tid;
        if (tx.status='PROCESSED' and tx.kind<>'LOSS' and n<>1) or ((tx.status<>'PROCESSED' or tx.kind='LOSS') and n<>0) then
          raise exception 'Transaction and ledger disagree' using errcode='23514';
        end if;
        if exists(select 1 from jungle.wallet_ledger_entries l where l.transaction_id=tid and
          (l.wallet_id<>tx.wallet_id or l.money_amount<>tx.money_amount or l.money_currency<>tx.money_currency)) then
          raise exception 'Ledger does not match transaction' using errcode='23514';
        end if;
        return null;
      end $$;`);
    this
      .addSql(`create constraint trigger transaction_ledger_consistency after insert or update on jungle.wager_transactions
      deferrable initially deferred for each row execute function jungle.check_transaction_ledger();`);
    this
      .addSql(`create constraint trigger ledger_transaction_consistency after insert on jungle.wallet_ledger_entries
      deferrable initially deferred for each row execute function jungle.check_transaction_ledger();`);
    this
      .addSql(`create function jungle.check_wallet_version() returns trigger language plpgsql as $$
      begin
        if tg_op='INSERT' then
          if new.version<>1 then raise exception 'Wallet starts at version 1' using errcode='23514'; end if;
        elsif (new.balance_amount<>old.balance_amount and new.version<>old.version+1)
          or (new.balance_amount=old.balance_amount and new.version<>old.version) then
          raise exception 'Version must follow balance changes' using errcode='23514';
        end if;
        return new;
      end $$;`);
    this
      .addSql(`create trigger wallet_version_transition before insert or update on jungle.wallets
      for each row execute function jungle.check_wallet_version();`);
    this
      .addSql(`create function jungle.check_ledger_chain() returns trigger language plpgsql as $$
      declare prior_balance numeric;
      begin
        perform 1 from jungle.wallets where id=new.wallet_id for update;
        select coalesce(sum(case when direction='CREDIT' then money_amount else -money_amount end),0)
          into prior_balance from jungle.wallet_ledger_entries where wallet_id=new.wallet_id;
        if prior_balance<>new.balance_before_amount then raise exception 'Broken ledger chain' using errcode='23514'; end if;
        return new;
      end $$;`);
    this
      .addSql(`create trigger ledger_chain before insert on jungle.wallet_ledger_entries
      for each row execute function jungle.check_ledger_chain();`);
    this.addSql(
      `create index pending_reference_due on jungle.wager_transactions(next_reference_attempt_at,created_at) where status='PENDING_REFERENCE';`,
    );
  }

  async down(): Promise<void> {
    this
      .addSql(`drop trigger wallet_version_transition on jungle.wallets; drop function jungle.check_wallet_version();
      drop trigger ledger_chain on jungle.wallet_ledger_entries; drop function jungle.check_ledger_chain();
      drop trigger ledger_transaction_consistency on jungle.wallet_ledger_entries;
      drop trigger transaction_ledger_consistency on jungle.wager_transactions;
      drop trigger ledger_wallet_consistency on jungle.wallet_ledger_entries;
      drop trigger wallet_ledger_consistency on jungle.wallets;
      drop trigger terminal_transaction_immutable on jungle.wager_transactions;
      drop trigger ledger_immutable on jungle.wallet_ledger_entries;
      drop function jungle.check_transaction_ledger(); drop function jungle.check_wallet_ledger();
      drop function jungle.protect_terminal_transaction(); drop function jungle.protect_ledger();
      drop index jungle.pending_reference_due;`);
    this
      .addSql(`alter table jungle.wallet_ledger_entries drop constraint ledger_transaction_fk,
      drop constraint ledger_positive_amount, drop constraint ledger_nonnegative,
      drop constraint ledger_currencies, drop constraint ledger_arithmetic;`);
    this.addSql(
      `alter table jungle.wallets drop constraint wallet_currency_consistent, drop constraint wallet_version_positive;`,
    );
    this
      .addSql(`alter table jungle.wager_transactions drop constraint transaction_reference_fk, drop constraint transaction_amount,
      drop column result_balance, drop column result_currency, drop column reference_attempts, drop column next_reference_attempt_at;`);
  }
}
