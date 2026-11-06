import { z } from "zod";

const booleanEnv = (fallback: boolean) =>
  z.preprocess(
    (value) =>
      value === undefined
        ? fallback
        : value === "true"
          ? true
          : value === "false"
            ? false
            : value,
    z.boolean(),
  );

export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(3000),
  APP_NAME: z.string().default("jungle-wagering-processor"),

  DATABASE_HOST: z.string().default("localhost"),
  DATABASE_PORT: z.coerce.number().default(5432),
  DATABASE_USER: z.string().default("jungle"),
  DATABASE_PASSWORD: z.string().default("jungle_secret"),
  DATABASE_NAME: z.string().default("jungle_gaming"),
  DATABASE_SCHEMA: z.string().default("jungle"),
  DATABASE_SSL: booleanEnv(false),
  DATABASE_POOL_SIZE: z.coerce.number().default(20),

  SQS_ENDPOINT: z.string().url().default("http://localhost:4566"),
  SQS_REGION: z.string().default("us-east-1"),
  SQS_ACCESS_KEY_ID: z.string().default("test"),
  SQS_SECRET_ACCESS_KEY: z.string().default("test"),
  SQS_QUEUE_NAME: z.string().default("wager-transactions.fifo"),
  SQS_EVENTS_QUEUE_NAME: z.string().default("wager-events.fifo"),
  SQS_DLQ_NAME: z.string().default("wager-transactions-dlq.fifo"),
  SQS_VISIBILITY_TIMEOUT: z.coerce.number().default(60),
  SQS_MAX_RECEIVE_COUNT: z.coerce.number().default(5),
  SQS_POLL_WAIT_TIME: z.coerce.number().default(20),
  SQS_CONSUMER_NAME: z.string().default("wager-processor"),

  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().default(1000),
  OUTBOX_BATCH_SIZE: z.coerce.number().default(100),
  OUTBOX_MAX_ATTEMPTS: z.coerce.number().default(10),
  OUTBOX_BASE_BACKOFF_MS: z.coerce.number().default(1000),
  OUTBOX_MAX_BACKOFF_MS: z.coerce.number().default(60000),

  OPTIMISTIC_LOCK_MAX_RETRIES: z.coerce.number().default(3),
  OPTIMISTIC_LOCK_BASE_BACKOFF_MS: z.coerce.number().default(50),

  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("debug"),
  LOG_PRETTY: booleanEnv(false),
  METRICS_ENABLED: booleanEnv(true),
  METRICS_PORT: z.coerce.number().default(9090),

  HEALTH_DB_TIMEOUT_MS: z.coerce.number().default(5000),
  HEALTH_SQS_TIMEOUT_MS: z.coerce.number().default(5000),

  AUTH_ENABLED: booleanEnv(false),
  AUTH_ISSUER_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().optional(),
  ),
  AUTH_AUDIENCE: z.string().optional(),
  AUTH_JWKS_URI: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().optional(),
  ),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(`Environment validation failed:\n${errors}`);
  }
  return result.data;
}
