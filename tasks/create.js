const knex = require('../functions/knex');

require('dotenv').config({path: '../.env'});

Promise.all([
    createTables(knex)
      ]).then(() => {
      process.exit(0);
})

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
                });
            }
        });
    } catch (err) {
        console.error(err);
    }
}