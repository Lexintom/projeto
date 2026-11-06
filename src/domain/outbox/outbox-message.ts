import { Entity } from "../shared/entity";
import { IntegrationEvent } from "./integration-event";
import type {
  EnqueueOutboxProps,
  OutboxMessageState,
} from "./outbox-message.props";

export class OutboxMessage extends Entity<OutboxMessageState> {
  private constructor(state: OutboxMessageState) {
    super(state);
  }

  public static enqueue(props: EnqueueOutboxProps): OutboxMessage {
    const event = props.event;
    const eventJson = event.toJSON();

    const state: OutboxMessageState = {
      id: crypto.randomUUID(),
      aggregateId: event.aggregateId,
      eventType: eventJson.eventType,
      eventVersion: eventJson.version,
      payload: eventJson as Record<string, unknown>,
      occurredAt: event.occurredAt,
      attempts: 0,
      nextAttemptAt: new Date(),
      publishedAt: null,
    };

    return new OutboxMessage(state);
  }

  public static rehydrate(state: OutboxMessageState): OutboxMessage {
    return new OutboxMessage(state);
  }

  get aggregateId(): string {
    return this.props.aggregateId;
  }

  get eventType(): string {
    return this.props.eventType;
  }

  get eventVersion(): number {
    return this.props.eventVersion;
  }

  get payload(): Readonly<Record<string, unknown>> {
    return this.props.payload;
  }

  get occurredAt(): Date {
    return this.props.occurredAt;
  }

  get attempts(): number {
    return this.props.attempts;
  }

  get nextAttemptAt(): Date | undefined {
    return this.props.nextAttemptAt ?? undefined;
  }

  get publishedAt(): Date | undefined {
    return this.props.publishedAt ?? undefined;
  }

  public isPending(): boolean {
    return this.props.publishedAt === null;
  }

  public isDue(now: Date): boolean {
    if (!this.isPending()) return false;
    if (!this.props.nextAttemptAt) return this.props.attempts === 0;
    return this.props.nextAttemptAt <= now;
  }

  public markPublished(at: Date): void {
    this.props.publishedAt = at;
    this.props.nextAttemptAt = null;
  }

  public scheduleRetry(
    now: Date,
    baseBackoffMs: number,
    maxBackoffMs: number,
    maxAttempts: number,
  ): void {
    this.props.attempts += 1;
    const backoff = Math.min(
      baseBackoffMs *
        Math.pow(2, Math.min(this.props.attempts - 1, maxAttempts)),
      maxBackoffMs,
    );
    const jitter = Math.random() * backoff * 0.1;
    this.props.nextAttemptAt = new Date(now.getTime() + backoff + jitter);
  }

  public toJSON(): OutboxMessageState {
    return { ...this.props };
  }
}
