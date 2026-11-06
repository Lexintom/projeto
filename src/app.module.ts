import { DatabaseUnitOfWork } from "./infrastructure/database/unit-of-work";
import { PendingReferenceWorker } from "./infrastructure/messaging/pending-reference-worker";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { TerminusModule } from "@nestjs/terminus";

import { configuration } from "./config/configuration";
import {
  mikroOrmConfig,
  entities,
} from "./infrastructure/database/mikro-orm.config";

import { WalletsController } from "./infrastructure/http/controllers/wallets.controller";
import {
  TransactionsController,
  ProviderTransactionsController,
} from "./infrastructure/http/controllers/transactions.controller";
import { HealthController } from "./infrastructure/http/controllers/health.controller";

import { CreateWalletUseCase } from "./application/use-cases/create-wallet.use-case";
import { SubmitWagerTransactionUseCase } from "./application/use-cases/submit-wager-transaction.use-case";
import { GetWalletUseCase } from "./application/use-cases/get-wallet.use-case";
import { GetLedgerUseCase } from "./application/use-cases/get-ledger.use-case";
import { GetTransactionUseCase } from "./application/use-cases/get-transaction.use-case";
import { ReconcileWalletUseCase } from "./application/use-cases/reconcile-wallet.use-case";

import { WalletRepositoryImpl } from "./infrastructure/database/repositories/wallet.repository.impl";
import { WagerTransactionRepositoryImpl } from "./infrastructure/database/repositories/wager-transaction.repository.impl";
import { LedgerRepositoryImpl } from "./infrastructure/database/repositories/ledger.repository.impl";
import { InboxRepositoryImpl } from "./infrastructure/database/repositories/inbox.repository.impl";
import { OutboxRepositoryImpl } from "./infrastructure/database/repositories/outbox.repository.impl";

import { SqsClient } from "./infrastructure/messaging/sqs-client";
import { SqsConsumer } from "./infrastructure/messaging/sqs-consumer";
import { OutboxPublisher } from "./infrastructure/messaging/outbox-publisher";

import { DatabaseHealthIndicator } from "./infrastructure/observability/health-indicators/database.health";
import { SqsHealthIndicator } from "./infrastructure/observability/health-indicators/sqs.health";
import { MetricsService } from "./infrastructure/observability/metrics";
import { AppLogger } from "./infrastructure/observability/logger";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: [".env.local", ".env"],
      validationSchema: undefined, // We use Zod in configuration.ts
    }),
    MikroOrmModule.forRootAsync({
      useFactory: () => mikroOrmConfig,
    }),
    MikroOrmModule.forFeature(entities),
    TerminusModule,
  ],
  controllers: [
    WalletsController,
    TransactionsController,
    ProviderTransactionsController,
    HealthController,
  ],
  providers: [
    // Use cases
    DatabaseUnitOfWork,
    PendingReferenceWorker,
    {
      provide: CreateWalletUseCase,
      inject: [
        "WalletRepository",
        "LedgerRepository",
        DatabaseUnitOfWork,
        "WagerTransactionRepository",
        "OutboxRepository",
      ],
      useFactory: (
        ...[wallet, ledger, unit, tx, outbox]: ConstructorParameters<
          typeof CreateWalletUseCase
        >
      ) => new CreateWalletUseCase(wallet, ledger, unit, tx, outbox),
    },
    {
      provide: SubmitWagerTransactionUseCase,
      inject: [
        "WalletRepository",
        "WagerTransactionRepository",
        "LedgerRepository",
        "InboxRepository",
        "OutboxRepository",
        DatabaseUnitOfWork,
        MetricsService,
      ],
      useFactory: (
        wallet: WalletRepositoryImpl,
        tx: WagerTransactionRepositoryImpl,
        ledger: LedgerRepositoryImpl,
        inbox: InboxRepositoryImpl,
        outbox: OutboxRepositoryImpl,
        unit: DatabaseUnitOfWork,
        metrics: MetricsService,
      ) =>
        new SubmitWagerTransactionUseCase(
          wallet,
          tx,
          ledger,
          inbox,
          outbox,
          unit,
          3,
          50,
          metrics,
        ),
    },
    {
      provide: GetWalletUseCase,
      inject: ["WalletRepository"],
      useFactory: (...args: ConstructorParameters<typeof GetWalletUseCase>) =>
        new GetWalletUseCase(...args),
    },
    {
      provide: GetLedgerUseCase,
      inject: ["LedgerRepository", "WalletRepository"],
      useFactory: (...args: ConstructorParameters<typeof GetLedgerUseCase>) =>
        new GetLedgerUseCase(...args),
    },
    {
      provide: GetTransactionUseCase,
      inject: ["WagerTransactionRepository"],
      useFactory: (
        ...args: ConstructorParameters<typeof GetTransactionUseCase>
      ) => new GetTransactionUseCase(...args),
    },
    {
      provide: ReconcileWalletUseCase,
      inject: ["WalletRepository", "LedgerRepository", DatabaseUnitOfWork],
      useFactory: (
        ...args: ConstructorParameters<typeof ReconcileWalletUseCase>
      ) => new ReconcileWalletUseCase(...args),
    },

    // Repository implementations
    {
      provide: "WalletRepository",
      useClass: WalletRepositoryImpl,
    },
    {
      provide: "WagerTransactionRepository",
      useClass: WagerTransactionRepositoryImpl,
    },
    {
      provide: "LedgerRepository",
      useClass: LedgerRepositoryImpl,
    },
    {
      provide: "InboxRepository",
      useClass: InboxRepositoryImpl,
    },
    {
      provide: "OutboxRepository",
      useClass: OutboxRepositoryImpl,
    },

    // Messaging
    SqsClient,
    SqsConsumer,
    {
      provide: OutboxPublisher,
      inject: [
        ConfigService,
        "OutboxRepository",
        SqsClient,
        DatabaseUnitOfWork,
        MetricsService,
      ],
      useFactory: (...args: ConstructorParameters<typeof OutboxPublisher>) =>
        new OutboxPublisher(...args),
    },

    // Observability
    DatabaseHealthIndicator,
    SqsHealthIndicator,
    MetricsService,
    AppLogger,
  ],
})
export class AppModule {}
