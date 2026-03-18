const axios = require('axios');
const randomColor = require('randomcolor');
const moment = require('moment');

let hasIsActiveColumnCache = null;

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
    const query = knex('servers');
    if (await ensureIsActiveColumn(knex)) {
        query.where({ isActive: true });
    }
    return { query };
}

async function getActiveServerRecords(knex) {
    const { query } = await getActiveServerQuery(knex);
    return query.select(["id", "uuid"]);
}

async function getServerInformationByID(id, knex) {
    const { query: serverBuilder } = await getActiveServerQuery(knex);
    let server = await serverBuilder.where({ id }).select();
    return server.length != 1 ? false : await getData(server[0], knex);
}


async function getServers(knex) {
    const { query: serverBuilder } = await getActiveServerQuery(knex);
    let servers = await serverBuilder.select();

    let builder = [];

    for(let el of servers) {
        let data =  await getData(el, knex);
        builder.push(data);
    }

    return builder;
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

async function getServerInformation(knex,sortArray) {
    const { query: serverBuilder } = await getActiveServerQuery(knex);
    let servers = await serverBuilder.select();
    let data = [];
    for (const el of servers) {
        data.push(await getData(el,knex));
    }

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
        online: p2[0].onlinePlayers,
        stored: p3[0].count,
        onlinemode: Boolean(el.onlineMode),
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
        let builder = [];

        for(const el of user) {
            let server = await getServerInformationByID(el.server_id, knex);

            if(server) {
                builder.push({
                    server_id: server.id,
                    server: server.name,
                    server_icon: server.icon,
                    server_uuid: el.uuid,
                    date: el.date,
                    last_date: el.lastUpdated
                });
            }
        }

        let p = await checkPlayer(player);
        return {
            success: true,
            uuid: p.uuid,
            player: p.player,
            isValid: p.isValid,
            servers: builder,
        }
    }
}


async function checkPlayer(player) {
    let data = await request(process.env.MOJANG_URL + player);
    return !data ? { isValid: false, uuid: null, player: player } : {isValid: true,uuid: data.uuid, player: data.username}
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
    let timestamps = [];

    for(const el of data) {
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
