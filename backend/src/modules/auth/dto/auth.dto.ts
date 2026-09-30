import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@cholo.shop', description: 'ইমেইল অথবা মোবাইল নম্বর' })
  @IsString()
  @MaxLength(160)
  identifier: string;

  @ApiProperty({ example: 'admin123' })
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password: string;
}

export class RegisterDto {
  @ApiProperty({ example: 'রাফি আহমেদ' })
  @IsString()
  @Length(2, 120)
  name: string;

  @ApiProperty({ example: '01711111111' })
  @IsString()
  @MaxLength(20)
  phone: string;

  @ApiPropertyOptional({ example: 'rafi@gmail.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}

export class RefreshDto {
  @ApiPropertyOptional({ description: 'Omit when the httpOnly cookie is used (browser)' })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ description: 'ইমেইল অথবা মোবাইল' })
  @IsString()
  @MaxLength(160)
  identifier: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  @MaxLength(160)
  identifier: string;

  @ApiProperty({ example: '482913' })
  @IsString()
  @Length(4, 8)
  code: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  currentPassword: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword: string;
}

export class TokenResponse {
  @ApiProperty() accessToken: string;
  @ApiProperty() refreshToken: string;
  @ApiProperty({ example: 900 }) expiresIn: number;
  @ApiProperty({ enum: ['Bearer'] }) @IsIn(['Bearer']) tokenType: 'Bearer';
}
