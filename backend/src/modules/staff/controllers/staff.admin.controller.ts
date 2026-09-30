import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { UserRole } from '@prisma/client';
import { IsBoolean, IsEmail, IsIn, IsObject, IsString, Length } from 'class-validator';
import { CurrentUser, Roles, Staff } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import { StaffService } from '../application/staff.service';

const ROLES: UserRole[] = ['OWNER', 'ADMIN', 'MANAGER', 'SUPPORT', 'ACCOUNTANT', 'WAREHOUSE'];

class CreateStaffDto {
  @IsString() @Length(2, 120) name: string;
  @IsEmail() email: string;
  @IsIn(ROLES) role: UserRole;
}
class RoleDto {
  @IsIn(ROLES) role: UserRole;
}
class EnabledDto {
  @IsBoolean() enabled: boolean;
}
class PrefsDto {
  @IsObject() preferences: Record<string, unknown>;
}

@ApiTags('Admin · Staff')
@ApiBearerAuth()
@Controller({ path: 'admin', version: '1' })
export class StaffAdminController {
  constructor(private readonly staff: StaffService) {}

  @Roles('ADMIN') @Get('staff')
  list() {
    return this.staff.list();
  }

  @Roles('ADMIN') @Post('staff')
  create(@Body() dto: CreateStaffDto, @CurrentUser() actor: AuthUser) {
    return this.staff.create(dto, actor);
  }

  @Roles('ADMIN') @Patch('staff/:id/role')
  role(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RoleDto, @CurrentUser() actor: AuthUser) {
    return this.staff.changeRole(id, dto.role, actor);
  }

  @Roles('ADMIN') @Patch('staff/:id/enabled')
  enabled(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EnabledDto, @CurrentUser() actor: AuthUser) {
    return this.staff.setEnabled(id, dto.enabled, actor);
  }

  @Roles('ADMIN') @Post('staff/:id/reset-password') @HttpCode(200)
  reset(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser) {
    return this.staff.resetPassword(id, actor);
  }

  @Staff() @Get('me/preferences')
  prefs(@CurrentUser() user: AuthUser) {
    return this.staff.preferences(user.id);
  }

  @Staff() @Patch('me/preferences')
  updatePrefs(@CurrentUser() user: AuthUser, @Body() dto: PrefsDto) {
    return this.staff.updatePreferences(user.id, dto.preferences);
  }
}
