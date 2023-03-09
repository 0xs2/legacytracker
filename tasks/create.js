const m = require('../functions/main');
const knex = require('../functions/knex');
require('dotenv').config({path: '../.env'});

m.createTables(knex)
m.serverTable(knex)