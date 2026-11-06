import { Controller, Get } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import {
  HealthCheck,
  HealthCheckService,
  HealthCheckResult,
} from "@nestjs/terminus";
import { DatabaseHealthIndicator } from "../../observability/health-indicators/database.health";
import { SqsHealthIndicator } from "../../observability/health-indicators/sqs.health";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly dbHealth: DatabaseHealthIndicator,
    private readonly sqsHealth: SqsHealthIndicator,
  ) {}

  @Get("live")
  @ApiOperation({ summary: "Liveness probe - process is alive" })
  @ApiResponse({ status: 200, description: "Process is alive" })
  @HealthCheck()
  async liveness(): Promise<HealthCheckResult> {
    return this.health.check([]);
  }

  @Get("ready")
  @ApiOperation({ summary: "Readiness probe - dependencies are reachable" })
  @ApiResponse({ status: 200, description: "Service is ready" })
  @ApiResponse({ status: 503, description: "Service not ready" })
  @HealthCheck()
  async readiness(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.dbHealth.isHealthable("database"),
      () => this.sqsHealth.isHealthable("sqs"),
    ]);
  }
}
