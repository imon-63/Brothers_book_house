import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit/audit.service';
import { DocumentCounterService } from './counters/document-counter.service';
import { OutboxService } from './outbox/outbox.service';

/** Cross-cutting domain services every feature module may use. */
@Global()
@Module({
  providers: [AuditService, DocumentCounterService, OutboxService],
  exports: [AuditService, DocumentCounterService, OutboxService],
})
export class PlatformModule {}
