import { Injectable } from "@nestjs/common";
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from "@nestjs/terminus";
import { InjectRepository } from "@mikro-orm/nestjs";
import { EntityRepository } from "@mikro-orm/core";
import { ConfigService } from "@nestjs/config";
import { WalletEntity } from "../../database/repositories/wallet.entity";

@Injectable()
export class DatabaseHealthIndicator extends HealthIndicator {
  constructor(
    @InjectRepository(WalletEntity)
    private readonly repo: EntityRepository<WalletEntity>,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async isHealthable(key: string): Promise<HealthIndicatorResult> {
    const timeout = this.config.get("HEALTH_DB_TIMEOUT_MS") ?? 5000;

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const promise = this.repo
        .getEntityManager()
        .getConnection()
        .execute("SELECT 1");
      const result = await Promise.race([
        promise,
        new Promise(
          (_, reject) =>
            (timer = setTimeout(() => reject(new Error("Timeout")), timeout)),
        ),
      ]);

      return this.getStatus(key, true);
    } catch (error) {
      throw new HealthCheckError(
        "Database check failed",
        this.getStatus(key, false, { error: String(error) }),
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
