export interface DomainEventProps {
  eventId: string;
  aggregateId: string;
  occurredAt: Date;
}

export abstract class DomainEvent<Props extends DomainEventProps> {
  public readonly eventId: string;
  public readonly aggregateId: string;
  public readonly occurredAt: Date;
  public readonly eventType: string;

  protected constructor(props: Props, eventType: string) {
    this.eventId = props.eventId;
    this.aggregateId = props.aggregateId;
    this.occurredAt = props.occurredAt;
    this.eventType = eventType;
  }

  public abstract toJSON(): Record<string, unknown>;
}
