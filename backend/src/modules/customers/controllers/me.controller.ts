import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import { MeService } from '../application/me.service';
import { WishlistService } from '../application/wishlist.service';
import { AddressDto, AddWishlistDto, ChangePhoneDto, UpdateAddressDto, UpdateProfileDto } from '../dto/me.dto';

@ApiTags('Me · আমার অ্যাকাউন্ট')
@ApiBearerAuth()
@Roles('CUSTOMER')
@Controller({ path: 'me', version: '1' })
export class MeController {
  constructor(
    private readonly me: MeService,
    private readonly wishlist: WishlistService,
  ) {}

  @Get('profile')
  profile(@CurrentUser() user: AuthUser) {
    return this.me.profile(user);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update name / email / marketing opt-in' })
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.me.updateProfile(user, dto);
  }

  @Post('profile/phone')
  @ApiOperation({ summary: 'Change phone (requires OTP — not available yet)' })
  changePhone(@CurrentUser() user: AuthUser, @Body() dto: ChangePhoneDto) {
    return this.me.changePhone(user, dto);
  }

  @Get('addresses')
  addresses(@CurrentUser() user: AuthUser) {
    return this.me.addresses(user);
  }

  @Post('addresses')
  addAddress(@CurrentUser() user: AuthUser, @Body() dto: AddressDto) {
    return this.me.addAddress(user, dto);
  }

  @Patch('addresses/:id')
  updateAddress(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAddressDto) {
    return this.me.updateAddress(user, id, dto);
  }

  @Post('addresses/:id/default')
  @HttpCode(200)
  setDefault(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.me.setDefault(user, id);
  }

  @Delete('addresses/:id')
  @HttpCode(204)
  deleteAddress(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.me.deleteAddress(user, id);
  }

  @Get('wishlist')
  @ApiOperation({ summary: 'ভবিষ্যৎ অর্ডার — watchlist with live stock state' })
  wishlistList(@CurrentUser() user: AuthUser) {
    return this.wishlist.list(user);
  }

  @Post('wishlist')
  wishlistAdd(@CurrentUser() user: AuthUser, @Body() dto: AddWishlistDto) {
    return this.wishlist.add(user, dto);
  }

  @Delete('wishlist/:id')
  @HttpCode(204)
  wishlistRemove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.wishlist.remove(user, id);
  }
}
