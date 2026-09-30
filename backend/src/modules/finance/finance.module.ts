import { Module } from '@nestjs/common';
import { CashAccountsService } from './cashbook/application/cash-accounts.service';
import { CashLedgerService } from './cashbook/application/cash-ledger.service';
import { CashbookService } from './cashbook/application/cashbook.service';
import { CashAccountsAdminController, CashbookAdminController } from './cashbook/controllers/cashbook.admin.controller';
import { DocumentIssuerService } from './documents/application/document-issuer.service';
import { DocumentsService } from './documents/application/documents.service';
import { DocumentsAdminController, MyDocumentsController } from './documents/controllers/documents.controller';
import { OrderBooksListener } from './documents/listeners/order-books.listener';
import { PurchasesService } from './purchasing/application/purchases.service';
import { SuppliersService } from './purchasing/application/suppliers.service';
import { PurchasesAdminController, SuppliersAdminController } from './purchasing/controllers/purchasing.admin.controller';
import { FinanceReportsService } from './reports/application/finance-reports.service';
import { FinanceReportsAdminController } from './reports/controllers/finance-reports.admin.controller';
import { FinanceSettings } from './shared/application/finance-settings.service';

/**
 * হিসাব — cash accounts & cashbook, purchasing, financial documents
 * (invoice / receipt / credit note) and P&L reports.
 *
 * Exports CashLedgerService so other modules (payments → refunds, gateway
 * captures) can post cash entries inside their own transaction.
 */
@Module({
  controllers: [
    CashAccountsAdminController,
    CashbookAdminController,
    SuppliersAdminController,
    PurchasesAdminController,
    DocumentsAdminController,
    MyDocumentsController,
    FinanceReportsAdminController,
  ],
  providers: [
    FinanceSettings,
    CashLedgerService,
    CashAccountsService,
    CashbookService,
    SuppliersService,
    PurchasesService,
    DocumentIssuerService,
    DocumentsService,
    OrderBooksListener,
    FinanceReportsService,
  ],
  exports: [CashLedgerService, FinanceSettings],
})
export class FinanceModule {}
