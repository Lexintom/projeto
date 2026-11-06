import {
  Controller,
  ParseUUIDPipe,
  Post,
  Get,
  Param,
  Body,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
} from "@nestjs/swagger";
import { CreateWalletDto, LedgerQueryDto } from "../dtos";
import { CreateWalletUseCase } from "../../../application/use-cases/create-wallet.use-case";
import { GetWalletUseCase } from "../../../application/use-cases/get-wallet.use-case";
import { GetLedgerUseCase } from "../../../application/use-cases/get-ledger.use-case";
import { ReconcileWalletUseCase } from "../../../application/use-cases/reconcile-wallet.use-case";
import { AuthGuard } from "../guards/auth.guard";
import { IdempotencyKeyPipe } from "../pipes/idempotency-key.pipe";
import { MetricsService } from "../../observability/metrics";
import { AppLogger } from "../../observability/logger";
import { Money } from "../../../domain/money/money";

@ApiTags("wallets")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("wallets")
export class WalletsController {
  constructor(
    private readonly createWalletUseCase: CreateWalletUseCase,
    private readonly getWalletUseCase: GetWalletUseCase,
    private readonly getLedgerUseCase: GetLedgerUseCase,
    private readonly reconcileWalletUseCase: ReconcileWalletUseCase,
    private readonly metrics: MetricsService,
    private readonly logger: AppLogger,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create a new wallet" })
  @ApiResponse({ status: 201, description: "Wallet created" })
  @ApiResponse({
    status: 409,
    description: "Wallet already exists for player and currency",
  })
  @ApiResponse({ status: 400, description: "Invalid input" })
  async create(@Body() dto: CreateWalletDto) {
    const initialBalance = Money.from(dto.initialBalance);
    const result = await this.createWalletUseCase.execute({
      playerId: dto.playerId,
      initialBalance,
    });

    return {
      id: result.wallet.id,
      playerId: result.wallet.playerId,
      balance: result.wallet.balance.toJSON(),
      version: result.wallet.version,
    };
  }

  @Get(":walletId")
  @ApiOperation({ summary: "Get wallet by ID" })
  @ApiResponse({ status: 200, description: "Wallet found" })
  @ApiResponse({ status: 404, description: "Wallet not found" })
  async get(@Param("walletId", new ParseUUIDPipe()) walletId: string) {
    const result = await this.getWalletUseCase.execute({ walletId });
    return {
      id: result.wallet.id,
      playerId: result.wallet.playerId,
      balance: result.wallet.balance.toJSON(),
      version: result.wallet.version,
    };
  }

  @Get(":walletId/ledger")
  @ApiOperation({ summary: "Get wallet ledger entries with cursor pagination" })
  @ApiResponse({ status: 200, description: "Ledger entries" })
  @ApiResponse({ status: 404, description: "Wallet not found" })
  async getLedger(
    @Param("walletId", new ParseUUIDPipe()) walletId: string,
    @Query() query: LedgerQueryDto,
  ) {
    const result = await this.getLedgerUseCase.execute({
      walletId,
      cursor: query.cursor,
      limit: query.limit ?? 50,
    });

    return {
      entries: result.entries.map((e) => e.toJSON()),
      nextCursor: result.nextCursor,
    };
  }

  @Post(":walletId/reconciliation")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Reconcile wallet balance with ledger" })
  @ApiResponse({ status: 200, description: "Reconciliation result" })
  @ApiResponse({ status: 404, description: "Wallet not found" })
  async reconcile(@Param("walletId", new ParseUUIDPipe()) walletId: string) {
    const result = await this.reconcileWalletUseCase.execute({ walletId });
    if (!result.consistent) {
      this.metrics.reconciliationMismatches.inc();
      this.logger.withWalletId(walletId).warn("Reconciliation mismatch");
    }
    return {
      walletId: result.walletId,
      storedBalance: result.storedBalance.toJSON(),
      calculatedBalance: result.calculatedBalance.toJSON(),
      difference: result.difference.toJSON(),
      consistent: result.consistent,
      checkedEntries: result.checkedEntries,
    };
  }
}
