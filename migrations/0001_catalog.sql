PRAGMA foreign_keys = ON;
CREATE TABLE creators (
 id TEXT PRIMARY KEY, handle TEXT NOT NULL UNIQUE COLLATE NOCASE, display_name TEXT NOT NULL,
 auth_email TEXT UNIQUE, recovery_hash TEXT, created INTEGER NOT NULL
);
CREATE TABLE sessions (
 digest TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES creators(id), expires INTEGER NOT NULL
);
CREATE INDEX sessions_owner ON sessions(owner);
CREATE INDEX sessions_expiry ON sessions(expires);
CREATE TABLE limits (key TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE INDEX limits_expiry ON limits(expires);
CREATE TABLE mods (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES creators(id), game_id TEXT NOT NULL, slug TEXT NOT NULL,
 draft TEXT NOT NULL CHECK(json_valid(draft)), revision INTEGER NOT NULL DEFAULT 1,
 current_release TEXT, listed INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, updated INTEGER NOT NULL, deleted INTEGER
);
CREATE UNIQUE INDEX mods_game_slug ON mods(game_id,slug) WHERE deleted IS NULL;
CREATE INDEX mods_owner ON mods(owner,updated DESC);
CREATE INDEX mods_live ON mods(listed,id) WHERE deleted IS NULL;
CREATE TABLE assets (
 id TEXT PRIMARY KEY, mod_id TEXT NOT NULL REFERENCES mods(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('package','image')), name TEXT NOT NULL, mime TEXT NOT NULL,
 bytes INTEGER NOT NULL CHECK(bytes>0), parts INTEGER NOT NULL, sha TEXT, created INTEGER NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','ready','garbage'))
);
CREATE INDEX assets_mod ON assets(mod_id);
CREATE INDEX assets_pending ON assets(state,created);
CREATE TABLE parts (
 asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE, n INTEGER NOT NULL, sha TEXT NOT NULL,
 bytes INTEGER NOT NULL, ready INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(asset_id,n)
);
CREATE TABLE releases (
 id TEXT PRIMARY KEY, mod_id TEXT NOT NULL REFERENCES mods(id) ON DELETE CASCADE,
 version TEXT NOT NULL, meta TEXT NOT NULL CHECK(json_valid(meta)), author TEXT NOT NULL,
 package_id TEXT NOT NULL REFERENCES assets(id), published INTEGER NOT NULL, UNIQUE(mod_id,version)
);
CREATE INDEX releases_pkg ON releases(package_id);
CREATE INDEX releases_date ON releases(published DESC);
CREATE TABLE gallery (
 release_id TEXT NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
 asset_id TEXT NOT NULL REFERENCES assets(id), position INTEGER NOT NULL,
 PRIMARY KEY(release_id,position), UNIQUE(release_id,asset_id)
);
CREATE INDEX gallery_asset ON gallery(asset_id);
