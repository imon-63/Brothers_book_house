import { Global, Module } from '@nestjs/common';
import { BusinessMetrics } from './metrics.service';

@Global()
@Module({
  providers: [BusinessMetrics],
  exports: [BusinessMetrics],
})
export class TelemetryModule {}
