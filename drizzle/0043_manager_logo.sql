-- La gérante change elle-même le logo de son site : le rôle tenant peut modifier
-- l'apparence (brand) de sa propre ligne (règle tenant_isolation), aucune autre colonne.
GRANT UPDATE (brand, updated_at) ON tenants TO app_tenant;
