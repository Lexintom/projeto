import { Injectable } from "@nestjs/common";
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from "@nestjs/terminus";
import { ConfigService } from "@nestjs/config";
import { SqsClient } from "../../messaging/sqs-client";

@Injectable()
export class SqsHealthIndicator extends HealthIndicator {
  constructor(
    private readonly config: ConfigService,
    private readonly sqsClient: SqsClient,
  ) {
    super();
  }

  async isHealthable(key: string): Promise<HealthIndicatorResult> {
    const timeout = this.config.get("HEALTH_SQS_TIMEOUT_MS") ?? 5000;

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // Try to get queue attributes as health check
      const promise = this.sqsClient.getClient().send(
        new (await import("@aws-sdk/client-sqs")).GetQueueAttributesCommand({
          QueueUrl: await this.sqsClient.getQueueUrl(),
          AttributeNames: ["ApproximateNumberOfMessages"],
        }),
      );
      await Promise.race([
        promise,
        new Promise(
          (_, reject) =>
            (timer = setTimeout(() => reject(new Error("Timeout")), timeout)),
        ),
      ]);

      return this.getStatus(key, true);
    } catch (error) {
      throw new HealthCheckError(
        "SQS check failed",
        this.getStatus(key, false, { error: String(error) }),
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
