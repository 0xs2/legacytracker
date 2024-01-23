const knex = require('./functions/knex');
const m = require('./functions/main');
const cron = require('node-cron');

require('dotenv').config({path: './.env'});

const promiseExecutionServer = async (m,knex) => {
    // hide all because servers can be removed from the list, if it is fetched it is shown
    await m.hideAll(knex);

    let data = await m.request(process.env.SERVERS_URL);

    if(data) {     
        for (const el of data.servers) {
            let server = await knex('servers').where('uuid', el.uuid).select('id');
            let data2 = await m.request(`${process.env.SERVER_URL}?uuid=${el.uuid}&icons=true`);

            if(data2) {        
                if(server.length == 1) {
                    m.updateServer(knex, data2, server[0].id);
                }
                else {
                    // if not found insert a new server and it's data
                    m.insertServer(knex, data2);
                    m.insertPlayer(knex, data2);
                    m.insertCount(knex, data2);
                }
            }
        }
    }
};

const promiseExecutionServerData = async (m,knex) => {
    // only update the 'active' servers
    let servers = await knex('servers').where({isActive: true}).select();

    for (const el of servers) {
        let data2 = await m.request(`${process.env.SERVER_URL}?uuid=${el.uuid}&icons=true`);

        // don't do anything if it fucks up
        if(data2) {
            m.insertPlayer(knex, data2);
            m.insertCount(knex, data2);
        }
    }
};

const promiseExecutionServerClear = async (m,knex) => {
    await m.purgeOldEntries(knex)
};

cron.schedule('* * * * *', async () => {
    promiseExecutionServerData(m,knex)
});

cron.schedule('*/10 * * * *', () => {
    promiseExecutionServer(m,knex);
});


cron.schedule('0 0 * * *', () => {
    promiseExecutionServerClear(m,knex);
});