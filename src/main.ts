import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./infrastructure/http/filters/http-exception.filter";
import { AppLogger } from "./infrastructure/observability/logger";
import { MetricsService } from "./infrastructure/observability/metrics";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: false,
      rewriteUrl: (req: { url?: string }) => {
        const url = req.url ?? "/";
        return /^\/(wallets|wagering|providers|health)(\/|\?|$)/.test(url)
          ? `/api${url}`
          : url;
      },
    }),
  );

  app.setGlobalPrefix("api");
  app.enableShutdownHooks();
  app.useLogger(await app.resolve(AppLogger));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  const logger = await app.resolve(AppLogger);
  app.useGlobalFilters(new HttpExceptionFilter());

  const metricsService = app.get(MetricsService);
  const fastifyInstance = app.getHttpAdapter().getInstance();
  fastifyInstance.get(
    "/metrics",
    async (_request: unknown, reply: { type(value: string): void }) => {
      reply.type(metricsService.getContentType());
      return metricsService.getMetrics();
    },
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port, "0.0.0.0");

  logger.log(`Application running on port ${port}`);
  logger.log(`Health checks: /api/health/live, /api/health/ready`);
  logger.log(`Metrics: /metrics`);
}

bootstrap().catch((error) => {
  console.error("Failed to start application:", error);
  process.exit(1);
});
