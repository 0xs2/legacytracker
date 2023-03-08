module.exports = function (app,knex,sortArray) {

    app.get("/", async (req,res) => {
        res.render("index", {data: await getServerInformation(knex,sortArray)});
    });

    app.get("/server/:id", async (req,res) => {
        let data = await getServerInformationByID(req.params.id, knex);
        if(!data) {
            res.status(404).send("not found");
        }
        else {
            res.render("server", {data: data});
        }
    });

    app.get("/api/getServerHistory", async (req,res) => {
        res.json(await getServerHistory(req.query['id'], knex));
    });

    app.get("/api/getGlobalHistory", async (req,res) => {
        res.json(await getGlobalHistory(knex));
    });

    app.all('*', (req, res) => {
        res.status(404).send("not found");
      });
}


async function getServerInformationByID(id, knex) {
    let server = await knex('servers').where("id", id).select();

    if(server.length != 1) {
        return false;
    }
    else {
        return await getData(server[0], knex);
    }

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

async function getServerHistory(q, knex) { 
    let data = await knex('server_player_count').where("server_id", q).select(["onlinePlayers","date"]).limit(25).orderBy("date", "desc");

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
        onlinemode: Boolean(el.onlineMode)
    };
}

async function getGlobalHistory(knex) { 
    let final = [];
    let data = await knex('servers').select();
    let timestamps = [];

    for(const el of data) {
        let data2 = await knex('server_player_count').where("uuid", el.uuid).select(["onlinePlayers","date"]).limit(20).orderBy("date", "desc");

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
    return {servers: final, timestamps: timestamps.slice(0, 20).reverse(), success: true};
}