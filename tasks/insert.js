const knex = require('../functions/knex');
const axios = require('axios');
const moment = require('moment');

require('dotenv').config({path: '../.env'});

serverData(knex)

// handle the main server table


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


async function insertPlayer(knex, data) {
    if(data.players.length != 0) {
        for (const player of data.players) { 

        let p = await knex('server_players').where('player', player.username).select('player');

        if(p.length < 1) {
            let id = await getServerID(knex, data.uuid);

            await knex('server_players').insert({
                server_id: id,
                uuid: data.uuid,
                player: player.username,
                date: moment().format('X')
            });
        }
    }
}
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
    await axios.get(url)
        .then(async function (response) {

            if (response.status != 200) {
                console.log("error")
            } else {
                data = response.data;
            }
        });
    return data
}

async function getServerID(knex, uuid) {
    let data = await knex("servers").where("uuid", uuid).select("id");
    return data[0].id; 
}
