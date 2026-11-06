export interface EventPublisher {
  publish(event: {
    eventType: string;
    payload: Record<string, unknown>;
  }): Promise<void>;
  publishBatch(
    events: Array<{ eventType: string; payload: Record<string, unknown> }>,
  ): Promise<void>;
}
