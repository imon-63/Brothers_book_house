import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Managers, Staff } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import { CatalogEditors } from '../../shared/catalog-roles';
import { MediaService, type UploadedImage } from '../application/media.service';
import { MAX_UPLOAD_BYTES, MediaQueryDto, UploadMediaDto } from '../dto/media.dto';

/** multer: memory storage, hard size cap, single file. */
export const imageUpload = () => FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 5 } });

@ApiTags('Admin · Media · ছবি')
@ApiBearerAuth()
@Controller({ path: 'admin/media', version: '1' })
export class MediaAdminController {
  constructor(private readonly media: MediaService) {}

  @Post()
  @CatalogEditors()
  @UseInterceptors(imageUpload())
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadMediaDto })
  @ApiOperation({ summary: 'Upload an image (JPEG/PNG/WebP/GIF, ≤5MB) → MediaAsset' })
  upload(@UploadedFile() file: UploadedImage | undefined, @Body() dto: UploadMediaDto, @CurrentUser() user: AuthUser) {
    return this.media.upload(file, dto.alt, user);
  }

  @Get()
  @Staff()
  @ApiOperation({ summary: 'Media library (newest first; q searches alt text)' })
  list(@Query() q: MediaQueryDto) {
    return this.media.list(q);
  }

  @Delete(':id')
  @Managers()
  @ApiOperation({ summary: 'Delete an unused media asset (409 media.in_use when attached to products)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.media.remove(id, user);
  }
}
