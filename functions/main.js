const axios = require('axios');
const moment = require('moment');

async function getServerInformationByID(id, knex) {
    let server = await knex('servers').where("id", id).select();

    if(server.length != 1) {
        return false;
    }
    else {
        return await getData(server[0], knex);
    }
}


async function getServers(knex) {
    let servers = await knex('servers').select();

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

async function updatePlayerDate(knex, server_id, player) {
    await knex('server_players').where({"server_id": server_id, "player": player}).update({
        lastUpdated: moment().format('X')
    });
}

async function getServerInformation(knex,sortArray) {
    let servers = await knex('servers').select();
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
    let p = await knex("servers").count('id', {as: 'count'}).limit(1); 
    let p2 = await getOnlinePlayers(knex);
    let p1 = await knex('server_player_count').select(["date"]).orderBy('date', 'desc').limit(1);

    return {
        totalServers: p[0].count,
        totalUsers: p3[0].count,
        totalUsersOnline: p2,
        lastPinged: p1[0].date,
        success: true
    };

}

async function getOnlinePlayers(knex) {
    let data = await knex('server_player_count').select(["onlinePlayers"]).orderBy('date', 'desc').limit(10);
    builder = [];
    for(const el of data) {
        builder.push(el.onlinePlayers);
    }
    return builder.reduce((a, b) => a + b, 0)
}

async function getServerHistory(q, knex) { 
    let data = await knex('server_player_count').where("server_id", q).select(["onlinePlayers","date"]).limit(100).orderBy("date", "desc");

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

async function getData(el, knex) {
    let p = await knex("server_player_count").where("uuid", el.uuid).select("onlinePlayers").orderBy("onlinePlayers", "desc").limit(1); 
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
        auth: Boolean(el.authenticated),
        whitelisted: Boolean(el.whitelisted),
        max: el.maxPlayers,
        peak: p[0].onlinePlayers,
        online: p2[0].onlinePlayers,
        stored: p3[0].count,
        onlinemode: Boolean(el.onlineMode),
        updated: el.lastUpdated
    };
}

async function getPlayer(player, knex) {
    let user = await knex('server_players').whereLike('player', `%${player}%`).select();

    if(user.length < 1) {
        return {"success": false, "message": "no data available"};
    }
    else {
        let builder = [];

        for(const el of user) {
            let server = await getServerName(knex, el.uuid);

            builder.push({
            server: server,
            server_uuid: el.uuid,
            date: el.date
            });
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

    if(!data) {
        return {
            isValid: false,
            uuid: null,
            player: player
        }
    }
    else {
        return {
            isValid: true,
            uuid: data.uuid,
            player: data.username
        }
    }
}

async function getGlobalHistory(knex) { 
    let final = [];
    let data = await knex('servers').select();
    let timestamps = [];

    for(const el of data) {
        let data2 = await knex('server_player_count').where("uuid", el.uuid).select(["onlinePlayers","date"]).limit(100).orderBy("date", "desc");

        let count = [];


        for (const el2 of data2) {
            count.push(el2.onlinePlayers);
            timestamps.push(el2.date);

        }

        final.push({
            "name": el.serverName, 
            "cnt": count.reverse()
        }
    );

    }
    return {servers: final, timestamps: timestamps.slice(0, 100).reverse(), success: true};
}


async function createTables(knex) {
    try {
        // make the 'servers' table
        await knex.schema.hasTable('servers').then(function (exists) {
            if (!exists) {
                return knex.schema.createTable('servers', function (t) {
                    t.increments('id').primary();
                    t.string('uuid', 50);
                    t.text('serverName');
                    t.text('serverDescription');
                    t.text('serverIcon');
                    t.text('serverVersion');
                    t.string('serverIp', 50);
                    t.string('numericalIP', 50);
                    t.integer('onlineMode', 10);
                    t.integer('authenticated', 10);
                    t.integer('whitelist', 10);
                    t.integer('maxPlayers', 10);
                    t.integer('serverPort', 5);
                    t.integer('lastUpdated', 20);
                    t.integer('date', 20);
                });
            }
        });

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

// main server data function
async function serverData(knex) {
    let servers = await knex('servers').select();

    for (const el of servers) {
        let data2 = await request(`${process.env.SERVER_URL}?uuid=${el.uuid}`);

        // insert all the stuff
        insertPlayer(knex, data2);
        insertCount(knex, data2);

    }
}


async function serverTable(knex) {
    let data = await request(process.env.SERVERS_URL);

    for (const el of data.servers) {

        let server = await knex('servers').where('uuid', el.uuid).select('uuid');

        if(server.length < 1) {
            let data2 = await request(`${process.env.SERVER_URL}?uuid=${el.uuid}&icons=true`);
            insertServer(knex, data2);
        }

    };
}

async function insertPlayer(knex, data) {
    if(data.players.length != 0) {
        let id = await getServerID(knex, data.uuid);

        for (const player of data.players) { 

        let p = await knex('server_players').where({'player': player.username, 'uuid': data.uuid}).select('player');

        if(p.length < 1) {
            await knex('server_players').insert({
                server_id: id,
                uuid: data.uuid,
                player: player.username,
                date: moment().format('X'),
                lastUpdated: moment().format('X')
            });
        }
        else {
            updatePlayerDate(knex, id, player.username)
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
            serverIP: data.serverIP,
            numericalIP: data.numericalIP,
            whitelist: data.whitelist,
            authenticated: data.authenticated,
            onlineMode: data.onlineMode,
            lastUpdated: moment().format('X'),
            date: moment().format('X')
    });
}

async function insertCount(knex, data) {

            let id = await getServerID(knex, data.uuid);

            await knex('server_player_count').insert({
                server_id: id,
                uuid: data.uuid,
                onlinePlayers: data.onlinePlayers,
                date: moment().format('X')
            });
        }


async function request(url) {
    let data = '';
    try {
    await axios.get(url)
        .then(async function (response) {

            if (response.status != 200) {
                data = false;
            } else {
                data = response.data;
            }
        });
    }
    catch(e) {
        data = false;
    }
    return data
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

async function updateServerTable(knex) {
    let data = await request(process.env.SERVERS_URL);

    for (const el of data.servers) {
        let server = await knex('servers').where('uuid', el.uuid).select('id');

        if(server.length == 1) {
            let data2 = await request(`${process.env.SERVER_URL}?uuid=${el.uuid}&icons=true`);
            updateServer(knex, data2, server[0].id);
        }

    };
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
            numericalIP: data.numericalIP,
            whitelist: data.whitelist,
            authenticated: data.authenticated,
            onlineMode: data.onlineMode,
            lastUpdated: moment().format('X')
    });
}

module.exports = {
    createTables, 
    getServerInformation, 
    getStats,
    getServerHistory,
    getGlobalHistory,
    getServerInformationByID,
    serverData,
    request,
    updateServerTable,
    getServerPlayers,
    getPlayer,
    getServers,
    serverTable
};
