module.exports = require('knex')({
    client: 'sqlite3',
    connection: {
        filename: '/home/sui/slt/slt.db',
    },
    useNullAsDefault: true
});