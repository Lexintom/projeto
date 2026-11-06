import { Injectable, LoggerService, Scope } from "@nestjs/common";
import pino, { Logger, LoggerOptions } from "pino";
import { ConfigService } from "@nestjs/config";

@Injectable({ scope: Scope.TRANSIENT })
export class AppLogger implements LoggerService {
  private logger: Logger;
  private context?: string;

  constructor(private readonly config: ConfigService) {
    const options: LoggerOptions = {
      level: config.get("LOG_LEVEL") ?? "info",
      formatters: {
        bindings: (bindings) => ({
          ...bindings,
          service: config.get("APP_NAME") ?? "jungle-wagering-processor",
        }),
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    };

    if (config.get("LOG_PRETTY")) {
      options.transport = {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss Z",
          ignore: "pid,hostname",
        },
      };
    }

    this.logger = pino(options);
  }

  setContext(context: string): void {
    this.context = context;
  }

  log(message: string, context?: string): void {
    this.logger.info({ context: context ?? this.context }, message);
  }

  error(message: string, trace?: string, context?: string): void {
    this.logger.error({ context: context ?? this.context, trace }, message);
  }

  warn(message: string, context?: string): void {
    this.logger.warn({ context: context ?? this.context }, message);
  }

  debug(message: string, context?: string): void {
    this.logger.debug({ context: context ?? this.context }, message);
  }

  verbose(message: string, context?: string): void {
    this.logger.trace({ context: context ?? this.context }, message);
  }

  child(bindings: Record<string, unknown>): AppLogger {
    const child = new AppLogger(this.config);
    child.logger = this.logger.child({ ...bindings, context: this.context });
    return child;
  }

  withCorrelationId(correlationId: string): AppLogger {
    return this.child({ correlationId });
  }

  withWalletId(walletId: string): AppLogger {
    return this.child({ walletId });
  }

  withTransactionId(transactionId: string): AppLogger {
    return this.child({ transactionId });
  }

  withProviderId(providerId: string): AppLogger {
    return this.child({ providerId });
  }

  withMessageId(messageId: string): AppLogger {
    return this.child({ messageId });
  }
}
