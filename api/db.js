const postgress = require('postgres');
require('dotenv').config();

const sql = postgress(process.env.DATABASE_URL, {
  ssl: 'require',
  connect_timeout: 10,  // seconds — handle Neon cold-start wake delays
  idle_timeout: 20,     // seconds — release idle connections before Neon drops them
  max_lifetime: 1800,   // seconds — 30 min max connection lifetime
  max: 5,               // stay within Neon free-tier connection limit
});

module.exports = sql