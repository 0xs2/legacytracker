const axios = require('axios');
const randomColor = require('randomcolor');
const moment = require('moment');

let hasIsActiveColumnCache = null;
const CHECK_PLAYER_CACHE_TTL_MS = 5 * 60 * 1000;
const checkPlayerCache = new Map();

async function ensureIsActiveColumn(knex) {
    if (typeof hasIsActiveColumnCache === 'boolean') {
        return hasIsActiveColumnCache;
    }
    try {
        hasIsActiveColumnCache = await knex.schema.hasColumn('servers', 'isActive');
    } catch (err) {
        hasIsActiveColumnCache = false;
    }
    return hasIsActiveColumnCache;
}

async function getActiveServerQuery(knex) {
    return getServerQuery(knex, { includeInactive: false });
}

async function getServerQuery(knex, options = {}) {
    const includeInactive = Boolean(options && options.includeInactive);
    const query = knex('servers');
    if (!includeInactive && await ensureIsActiveColumn(knex)) {
        query.where(function() {
            this.whereIn('isActive', [1, true, '1', 'true']).orWhereNull('isActive');
        });
    }
    return { query };
}

function normalizeIsActive(value) {
    if (value === undefined || value === null) {
        return true;
    }
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'number') {
        return value !== 0;
    }
    if (typeof value === 'string') {
        const lowered = value.trim().toLowerCase();
        if (lowered === '' || lowered === '1' || lowered === 'true' || lowered === 'yes' || lowered === 'on' || lowered === 'active') {
            return true;
        }
        if (lowered === '0' || lowered === 'false' || lowered === 'no' || lowered === 'off' || lowered === 'inactive' || lowered === 'dead') {
            return false;
        }
        const numeric = Number(lowered);
        if (!Number.isNaN(numeric)) {
            return numeric !== 0;
        }
    }
    return Boolean(value);
}

function toTimestamp(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return 0;
    }
    return Math.floor(parsed);
}

function normalizeNameForGrouping(value) {
    return (value || "")
        .toString()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");
}

function normalizeIpForGrouping(value) {
    return (value || "")
        .toString()
        .toLowerCase()
        .trim();
}

function groupServerRowsByIdentity(rows) {
    if (!Array.isArray(rows) || !rows.length) {
        return [];
    }

    const parent = rows.map((_, index) => index);
    const find = (index) => {
        let i = index;
        while (parent[i] !== i) {
            parent[i] = parent[parent[i]];
            i = parent[i];
        }
        return i;
    };
    const union = (a, b) => {
        const rootA = find(a);
        const rootB = find(b);
        if (rootA !== rootB) {
            parent[rootB] = rootA;
        }
    };

    const ipIndexMap = new Map();
    const nameIndexMap = new Map();

    rows.forEach((row, index) => {
        const ipKey = normalizeIpForGrouping(row.serverIp || row.ip);
        const nameKey = normalizeNameForGrouping(row.serverName || row.name);

        if (ipKey) {
            if (ipIndexMap.has(ipKey)) {
                union(index, ipIndexMap.get(ipKey));
            } else {
                ipIndexMap.set(ipKey, index);
            }
        }

        if (nameKey) {
            if (nameIndexMap.has(nameKey)) {
                union(index, nameIndexMap.get(nameKey));
            } else {
                nameIndexMap.set(nameKey, index);
            }
        }
    });

    const grouped = new Map();
    rows.forEach((row, index) => {
        const root = find(index);
        if (!grouped.has(root)) {
            grouped.set(root, []);
        }
        grouped.get(root).push(row);
    });

    return Array.from(grouped.values());
}

function selectPrimaryServerData(records) {
    if (!Array.isArray(records) || !records.length) {
        return null;
    }

    return [...records].sort((a, b) => {
        const activeDiff = Number(normalizeIsActive(b.isActive)) - Number(normalizeIsActive(a.isActive));
        if (activeDiff !== 0) {
            return activeDiff;
        }

        const lastPingDiff = toTimestamp(b.lastPing || b.updated) - toTimestamp(a.lastPing || a.updated);
        if (lastPingDiff !== 0) {
            return lastPingDiff;
        }

        const onlineDiff = (Number(b.online) || 0) - (Number(a.online) || 0);
        if (onlineDiff !== 0) {
            return onlineDiff;
        }

        return (Number(b.id) || 0) - (Number(a.id) || 0);
    })[0];
}

function selectPrimaryServerRow(rows) {
    if (!Array.isArray(rows) || !rows.length) {
        return null;
    }

    return [...rows].sort((a, b) => {
        const activeDiff = Number(normalizeIsActive(b.isActive)) - Number(normalizeIsActive(a.isActive));
        if (activeDiff !== 0) {
            return activeDiff;
        }

        const updatedDiff = toTimestamp(b.lastUpdated) - toTimestamp(a.lastUpdated);
        if (updatedDiff !== 0) {
            return updatedDiff;
        }

        return (Number(b.id) || 0) - (Number(a.id) || 0);
    })[0];
}

function mergeGroupedServerData(records) {
    if (!Array.isArray(records) || !records.length) {
        return null;
    }

    const primary = selectPrimaryServerData(records);
    if (!primary) {
        return null;
    }

    let online = 0;
    let peak = 0;
    let stored = 0;
    let maxPlayers = 0;
    let lastPing = 0;
    let firstPing = 0;
    let firstPingSet = false;
    let isActive = false;
    let icon = primary.icon || null;
    let description = primary.desc || "";
    let descriptionTimestamp = toTimestamp(primary.lastPing || primary.updated);

    const versionMap = new Map();

    records.forEach((record) => {
        const recordLastPing = toTimestamp(record.lastPing || record.updated);
        const recordFirstPing = toTimestamp(record.firstPing);
        const recordOnline = Number(record.online) || 0;
        const recordPeak = Number(record.peak) || 0;
        const recordStored = Number(record.stored) || 0;
        const recordMax = Number(record.max) || 0;
        const recordActive = normalizeIsActive(record.isActive);

        online = Math.max(online, recordOnline);
        peak = Math.max(peak, recordPeak);
        stored = Math.max(stored, recordStored);
        maxPlayers = Math.max(maxPlayers, recordMax);
        lastPing = Math.max(lastPing, recordLastPing);
        isActive = isActive || recordActive;

        if (recordFirstPing > 0 && (!firstPingSet || recordFirstPing < firstPing)) {
            firstPing = recordFirstPing;
            firstPingSet = true;
        }

        if (!icon && record.icon) {
            icon = record.icon;
        }

        if (record.desc && (!description || recordLastPing >= descriptionTimestamp)) {
            description = record.desc;
            descriptionTimestamp = recordLastPing;
        }

        const versionLabelRaw = (record.version || "Unknown").toString().trim();
        const versionLabel = versionLabelRaw || "Unknown";
        const versionKey = versionLabel.toLowerCase();
        const existingVersion = versionMap.get(versionKey);
        if (!existingVersion || recordLastPing >= existingVersion.lastPing) {
            versionMap.set(versionKey, {
                version: versionLabel,
                lastPing: recordLastPing
            });
        }
    });

    const versionDetails = Array.from(versionMap.values())
        .sort((a, b) => {
            const lastPingDiff = (b.lastPing || 0) - (a.lastPing || 0);
            if (lastPingDiff !== 0) {
                return lastPingDiff;
            }
            return a.version.localeCompare(b.version, undefined, { numeric: true, sensitivity: "base" });
        })
        .map((versionInfo) => ({
            version: versionInfo.version,
            lastPing: versionInfo.lastPing,
            lastCachedLabel: versionInfo.lastPing ? moment.unix(versionInfo.lastPing).format("lll") : "Unknown"
        }));

    return {
        ...primary,
        icon: icon,
        desc: description,
        max: maxPlayers || (Number(primary.max) || 0),
        online: online,
        peak: peak,
        stored: stored,
        isActive: isActive,
        firstPing: firstPingSet ? firstPing : toTimestamp(primary.firstPing),
        lastPing: lastPing || toTimestamp(primary.lastPing || primary.updated),
        version: versionDetails.map((entry) => entry.version).join(", "),
        versionDetails: versionDetails
    };
}

async function getActiveServerRecords(knex) {
    const { query } = await getActiveServerQuery(knex);
    return query.select(["id", "uuid"]);
}

async function getServerInformationByID(id, knex, options = {}) {
    const includeInactive = Boolean(options && options.includeInactive);
    const { query: serverBuilder } = await getServerQuery(knex, { includeInactive });
    let server = await serverBuilder.where({ id }).select();
    return server.length != 1 ? false : await getData(server[0], knex);
}


async function getServers(knex) {
    const { query: serverBuilder } = await getActiveServerQuery(knex);
    let servers = await serverBuilder.select();
    const groupedRows = groupServerRowsByIdentity(servers);
    const groupedData = await Promise.all(groupedRows.map(async (groupRows) => {
        const memberData = await Promise.all(groupRows.map((row) => getData(row, knex)));
        return mergeGroupedServerData(memberData);
    }));
    return groupedData.filter(Boolean);
}

async function getServerPlayers(knex, q) {
    let data = await knex('server_players').where("server_id", q).select(["player","date", "lastUpdated"]);
    if(data.length == 0) {
        return {success: false};
    }
    else {

        let server = await getServerNameID(knex, q);
        let server_uuid = await getServerUUID(knex, q);

        return {
            server: server,
            server_uuid: server_uuid,
            sucesss: true, 
            players: data
        };
    }
}

async function updatePlayerStats(knex, server_id, player) {
    await knex('server_players').where({"server_id": server_id, "player": player}).update({
        lastUpdated: moment().format('X')
    });
}

async function getServerInformation(knex,sortArray, options = {}) {
    const includeInactive = Boolean(options && options.includeInactive);
    const { query: serverBuilder } = await getServerQuery(knex, { includeInactive });
    let servers = await serverBuilder.select();
    const groupedRows = groupServerRowsByIdentity(servers);
    const groupedData = await Promise.all(groupedRows.map(async (groupRows) => {
        const memberData = await Promise.all(groupRows.map((row) => getData(row, knex)));
        return mergeGroupedServerData(memberData);
    }));
    let data = groupedData.filter(Boolean);

    return sortArray(data, {
        by: 'online',
        order: 'desc'
    });
}

async function getStats(knex) {
    let p3 = await knex("server_players").count('player', {as: 'count'}).limit(1); 
    const { query: activeServerBuilder } = await getActiveServerQuery(knex);
    let p = await activeServerBuilder.count('id', {as: 'count'}).limit(1); 
    let p2 = await getOnlinePlayers(knex, p[0].count);
    let p1 = await knex('server_player_count').select(["date", "id"]).orderBy('date', 'desc').limit(1);
    const latestPing = Array.isArray(p1) && p1.length ? p1[0] : null;

    return {
        totalServers: p[0].count,
        totalUsers: p3[0].count,
        totalUsersOnline: p2,
        totalPings: latestPing ? latestPing.id : 0,
        lastPinged: latestPing ? latestPing.date : 0,
        success: true
    };

}

async function getOnlinePlayers(knex, c) {
    let data = await knex('server_player_count').select(["onlinePlayers"]).orderBy('date', 'desc').limit(c);
	let co = 0;
    for(const el of data) {

        co += el.onlinePlayers;
    }
    return co;
}

async function getServerHistory(q, knex) { 
    let data = await knex('server_player_count').where("server_id", q).select(["onlinePlayers","date"]).limit(process.env.PLAYER_LIMIT).orderBy("date", "desc");

    if(data.length == 0) {
        return {success: false};
    }
    else {
    let timestamps = [];
    let count = [];
    
    for (const el of data) {
        timestamps.push(el.date);
        count.push(el.onlinePlayers);
    }
    return {timestamps: timestamps.reverse(), cnt: count.reverse(), success: true};
    }
}

const JOIN_BUCKET_DEFINITIONS = {
    week: 604800,
    month: 2592000
};

async function getServerJoinHistory(serverId, knex, bucket = 'hour') {
    if(!serverId) {
        return {success: false};
    }

    const limit = parseInt(process.env.PLAYER_LIMIT, 10) || 200;
    const bucketKey = bucket && JOIN_BUCKET_DEFINITIONS[bucket] ? bucket : 'week';
    const bucketSeconds = JOIN_BUCKET_DEFINITIONS[bucketKey];
    const data = await knex('server_players')
        .where("server_id", serverId)
        .select(["date"])
        .orderBy("date", "desc")
        .limit(limit);

    if(data.length == 0) {
        return {success: false};
    }

    const buckets = new Map();
    data.forEach(entry => {
        const timestamp = parseInt(entry.date, 10) || 0;
        const bucket = Math.floor(timestamp / bucketSeconds) * bucketSeconds;
        buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
    });

    const sortedBuckets = Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]);

    return {
        success: true,
        timestamps: sortedBuckets.map(([timestamp]) => timestamp),
        counts: sortedBuckets.map(([,count]) => count),
        bucket: bucketKey
    };
}

async function getData(el, knex) {
    let p2 = await knex("server_player_count").where("uuid", el.uuid).select("onlinePlayers").orderBy("date", "desc").limit(1); 
    let p3 = await knex("server_players").where("uuid", el.uuid).count('player', {as: 'count'}).limit(1); 
    const isActive = normalizeIsActive(el.isActive);

    return {
        id: el.id,
        icon: el.serverIcon,
        desc: el.serverDescription,
        version: el.serverVersion,
        port: el.serverPort,
        name: el.serverName,
        ip: el.serverIp,
        nip: el.numericalIP,
        color: el.color,
        auth: Boolean(el.authenticated),
        whitelisted: Boolean(el.whitelisted),
        max: el.maxPlayers,
        peak: el.recordPlayerCount,
        online: p2.length > 0 ? p2[0].onlinePlayers : 0,
        stored: p3[0].count,
        onlinemode: Boolean(el.onlineMode),
        isActive: isActive,
        updated: el.lastUpdated,
        firstPing: el.date,
        lastPing: el.lastUpdated
    };
}

async function getPlayer(player, knex) {
    let user = await knex('server_players').whereRaw("LOWER(player) == LOWER(?)", player).select();

    if(user.length < 1) {
        return false;
    }
    else {
        const firstCachedOn = user.reduce((min, entry) => {
            const ts = Number(entry.date) || 0;
            if (!ts) {
                return min;
            }
            return min === 0 ? ts : Math.min(min, ts);
        }, 0);

        const lastCachedOn = user.reduce((max, entry) => {
            const ts = Number(entry.lastUpdated || entry.date) || 0;
            return Math.max(max, ts);
        }, 0);

        const retroMcMatches = await knex('server_players as sp')
            .join('servers as s', 'sp.server_id', 's.id')
            .whereRaw("LOWER(sp.player) == LOWER(?)", player)
            .andWhere(function () {
                this.whereRaw("LOWER(COALESCE(s.serverName, '')) LIKE ?", ['%retromc%'])
                    .orWhereRaw("LOWER(COALESCE(s.serverIp, '')) LIKE ?", ['%retromc%']);
            })
            .select('sp.id')
            .limit(1);

        let builder = [];

        for(const el of user) {
            let server = await getServerInformationByID(el.server_id, knex, { includeInactive: true });

            if(server) {
                builder.push({
                    server_id: server.id,
                    server: server.name,
                    server_icon: server.icon,
                    server_uuid: el.uuid,
                    server_ip: server.ip,
                    isActive: Boolean(server.isActive),
                    date: el.date,
                    last_date: el.lastUpdated
                });
            }
        }

        function dedupePlayerServers(entries) {
            if (!Array.isArray(entries) || entries.length < 2) {
                return Array.isArray(entries) ? entries : [];
            }

            const parent = entries.map((_, index) => index);
            const find = (index) => {
                let i = index;
                while (parent[i] !== i) {
                    parent[i] = parent[parent[i]];
                    i = parent[i];
                }
                return i;
            };
            const union = (a, b) => {
                const rootA = find(a);
                const rootB = find(b);
                if (rootA !== rootB) {
                    parent[rootB] = rootA;
                }
            };

            const ipIndexMap = new Map();
            const nameIndexMap = new Map();

            entries.forEach((entry, index) => {
                const ipKey = normalizeIpForGrouping(entry.server_ip || "");
                const nameKey = normalizeNameForGrouping(entry.server || "");

                if (ipKey) {
                    if (ipIndexMap.has(ipKey)) {
                        union(index, ipIndexMap.get(ipKey));
                    } else {
                        ipIndexMap.set(ipKey, index);
                    }
                }

                if (nameKey) {
                    if (nameIndexMap.has(nameKey)) {
                        union(index, nameIndexMap.get(nameKey));
                    } else {
                        nameIndexMap.set(nameKey, index);
                    }
                }
            });

            const grouped = new Map();
            entries.forEach((entry, index) => {
                const root = find(index);
                if (!grouped.has(root)) {
                    grouped.set(root, []);
                }
                grouped.get(root).push(entry);
            });

            const mergedEntries = [];
            grouped.forEach((groupEntries) => {
                const sorted = [...groupEntries].sort((a, b) => {
                    const activeDiff = Number(Boolean(b.isActive)) - Number(Boolean(a.isActive));
                    if (activeDiff !== 0) {
                        return activeDiff;
                    }
                    return (Number(b.last_date) || 0) - (Number(a.last_date) || 0);
                });
                const primary = sorted[0];

                const merged = {
                    ...primary,
                    isActive: groupEntries.some((entry) => Boolean(entry.isActive)),
                    date: groupEntries.reduce((min, entry) => {
                        const ts = Number(entry.date) || 0;
                        if (!ts) {
                            return min;
                        }
                        return min === 0 ? ts : Math.min(min, ts);
                    }, 0),
                    last_date: groupEntries.reduce((max, entry) => Math.max(max, Number(entry.last_date) || 0), 0)
                };

                mergedEntries.push(merged);
            });

            return mergedEntries;
        }

        builder = dedupePlayerServers(builder);
        builder.sort((a, b) => {
            const activeDiff = Number(Boolean(b.isActive)) - Number(Boolean(a.isActive));
            if (activeDiff !== 0) {
                return activeDiff;
            }
            return (Number(b.last_date) || 0) - (Number(a.last_date) || 0);
        });

        const totalListedCount = builder.length;
        const activeListedCount = builder.filter((entry) => Boolean(entry.isActive)).length;

        let p = await checkPlayer(player);
        return {
            success: true,
            uuid: p.uuid,
            player: p.player,
            isValid: p.isValid,
            servers: builder,
            hasRetroMc: retroMcMatches.length > 0,
            trackerStats: {
                firstCachedOn: firstCachedOn,
                lastCachedOn: lastCachedOn,
                trackedServers: totalListedCount,
                listedServers: activeListedCount
            }
        }
    }
}


async function checkPlayer(player) {
    const normalizedPlayer = (player || "").toString().trim();
    const cacheKey = normalizedPlayer.toLowerCase();
    const now = Date.now();
    const cached = checkPlayerCache.get(cacheKey);

    if (cached && cached.expiresAt > now) {
        return await cached.value;
    }

    checkPlayerCache.set(cacheKey, {
        value: request(process.env.MOJANG_URL + normalizedPlayer).then((data) => (
            !data
                ? { isValid: false, uuid: null, player: normalizedPlayer }
                : { isValid: true, uuid: data.uuid, player: data.username }
        )),
        expiresAt: now + CHECK_PLAYER_CACHE_TTL_MS
    });

    const result = await checkPlayerCache.get(cacheKey).value;
    checkPlayerCache.set(cacheKey, {
        value: result,
        expiresAt: Date.now() + CHECK_PLAYER_CACHE_TTL_MS
    });
    return result;
}

async function getPlayersOnline(knex, id) {
    let count = await knex('server_player_count').where("server_id", id).select(["onlinePlayers","date"]).limit(1).orderBy("date", "desc");

    if(count.length == 0) {
        return {success: false};
    }
    else {
        let c = count[0]['onlinePlayers'];
        let data = await knex('server_players').where("server_id", id).select(["player","lastUpdated"]).limit(c).orderBy("lastUpdated", "desc");

        let builder = [];
        for(const d of data) {
            builder.push(d.player);
        }

        return {
            success: true,
            count: c,
            players: builder
        }
    }
}

async function getGlobalHistory(knex) { 
    let final = [];
    const { query: serverBuilder } = await getActiveServerQuery(knex);
    let data = await serverBuilder.select();
    const groupedRows = groupServerRowsByIdentity(data);
    let timestamps = [];

    for(const groupedRow of groupedRows) {
        const el = selectPrimaryServerRow(groupedRow);
        if (!el) {
            continue;
        }

        let data2 = await knex('server_player_count').where("uuid", el.uuid).select(["onlinePlayers","date"]).limit(process.env.PLAYER_LIMIT).orderBy("date", "desc");

        let count = [];


        for (const el2 of data2) {
            count.push(el2.onlinePlayers);
            timestamps.push(el2.date);

        }

        final.push({
            "id": el.id,
            "name": el.serverName,
            "uuid": el.uuid, 
            "color": el.color,
            "cnt": count.reverse()
        }
    );

    }
    return {servers: final, timestamps: timestamps.slice(0, process.env.PLAYER_LIMIT).reverse(), success: true};
}


async function createTables(knex) {
    try {
        // make the 'servers' table
        const serverTableExists = await knex.schema.hasTable('servers');
        if (!serverTableExists) {
            await knex.schema.createTable('servers', function (t) {
                t.increments('id').primary();
                t.string('uuid', 50);
                t.text('serverName');
                t.text('serverDescription');
                t.text('serverIcon');
                t.text('serverVersion');
                t.string('serverIp', 50);
                t.string('numericalIP', 50);
                t.string('color', 50);
                t.integer('onlineMode', 10);
                t.integer('authenticated', 10);
                t.integer('whitelist', 10);
                t.integer('maxPlayers', 10);
                t.integer('serverPort', 5);
                t.integer('lastUpdated', 20);
                t.integer('date', 20);
                t.integer('isActive', 1).defaultTo(1);
            });
        } else {
            const hasIsActiveColumn = await knex.schema.hasColumn('servers', 'isActive');
            if (!hasIsActiveColumn) {
                await knex.schema.table('servers', function (t) {
                    t.integer('isActive', 1).defaultTo(1);
                });
            }
        }

        // make the 'server_player_count' table
        await knex.schema.hasTable('server_player_count').then(function (exists) {
            if (!exists) {
                return knex.schema.createTable('server_player_count', function (t) {
                    t.increments('id').primary();
                    t.integer('server_id', 20);
                    t.string('uuid', 50);
                    t.integer('onlinePlayers', 20);
                    t.integer('date', 20);
                });
            }
        });

        // make the 'server_players' table
        await knex.schema.hasTable('server_players').then(function (exists) {
            if (!exists) {
                return knex.schema.createTable('server_players', function (t) {
                    t.increments('id').primary();
                    t.integer('server_id', 20);
                    t.string('uuid', 50);
                    t.string('player', 50);
                    t.integer('date', 20);
                    t.integer('lastUpdated', 20);
                });
            }
        });
    } catch (err) {
        console.error(err);
    }
}

async function serverTable(knex) {
    let data = await request(process.env.SERVERS_URL);

    for (const el of data.servers) {

        let server = await knex('servers').where('uuid', el.uuid).select('uuid');

        if(server.length < 1) {
            let data2 = await request(`${process.env.SERVER_URL}?uuid=${el.uuid}&icons=true`);

            if(data2) {
                insertServer(knex, data2);

            }
        }

    };
}


function sltlog(str) {
    if(process.env.LOGGING) {
        console.log(`[slt-logger] ${str}`);
    }
}

async function insertPlayer(knex, data) {
    if(data.players) {
        let id = await getServerID(knex, data.uuid);

        for (const player of data.players) { 

        let p = await knex('server_players').where({'player': player.username, 'uuid': data.uuid}).select(["player"]);

        if(p.length < 1) {
            await knex('server_players').insert({
                server_id: id,
                uuid: data.uuid,
                player: player.username,
                date: moment().format('X'),
                lastUpdated: moment().format('X')
            });

            sltlog(`inserted player : ${player.username} | in server : ${data.uuid}`);
        }
        else {
            updatePlayerStats(knex, id, player.username)
            sltlog(`updated player : ${player.username} | in server : ${data.uuid}`);
        }
    }
}
}

async function insertServer(knex, data) {
    await knex('servers').insert({
            uuid: data.uuid,
            serverName: data.serverName,
            serverDescription: data.serverDescription,
            serverVersion: data.serverVersion,
            serverPort: data.serverPort,
            maxPlayers: data.maxPlayers,
            serverIcon: data.serverIcon,
            color: randomColor(),
            isActive: true,
            serverIP: data.serverIP,
            numericalIP: data.numericalIP,
            whitelist: data.whitelist,
            authenticated: data.authenticated,
            onlineMode: data.onlineMode,
            lastUpdated: moment().format('X'),
            date: moment().format('X')
    });

    sltlog(`inserted server : ${data.serverName} | uuid : ${data.uuid}`);

}

async function insertCount(knex, data) {
    const id = await getServerID(knex, data.uuid);
    const [insertedId] = await knex('server_player_count').insert({
      server_id: id,
      uuid: data.uuid,
      onlinePlayers: data.onlinePlayers,
      date: moment().format('X')
    });

    sltlog(`insert new ping for : ${data.uuid} | player count : ${data.onlinePlayers}`);


    const latestCount = await getPlayerCountLatest(knex, insertedId);
    const isRecordBroken = await isRecord(knex, id, latestCount);

    if (isRecordBroken) {
      await knex('servers').where('id', id).update({
        recordPlayerCount: latestCount
      });

      sltlog(`server player record broken in : ${data.uuid} | new : ${data.onlinePlayers} | old : ${latestCount}`);

    }
}


async function getPlayerCountLatest(knex, id) {
    let data = await knex("server_player_count").where("id", id).select("onlinePlayers");
    return data[0].onlinePlayers;
}


async function request(url) {
    try {
      const response = await axios.get(url);
  
      if (response.status === 200) {

        sltlog(`request to : ${url} successful`);

        return response.data;
      } else {
        sltlog(`request to : ${url}  not successful`);
        return false;
      }
    } catch (error) {
        sltlog(`request to : ${url} not successful`);
      return false;
    }
  }

async function getServerID(knex, uuid) {
    let data = await knex("servers").where("uuid", uuid).select("id");
    return data[0].id; 
}

async function getServerName(knex, uuid) {
    let data = await knex("servers").where("uuid", uuid).select("serverName");
    return data[0].serverName; 
}

async function getServerNameID(knex, id) {
    let data = await knex("servers").where("id", id).select("serverName");
    return data[0].serverName; 
}

async function getServerUUID(knex, id) {
    let data = await knex("servers").where("id", id).select("uuid");
    return data[0].uuid; 
}

async function updateServer(knex, data, id) {
    await knex('servers').where("id", id).update({
            uuid: data.uuid,
            serverName: data.serverName,
            serverDescription: data.serverDescription,
            serverVersion: data.serverVersion,
            serverPort: data.serverPort,
            maxPlayers: data.maxPlayers,
            serverIcon: data.serverIcon,
            serverIP: data.serverIP,
            isActive: true,
            numericalIP: data.numericalIP,
            whitelist: data.whitelist,
            authenticated: data.authenticated,
            onlineMode: data.onlineMode,
            lastUpdated: moment().format('X')
    });

    sltlog(`server updated : ${data.serverName} | uuid : ${data.uuid}`);

}

// check if a record is broken
async function isRecord(knex, server_id, count) {
    let data = await knex("servers").where("id", server_id).select(["recordPlayerCount"]);
   return count > data[0].recordPlayerCount ? true : false;
}

// hide all servers
async function hideAll(knex) {
    await knex('servers').update({ isActive: false });
    sltlog(`set all servers to hidden.`);
}


// get rid of the older entries after 1 day
async function purgeOldEntries(knex) {
    const oneDayAgo = moment().subtract(1, 'day').unix();
    knex('server_player_count')
    .where('date', '<', oneDayAgo)
    .del()
    .then((numDeletedRows) => {
        console.log(`${numDeletedRows} rows deleted.`);
      })
}

module.exports = {
    createTables, 
    getServerInformation, 
    getStats,
    getServerHistory,
    getServerJoinHistory,
    getGlobalHistory,
    getServerInformationByID,
    updateServer,
    getServerName,
    sltlog,
    hideAll,
    insertPlayer,
    insertServer,
    insertCount,
    request,
    getServerPlayers,
    purgeOldEntries,
    getPlayer,
    getServers,
    getActiveServerRecords,
    serverTable,
    getPlayersOnline
};
