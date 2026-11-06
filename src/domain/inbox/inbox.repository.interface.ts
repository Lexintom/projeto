import { InboxMessage } from "./inbox-message";
import type { InboxMessageState } from "./inbox-message.props";

export interface InboxRepository {
  findByMessageIdAndConsumer(
    messageId: string,
    consumerName: string,
  ): Promise<InboxMessage | null>;
  save(message: InboxMessage): Promise<void>;
  exists(messageId: string, consumerName: string): Promise<boolean>;
}
