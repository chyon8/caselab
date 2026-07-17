const { Pool } = require('@neondatabase/serverless');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const { rows } = await pool.query(`
    SELECT *
    FROM projects
    WHERE budget > 0 AND contract_amount IS NOT NULL
    LIMIT 10;
  `);
  
  for (const row of rows) {
    console.log(`id: ${row.id}, budget: ${row.budget}, contract: ${row.contract_amount}, same: ${row.budget == row.contract_amount}`);
  }
  pool.end();
}
main();
