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

cron.schedule('*/10 * * * *', () => {
    promiseExecutionServer(m,knex);
});


cron.schedule('* * * * *', async () => {
    promiseExecutionServerData(m,knex)
});
