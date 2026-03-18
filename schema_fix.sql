PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;

ALTER TABLE servers RENAME TO servers_old;
ALTER TABLE server_players RENAME TO server_players_old;
ALTER TABLE server_player_count RENAME TO server_player_count_old;

CREATE TABLE servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL,
    serverName TEXT NOT NULL,
    serverDescription TEXT,
    serverIcon TEXT,
    serverVersion TEXT,
    serverIp TEXT NOT NULL,
    numericalIP TEXT NOT NULL,
    color TEXT,
    onlineMode INTEGER NOT NULL DEFAULT 0 CHECK (onlineMode IN (0, 1)),
    authenticated INTEGER NOT NULL DEFAULT 0 CHECK (authenticated IN (0, 1)),
    whitelist INTEGER NOT NULL DEFAULT 0 CHECK (whitelist IN (0, 1)),
    whitelisted INTEGER NOT NULL DEFAULT 0 CHECK (whitelisted IN (0, 1)),
    maxPlayers INTEGER NOT NULL DEFAULT 0 CHECK (maxPlayers >= 0),
    serverPort INTEGER NOT NULL DEFAULT 0 CHECK (serverPort >= 0),
    lastUpdated INTEGER NOT NULL DEFAULT 0 CHECK (lastUpdated >= 0),
    date INTEGER NOT NULL DEFAULT 0 CHECK (date >= 0),
    isActive INTEGER NOT NULL DEFAULT 1 CHECK (isActive IN (0, 1)),
    recordPlayerCount INTEGER NOT NULL DEFAULT 0 CHECK (recordPlayerCount >= 0)
);

INSERT INTO servers (
    id,
    uuid,
    serverName,
    serverDescription,
    serverIcon,
    serverVersion,
    serverIp,
    numericalIP,
    color,
    onlineMode,
    authenticated,
    whitelist,
    whitelisted,
    maxPlayers,
    serverPort,
    lastUpdated,
    date,
    isActive,
    recordPlayerCount
)
SELECT
    id,
    COALESCE(uuid, ''),
    COALESCE(serverName, ''),
    serverDescription,
    serverIcon,
    serverVersion,
    COALESCE(serverIp, ''),
    COALESCE(numericalIP, ''),
    color,
    CASE WHEN COALESCE(onlineMode, 0) <> 0 THEN 1 ELSE 0 END,
    CASE WHEN COALESCE(authenticated, 0) <> 0 THEN 1 ELSE 0 END,
    CASE WHEN COALESCE(whitelist, 0) <> 0 THEN 1 ELSE 0 END,
    CASE WHEN COALESCE(whitelist, 0) <> 0 THEN 1 ELSE 0 END,
    COALESCE(maxPlayers, 0),
    COALESCE(serverPort, 0),
    COALESCE(lastUpdated, 0),
    COALESCE(date, 0),
    CASE WHEN COALESCE(isActive, 1) <> 0 THEN 1 ELSE 0 END,
    COALESCE(recordPlayerCount, 0)
FROM servers_old;

CREATE UNIQUE INDEX idx_servers_uuid_unique ON servers (uuid);
CREATE INDEX idx_servers_active ON servers (isActive);
CREATE INDEX idx_servers_serverip_port ON servers (serverIp, serverPort);
CREATE INDEX idx_servers_numericalip_port ON servers (numericalIP, serverPort);

CREATE TRIGGER trg_servers_whitelist_to_whitelisted_ai
AFTER INSERT ON servers
FOR EACH ROW
WHEN NEW.whitelisted <> NEW.whitelist
BEGIN
    UPDATE servers
    SET whitelisted = NEW.whitelist
    WHERE id = NEW.id;
END;

CREATE TRIGGER trg_servers_whitelist_to_whitelisted_au
AFTER UPDATE OF whitelist ON servers
FOR EACH ROW
WHEN NEW.whitelisted <> NEW.whitelist
BEGIN
    UPDATE servers
    SET whitelisted = NEW.whitelist
    WHERE id = NEW.id;
END;

CREATE TRIGGER trg_servers_whitelisted_to_whitelist_au
AFTER UPDATE OF whitelisted ON servers
FOR EACH ROW
WHEN NEW.whitelisted <> NEW.whitelist
BEGIN
    UPDATE servers
    SET whitelist = NEW.whitelisted
    WHERE id = NEW.id;
END;

CREATE TABLE server_players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    uuid TEXT NOT NULL,
    player TEXT NOT NULL,
    date INTEGER NOT NULL CHECK (date >= 0),
    lastUpdated INTEGER NOT NULL CHECK (lastUpdated >= 0),
    FOREIGN KEY (server_id) REFERENCES servers (id) ON UPDATE CASCADE ON DELETE CASCADE
);

INSERT INTO server_players (id, server_id, uuid, player, date, lastUpdated)
SELECT
    src.id,
    src.server_id,
    src.uuid,
    src.player,
    src.date,
    src.lastUpdated
FROM (
    SELECT
        sp.id,
        sp.server_id,
        COALESCE(sp.uuid, '') AS uuid,
        COALESCE(sp.player, '') AS player,
        COALESCE(sp.date, 0) AS date,
        COALESCE(sp.lastUpdated, 0) AS lastUpdated,
        ROW_NUMBER() OVER (
            PARTITION BY sp.server_id, LOWER(COALESCE(sp.player, ''))
            ORDER BY COALESCE(sp.lastUpdated, 0) DESC, COALESCE(sp.date, 0) DESC, sp.id DESC
        ) AS rn
    FROM server_players_old sp
    JOIN servers s ON s.id = sp.server_id
) src
WHERE src.rn = 1;

CREATE UNIQUE INDEX idx_server_players_server_player_nocase
ON server_players (server_id, player COLLATE NOCASE);
CREATE INDEX idx_server_players_uuid_lastUpdated
ON server_players (uuid, lastUpdated DESC);
CREATE INDEX idx_server_players_server_lastUpdated
ON server_players (server_id, lastUpdated DESC);
CREATE INDEX idx_server_players_player_nocase
ON server_players (player COLLATE NOCASE);

CREATE TABLE server_player_count (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    uuid TEXT NOT NULL,
    onlinePlayers INTEGER NOT NULL CHECK (onlinePlayers >= 0),
    date INTEGER NOT NULL CHECK (date >= 0),
    FOREIGN KEY (server_id) REFERENCES servers (id) ON UPDATE CASCADE ON DELETE CASCADE
);

INSERT INTO server_player_count (id, server_id, uuid, onlinePlayers, date)
SELECT
    c.id,
    c.server_id,
    COALESCE(c.uuid, ''),
    COALESCE(c.onlinePlayers, 0),
    COALESCE(c.date, 0)
FROM server_player_count_old c
JOIN servers s ON s.id = c.server_id;

CREATE INDEX idx_server_player_count_server_date
ON server_player_count (server_id, date DESC);
CREATE INDEX idx_server_player_count_uuid_date
ON server_player_count (uuid, date DESC);

DROP TABLE server_player_count_old;
DROP TABLE server_players_old;
DROP TABLE servers_old;

DELETE FROM sqlite_sequence WHERE name IN ('servers', 'server_players', 'server_player_count');
INSERT INTO sqlite_sequence (name, seq) SELECT 'servers', COALESCE(MAX(id), 0) FROM servers;
INSERT INTO sqlite_sequence (name, seq) SELECT 'server_players', COALESCE(MAX(id), 0) FROM server_players;
INSERT INTO sqlite_sequence (name, seq) SELECT 'server_player_count', COALESCE(MAX(id), 0) FROM server_player_count;

COMMIT;
PRAGMA foreign_keys = ON;
PRAGMA optimize;
