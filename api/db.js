const postgress = require('postgres');
require('dotenv').config();

const sql = postgress(process.env.DATABASE_URL, { ssl: 'require' });

module.exports = sql