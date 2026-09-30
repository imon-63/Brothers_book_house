import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { StaffService } from './application/staff.service';
import { StaffAdminController } from './controllers/staff.admin.controller';

/** স্টাফ — staff accounts, roles and per-user admin preferences. */
@Module({
  imports: [AuthModule],
  controllers: [StaffAdminController],
  providers: [StaffService],
})
export class StaffModule {}
