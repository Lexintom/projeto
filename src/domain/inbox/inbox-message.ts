import { Entity } from "../shared/entity";
import type {
  ReceiveInboxProps,
  InboxMessageState,
} from "./inbox-message.props";

export class InboxMessage extends Entity<InboxMessageState> {
  private constructor(state: InboxMessageState) {
    super(state);
  }

  public static receive(props: ReceiveInboxProps): InboxMessage {
    const state: InboxMessageState = {
      id: crypto.randomUUID(),
      messageId: props.messageId,
      consumerName: props.consumerName,
      payloadHash: props.payloadHash,
      receivedAt: props.receivedAt,
      processedAt: null,
    };
    return new InboxMessage(state);
  }

  public static rehydrate(state: InboxMessageState): InboxMessage {
    return new InboxMessage(state);
  }

  get messageId(): string {
    return this.props.messageId;
  }

  get consumerName(): string {
    return this.props.consumerName;
  }

  get payloadHash(): string {
    return this.props.payloadHash;
  }

  get receivedAt(): Date {
    return this.props.receivedAt;
  }

  get processedAt(): Date | undefined {
    return this.props.processedAt ?? undefined;
  }

  public isProcessed(): boolean {
    return this.props.processedAt !== null;
  }

  public markProcessed(at: Date): void {
    if (this.props.processedAt !== null) {
      return;
    }
    this.props.processedAt = at;
  }

  public toJSON(): ReceiveInboxProps & { processedAt: Date | undefined } {
    return {
      messageId: this.messageId,
      consumerName: this.consumerName,
      payloadHash: this.payloadHash,
      receivedAt: this.receivedAt,
      processedAt: this.processedAt,
    };
  }
}
