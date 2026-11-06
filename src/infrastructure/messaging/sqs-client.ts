import { createHash } from "node:crypto";
import { Injectable, OnApplicationShutdown } from "@nestjs/common";
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  SendMessageCommand,
  GetQueueUrlCommand,
  ChangeMessageVisibilityCommand,
} from "@aws-sdk/client-sqs";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class SqsClient implements OnApplicationShutdown {
  private readonly client: SQSClient;
  private readonly urls = new Map<string, string>();

  constructor(private readonly config: ConfigService) {
    this.client = new SQSClient({
      region: config.get("SQS_REGION") ?? "us-east-1",
      endpoint: config.get("SQS_ENDPOINT") ?? "http://localhost:4566",
      credentials: {
        accessKeyId: config.get("SQS_ACCESS_KEY_ID") ?? "test",
        secretAccessKey: config.get("SQS_SECRET_ACCESS_KEY") ?? "test",
      },
    });
  }

  async receiveMessages(
    maxMessages: number = 10,
    waitTimeSeconds: number = 20,
  ) {
    const command = new ReceiveMessageCommand({
      QueueUrl: await this.getQueueUrl(),
      MaxNumberOfMessages: maxMessages,
      WaitTimeSeconds: waitTimeSeconds,
      VisibilityTimeout: this.config.get("SQS_VISIBILITY_TIMEOUT") ?? 60,
      AttributeNames: ["All"],
      MessageAttributeNames: ["All"],
    });
    return this.client.send(command);
  }

  async changeVisibility(
    receiptHandle: string,
    seconds: number,
  ): Promise<void> {
    await this.client.send(
      new ChangeMessageVisibilityCommand({
        QueueUrl: await this.getQueueUrl(),
        ReceiptHandle: receiptHandle,
        VisibilityTimeout: seconds,
      }),
    );
  }

  async deleteMessage(receiptHandle: string): Promise<void> {
    const command = new DeleteMessageCommand({
      QueueUrl: await this.getQueueUrl(),
      ReceiptHandle: receiptHandle,
    });
    await this.client.send(command);
  }

  async sendToDlq(
    message: Record<string, unknown>,
    originalReceiptHandle: string,
  ): Promise<void> {
    const command = new SendMessageCommand({
      QueueUrl: await this.getQueueUrl(
        this.config.get("SQS_DLQ_NAME") ?? "wager-transactions-dlq.fifo",
      ),
      MessageBody: JSON.stringify(message),
      MessageGroupId: "dlq",
      MessageDeduplicationId: createHash("sha256")
        .update(String(message.messageId ?? crypto.randomUUID()))
        .digest("hex"),
    });
    await this.client.send(command);
  }

  async getQueueUrl(
    name: string = this.config.get("SQS_QUEUE_NAME") ??
      "wager-transactions.fifo",
  ): Promise<string> {
    const cached = this.urls.get(name);
    if (cached) return cached;
    const result = await this.client.send(
      new GetQueueUrlCommand({ QueueName: name }),
    );
    if (!result.QueueUrl) throw new Error(`Queue not found: ${name}`);
    this.urls.set(name, result.QueueUrl);
    return result.QueueUrl;
  }

  async publish(event: {
    eventType: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    const payload = event.payload;
    const data = payload.data as Record<string, unknown> | undefined;
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: await this.getQueueUrl(
          this.config.get("SQS_EVENTS_QUEUE_NAME") ?? "wager-events.fifo",
        ),
        MessageBody: JSON.stringify(payload),
        MessageGroupId: String(data?.walletId ?? payload.aggregateId),
        MessageDeduplicationId: String(payload.eventId),
      }),
    );
  }

  async publishBatch(
    events: Array<{ eventType: string; payload: Record<string, unknown> }>,
  ): Promise<void> {
    for (const event of events) await this.publish(event);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.client.destroy();
  }

  getClient(): SQSClient {
    return this.client;
  }
}
