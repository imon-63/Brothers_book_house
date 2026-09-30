import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '@/config/app-config.service';
import { ContentModule } from '@/modules/content/content.module';
import { OutboxAdminService } from './application/outbox-admin.service';
import { OutboxWorker } from './application/outbox-worker.service';
import { StaffNotificationsService } from './application/staff-notifications.service';
import { NotificationsAdminController } from './controllers/notifications.admin.controller';
import { CustomerSmsListener } from './listeners/customer-sms.listener';
import { StaffAlertsListener } from './listeners/staff-alerts.listener';
import { BulkSmsBdProvider, EMAIL_PROVIDER, HttpEmailProvider, LogEmailProvider, LogSmsProvider, SMS_PROVIDER, type EmailProvider, type SmsProvider } from './providers/providers';

/**
 * Provider env (read via ConfigService; not yet in the zod env schema):
 *   SMS_API_URL, SMS_API_KEY, SMS_SENDER_ID      → BulkSMSBD-style gateway
 *   EMAIL_API_URL, EMAIL_API_KEY, EMAIL_FROM     → HTTP email API
 *   OUTBOX_WORKER_ENABLED=false                  → run API without the worker
 * Missing config falls back to log-only providers.
 */
@Module({
  imports: [ContentModule],
  controllers: [NotificationsAdminController],
  providers: [
    {
      provide: SMS_PROVIDER,
      inject: [ConfigService, AppConfig],
      useFactory: (cfg: ConfigService, app: AppConfig): SmsProvider => {
        const url = cfg.get<string>('SMS_API_URL');
        const apiKey = cfg.get<string>('SMS_API_KEY');
        const senderId = cfg.get<string>('SMS_SENDER_ID');
        if (url && apiKey && senderId) return new BulkSmsBdProvider({ url, apiKey, senderId });
        new Logger('Notifications').warn('SMS provider not configured — messages are logged, not sent');
        return new LogSmsProvider(!app.isProduction);
      },
    },
    {
      provide: EMAIL_PROVIDER,
      inject: [ConfigService],
      useFactory: (cfg: ConfigService): EmailProvider => {
        const url = cfg.get<string>('EMAIL_API_URL');
        const apiKey = cfg.get<string>('EMAIL_API_KEY');
        const from = cfg.get<string>('EMAIL_FROM');
        if (url && apiKey && from) return new HttpEmailProvider({ url, apiKey, from });
        new Logger('Notifications').warn('Email provider not configured — messages are logged, not sent');
        return new LogEmailProvider();
      },
    },
    OutboxWorker,
    OutboxAdminService,
    StaffNotificationsService,
    CustomerSmsListener,
    StaffAlertsListener,
  ],
  exports: [StaffNotificationsService],
})
export class NotificationsModule {}
