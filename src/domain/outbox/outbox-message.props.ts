import { IntegrationEvent } from "./integration-event";

export interface EnqueueOutboxProps {
  event: IntegrationEvent<unknown>;
}

export interface OutboxMessageState {
  id: string;
  aggregateId: string;
  eventType: string;
  eventVersion: number;
  payload: Record<string, unknown>;
  occurredAt: Date;
  attempts: number;
  nextAttemptAt: Date | null;
  publishedAt: Date | null;
}
