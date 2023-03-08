module.exports = require('knex')({
    client: 'sqlite3',
    connection: {
        filename: '/home/sui/small-legacy-tracker/slt.db',
    },
    useNullAsDefault: true
});