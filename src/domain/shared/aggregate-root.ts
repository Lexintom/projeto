import { Entity } from "./entity";
import { WalletLedgerEntry } from "../ledger/wallet-ledger-entry";

export abstract class AggregateRoot<
  Props extends { id: string },
> extends Entity<Props> {
  private _domainEvents: WalletLedgerEntry[] = [];

  protected constructor(props: Props) {
    super(props);
  }

  get domainEvents(): ReadonlyArray<WalletLedgerEntry> {
    return this._domainEvents;
  }

  protected addDomainEvent(event: WalletLedgerEntry): void {
    this._domainEvents.push(event);
  }

  public clearDomainEvents(): void {
    this._domainEvents = [];
  }

  public popDomainEvents(): WalletLedgerEntry[] {
    const events = this._domainEvents;
    this._domainEvents = [];
    return events;
  }
}
