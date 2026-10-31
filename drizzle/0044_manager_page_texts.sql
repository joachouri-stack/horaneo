-- La gérante modifie elle-même les textes de présentation de son site : le rôle
-- tenant peut changer le contenu de ses pages (règle tenant_isolation), pas le
-- référencement ni la publication.
GRANT UPDATE (content, updated_at) ON site_pages TO app_tenant;
