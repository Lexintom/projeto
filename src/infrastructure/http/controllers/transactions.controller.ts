import type { FastifyReply } from "fastify";
import { WagerTransaction } from "../../../domain/transaction/wager-transaction";
import { computePayloadHash } from "../../../application/payload-hash";
import {
  Controller,
  ParseUUIDPipe,
  Post,
  Get,
  Param,
  Body,
  Headers,
  UseGuards,
  UsePipes,
  ValidationPipe,
  HttpCode,
  HttpStatus,
  Res,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
} from "@nestjs/swagger";
import { SubmitTransactionDto } from "../dtos";
import { SubmitWagerTransactionUseCase } from "../../../application/use-cases/submit-wager-transaction.use-case";
import { GetTransactionUseCase } from "../../../application/use-cases/get-transaction.use-case";
import { AuthGuard } from "../guards/auth.guard";
import { IdempotencyKeyPipe } from "../pipes/idempotency-key.pipe";
import { Money } from "../../../domain/money/money";
import { WagerTransactionKind } from "../../../domain/transaction/wager-transaction.enums";

@ApiTags("wagering")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("wagering/transactions")
export class TransactionsController {
  constructor(
    private readonly submitUseCase: SubmitWagerTransactionUseCase,
    private readonly getTransactionUseCase: GetTransactionUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Submit a wager transaction" })
  @ApiHeader({
    name: "Idempotency-Key",
    required: true,
    description: "Idempotency key for deduplication",
  })
  @ApiResponse({ status: 200, description: "Transaction processed" })
  @ApiResponse({
    status: 202,
    description: "Transaction accepted, pending reference",
  })
  @ApiResponse({
    status: 409,
    description:
      "Conflict - insufficient balance, reference issue, or idempotency conflict",
  })
  @ApiResponse({ status: 400, description: "Invalid input" })
  @ApiResponse({ status: 404, description: "Wallet not found" })
  async submit(
    @Body() dto: SubmitTransactionDto,
    @Headers("idempotency-key") idempotencyKey: string,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    idempotencyKey = new IdempotencyKeyPipe().transform(idempotencyKey);
    const money = Money.from(dto.money);

    // Compute payload hash for idempotency
    const payloadForHash = {
      providerId: dto.providerId,
      externalTransactionId: dto.externalTransactionId,
      playerId: dto.playerId,
      walletId: dto.walletId,
      roundId: dto.roundId,
      gameId: dto.gameId,
      kind: dto.kind,
      money: money.toJSON(),
      referenceExternalTransactionId: dto.referenceExternalTransactionId,
    };
    const payloadHash = computePayloadHash(payloadForHash);

    const result = await this.submitUseCase.execute({
      correlationId,
      providerId: dto.providerId,
      externalTransactionId: dto.externalTransactionId,
      idempotencyKey,
      payloadHash,
      walletId: dto.walletId,
      playerId: dto.playerId,
      roundId: dto.roundId,
      gameId: dto.gameId,
      kind: dto.kind,
      money,
      referenceExternalTransactionId: dto.referenceExternalTransactionId,
    });

    reply.code(result.statusCode);
    return {
      transactionId: result.transaction.id,
      status: result.transaction.status,
      balance: result.balance.toJSON(),
      idempotentReplay: result.idempotentReplay,
      failureCode: result.transaction.failureCode,
    };
  }

  @Get(":transactionId")
  @ApiOperation({ summary: "Get transaction by internal ID" })
  @ApiResponse({ status: 200, description: "Transaction found" })
  @ApiResponse({ status: 404, description: "Transaction not found" })
  async getById(
    @Param("transactionId", new ParseUUIDPipe()) transactionId: string,
  ) {
    const result = await this.getTransactionUseCase.execute({ transactionId });
    return this.mapTransaction(result.transaction);
  }

  @Get("provider/:providerId/:externalTransactionId")
  @ApiOperation({ summary: "Get transaction by provider and external ID" })
  @ApiResponse({ status: 200, description: "Transaction found" })
  @ApiResponse({ status: 404, description: "Transaction not found" })
  async getByProvider(
    @Param("providerId") providerId: string,
    @Param("externalTransactionId") externalTransactionId: string,
  ) {
    const result = await this.getTransactionUseCase.execute({
      providerId,
      externalTransactionId,
    });
    return this.mapTransaction(result.transaction);
  }

  private mapTransaction(tx: WagerTransaction) {
    return {
      id: tx.id,
      providerId: tx.providerId,
      externalTransactionId: tx.externalTransactionId,
      walletId: tx.walletId,
      playerId: tx.playerId,
      roundId: tx.roundId,
      gameId: tx.gameId,
      kind: tx.kind,
      money: tx.money.toJSON(),
      referenceExternalTransactionId: tx.referenceExternalTransactionId,
      status: tx.status,
      failureCode: tx.failureCode,
      createdAt: tx.createdAt,
      processedAt: tx.processedAt,
    };
  }
}

@Controller("providers")
@UseGuards(AuthGuard)
export class ProviderTransactionsController {
  constructor(private readonly query: GetTransactionUseCase) {}

  @Get(":providerId/wagering/transactions/:externalTransactionId")
  async get(
    @Param("providerId") providerId: string,
    @Param("externalTransactionId") externalTransactionId: string,
  ) {
    const { transaction } = await this.query.execute({
      providerId,
      externalTransactionId,
    });
    const tx = transaction.toJSON();
    return { ...tx, money: transaction.money.toJSON() };
  }
}
