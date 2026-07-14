require('dotenv').config({ path: '.env.local' });
const { Pool } = require('@neondatabase/serverless');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT column_name, data_type FROM information_schema.columns WHERE table_name = \'timeline_events\';')
  .then(res => { console.log(res.rows); pool.end(); })
  .catch(err => { console.error(err); pool.end(); });
