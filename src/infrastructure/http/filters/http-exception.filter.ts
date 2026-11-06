import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { FastifyRequest, FastifyReply } from "fastify";

interface ErrorResponse {
  error: string;
  message: string | string[];
  statusCode: number;
  timestamp: string;
  path: string;
  correlationId?: string;
  failureCode?: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const correlationId =
      (request.headers["x-correlation-id"] as string) ?? crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const path = request.url;

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = "Internal Server Error";
    let message = "An unexpected error occurred";
    let failureCode: string | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();
      error = exception.name;
      message =
        typeof res === "string"
          ? res
          : (((res as Record<string, unknown>).message as string) ??
            exception.message);
    } else if (exception instanceof Error) {
      // Domain errors
      if ("code" in exception) {
        const code = (exception as { code: string }).code;
        switch (code) {
          case "INSUFFICIENT_BALANCE":
          case "INSUFFICIENT_FUNDS":
            statusCode = HttpStatus.CONFLICT;
            error = "Business Rule Violation";
            message = exception.message;
            failureCode = "INSUFFICIENT_FUNDS";
            break;
          case "CURRENCY_MISMATCH":
            statusCode = HttpStatus.CONFLICT;
            error = "Business Rule Violation";
            message = exception.message;
            failureCode = "CURRENCY_MISMATCH";
            break;
          case "WALLET_NOT_FOUND":
            statusCode = HttpStatus.NOT_FOUND;
            error = "Not Found";
            message = exception.message;
            failureCode = "WALLET_NOT_FOUND";
            break;
          case "REFERENCE_NOT_FOUND":
            statusCode = HttpStatus.ACCEPTED;
            error = "Pending Reference";
            message = exception.message;
            failureCode = "REFERENCE_NOT_FOUND";
            break;
          case "REFERENCE_ALREADY_REVERSED":
            statusCode = HttpStatus.CONFLICT;
            error = "Business Rule Violation";
            message = exception.message;
            failureCode = "REFERENCE_ALREADY_REVERSED";
            break;
          case "REFERENCE_MISMATCH":
            statusCode = HttpStatus.CONFLICT;
            error = "Business Rule Violation";
            message = exception.message;
            failureCode = "REFERENCE_MISMATCH";
            break;
          case "INVALID_KIND_FOR_REFERENCE":
            statusCode = HttpStatus.CONFLICT;
            error = "Business Rule Violation";
            message = exception.message;
            failureCode = "INVALID_KIND_FOR_REFERENCE";
            break;
          case "INVALID_AMOUNT_BUSINESS":
            statusCode = HttpStatus.CONFLICT;
            error = "Business Rule Violation";
            message = exception.message;
            failureCode = "INVALID_AMOUNT";
            break;
          case "IDEMPOTENCY_CONFLICT":
            statusCode = HttpStatus.CONFLICT;
            error = "Idempotency Conflict";
            message = exception.message;
            failureCode = "IDEMPOTENCY_CONFLICT";
            break;
          case "INVALID_TRANSACTION_STATE":
            statusCode = HttpStatus.CONFLICT;
            error = "Invalid State";
            message = exception.message;
            failureCode = "INTERNAL_ERROR";
            break;
          case "UNBALANCED_LEDGER_ENTRY":
            statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
            error = "Internal Error";
            message = "Ledger entry validation failed";
            failureCode = "INTERNAL_ERROR";
            break;
          case "INVALID_AMOUNT_FORMAT":
          case "INVALID_AMOUNT":
          case "NEGATIVE_AMOUNT_NOT_ALLOWED":
          case "TOO_MANY_DECIMALS":
          case "AMOUNT_REQUIRED":
          case "CURRENCY_REQUIRED":
          case "INVALID_CURRENCY":
            statusCode = HttpStatus.BAD_REQUEST;
            error = "Validation Error";
            message = exception.message;
            break;
        }
      }
    }

    const dbCode = (exception as { code?: string })?.code;
    if (
      [
        "40001",
        "40P01",
        "55P03",
        "08006",
        "ECONNREFUSED",
        "ETIMEDOUT",
        "57P01",
      ].includes(dbCode ?? "") ||
      (exception instanceof Error && exception.name === "OptimisticConflict")
    ) {
      statusCode = 503;
      error = "Service Unavailable";
      message = "Temporary failure; retry with the same idempotency key";
    } else if (dbCode === "23505") {
      statusCode = 409;
      error = "Conflict";
      message = "Duplicate identity";
    }
    if (
      statusCode === 409 &&
      failureCode !== "IDEMPOTENCY_CONFLICT" &&
      failureCode !== "INTERNAL_ERROR"
    )
      statusCode = 422;

    const errorResponse: ErrorResponse = {
      error,
      message,
      statusCode,
      timestamp,
      path,
      correlationId,
      ...(failureCode && { failureCode }),
    };

    this.logger.warn(`${request.method} ${path} - ${statusCode} - ${message}`, {
      correlationId,
      error,
      failureCode,
    });

    response.code(statusCode).send(errorResponse);
  }
}
