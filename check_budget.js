const { Pool } = require('@neondatabase/serverless');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const { rows } = await pool.query(`
    SELECT 
      count(*) as total,
      count(*) FILTER (WHERE contract_amount > budget) as increased,
      count(*) FILTER (WHERE contract_amount = budget) as same,
      count(*) FILTER (WHERE contract_amount < budget) as decreased
    FROM projects
    WHERE contract_amount IS NOT NULL AND budget > 0
  `);
  console.log(rows[0]);
  pool.end();
}
main();
