export interface MessageHandler {
  handle(message: {
    messageId: string;
    payload: Record<string, unknown>;
  }): Promise<void>;
}

export interface MessageConsumer {
  start(handler: MessageHandler): Promise<void>;
  stop(): Promise<void>;
}
