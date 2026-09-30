import { Global, Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';

/**
 * Inventory ledger. Global because orders, purchasing and returns all move
 * stock; HTTP endpoints for stock screens live in the catalog module.
 */
@Global()
@Module({
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
