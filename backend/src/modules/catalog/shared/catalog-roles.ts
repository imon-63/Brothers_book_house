import { Roles } from '@/common/decorators/auth.decorators';

/**
 * Catalog access policy (OWNER always passes):
 *  - reads of admin screens: any staff (@Staff)
 *  - editing the catalogue (prices, copy, deals, bundles, media): admins & managers
 *  - stock counts / restock: admins, managers & warehouse
 *  - destructive ops (delete, section visibility): @Managers
 */
export const CatalogEditors = () => Roles('ADMIN', 'MANAGER');
export const StockKeepers = () => Roles('ADMIN', 'MANAGER', 'WAREHOUSE');
