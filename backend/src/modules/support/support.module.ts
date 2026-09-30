import { Module } from '@nestjs/common';
import { CustomersModule } from '@/modules/customers/customers.module';
import { ChatService } from './application/chat.service';
import { InboxService } from './application/inbox.service';
import { MessageWriter } from './application/message-writer.service';
import { SupportStreamService } from './application/support-stream.service';
import { SupportAdminController } from './controllers/support.admin.controller';
import { SupportController } from './controllers/support.controller';

/** Support chat: storefront bubble (customer/guest), staff inbox, canned replies, SSE. */
@Module({
  imports: [CustomersModule],
  controllers: [SupportController, SupportAdminController],
  providers: [ChatService, InboxService, MessageWriter, SupportStreamService],
})
export class SupportModule {}
