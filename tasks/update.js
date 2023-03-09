const knex = require('../functions/knex');
const axios = require('axios');
const moment = require('moment');
var cron = require('node-cron');

require('dotenv').config({path: '../.env'});

let promiseExecution = async (knex) => {
    updateServerTable(knex)
};
cron.schedule('0 0 * * *', () => {
    promiseExecution(knex);
});

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
