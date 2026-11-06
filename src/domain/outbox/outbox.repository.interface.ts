import { OutboxMessage } from "./outbox-message";
import type { OutboxMessageState } from "./outbox-message.props";

export interface OutboxRepository {
  findPending(limit: number, now: Date): Promise<OutboxMessage[]>;
  findById(id: string): Promise<OutboxMessage | null>;
  save(message: OutboxMessage): Promise<void>;
  saveAll(messages: OutboxMessage[]): Promise<void>;
  markPublished(id: string, publishedAt: Date): Promise<void>;
}
