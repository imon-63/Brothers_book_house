import { Controller, Get, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { Staff } from '@/common/decorators/auth.decorators';
import { DashboardService } from './application/dashboard.service';
import { PERIODS, type Period } from './domain/period';

class DashboardQuery {
  @IsOptional() @IsIn(PERIODS) period: Period = '7d';
}

@ApiTags('Admin · Reports')
@ApiBearerAuth()
@Staff()
@Controller({ path: 'admin/reports', version: '1' })
export class ReportsAdminController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('dashboard')
  @ApiQuery({ name: 'period', enum: PERIODS, required: false })
  get(@Query() q: DashboardQuery) {
    return this.dashboard.dashboard(q.period);
  }
}

/** ড্যাশবোর্ড — KPIs with deltas, series, pipeline, mixes, top lists, attention. */
@Module({
  controllers: [ReportsAdminController],
  providers: [DashboardService],
})
export class ReportsModule {}
