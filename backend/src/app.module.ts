import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { JwtModule } from '@nestjs/jwt';
import { RateLimitGuard } from '@/common/guards/rate-limit.guard';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { JwtAuthGuard, RolesGuard } from '@/common/guards/auth.guards';
import { AppConfigModule } from '@/config/config.module';
import { LoggerModule } from '@/infrastructure/logger/logger.module';
import { PrismaModule } from '@/infrastructure/prisma/prisma.module';
import { TelemetryModule } from '@/infrastructure/telemetry/telemetry.module';
import { PlatformModule } from '@/platform/platform.module';
import { ActivityModule } from '@/modules/activity/activity.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { CatalogModule } from '@/modules/catalog/catalog.module';
import { ContentModule } from '@/modules/content/content.module';
import { CustomersModule } from '@/modules/customers/customers.module';
import { FinanceModule } from '@/modules/finance/finance.module';
import { HealthModule } from '@/modules/health/health.module';
import { InventoryModule } from '@/modules/inventory/inventory.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { OrdersModule } from '@/modules/orders/orders.module';
import { PaymentsModule } from '@/modules/payments/payments.module';
import { ReportsModule } from '@/modules/reports/reports.module';
import { ReviewsModule } from '@/modules/reviews/reviews.module';
import { StaffModule } from '@/modules/staff/staff.module';
import { SupportModule } from '@/modules/support/support.module';

@Module({
  imports: [
    // ── infrastructure ──
    AppConfigModule,
    LoggerModule,
    PrismaModule,
    TelemetryModule,
    EventEmitterModule.forRoot({ wildcard: false, maxListeners: 20, verboseMemoryLeak: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      // per minute: a signed-in account gets its own generous budget; anonymous traffic shares one per IP
      {
        name: 'default',
        ttl: 60_000,
        limit: (ctx) => (String(ctx.switchToHttp().getRequest()?.headers?.authorization ?? '').startsWith('Bearer ') ? 600 : 300),
      },
      // per second: stops a runaway client or script without bothering real people
      { name: 'burst', ttl: 1_000, limit: 25 },
    ]),
    JwtModule.register({}),
    PlatformModule,
    InventoryModule,
    // ── features ──
    HealthModule,
    AuthModule,
    StaffModule,
    CatalogModule,
    CustomersModule,
    OrdersModule,
    PaymentsModule,
    FinanceModule,
    ReviewsModule,
    SupportModule,
    ContentModule,
    NotificationsModule,
    ReportsModule,
    ActivityModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
