const knex = require('../functions/knex');
const m = require('../functions/main');
const cron = require('node-cron');

require('dotenv').config({path: '../.env'});

const promiseExecutionServer = async (m,knex) => {
    m.updateServerTable(knex)
};

const promiseExecutionServerData = async (m,knex) => {
    m.serverData(knex)
};

const promiseExecutionServerClear = async (m,knex) => {
    m.purgeOldEntries(knex)
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