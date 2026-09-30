import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthCheck, HealthCheckService, MemoryHealthIndicator, PrismaHealthIndicator } from '@nestjs/terminus';
import { Public } from '@/common/decorators/auth.decorators';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';

/**
 * /health/live  — process is up (k8s/compose liveness; never touches the DB)
 * /health/ready — DB reachable and heap sane (readiness; gate traffic on this)
 */
@ApiTags('Health')
@Public()
@SkipThrottle()
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: PrismaHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  @Get('live')
  live() {
    return { status: 'ok', uptime: Math.round(process.uptime()) };
  }

  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([
      () => this.db.pingCheck('database', this.prisma, { timeout: 1500 }),
      () => this.memory.checkHeap('heap', 768 * 1024 * 1024),
    ]);
  }
}
