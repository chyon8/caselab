const { Pool } = require('@neondatabase/serverless');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const { rows } = await pool.query(`
    SELECT status, count(*)
    FROM projects
    WHERE contract_amount = 0
    GROUP BY status;
  `);
  console.log("contract_amount = 0 cases:", rows);

  const { rows: r2 } = await pool.query(`
    SELECT count(*)
    FROM projects
    WHERE contract_amount IS NOT NULL AND contract_amount > 0 AND budget > 0;
  `);
  console.log("valid contract_amount cases:", r2);

  const { rows: r3 } = await pool.query(`
    SELECT 
      count(*) as total,
      count(*) FILTER (WHERE contract_amount > budget) as increased,
      count(*) FILTER (WHERE contract_amount = budget) as same,
      count(*) FILTER (WHERE contract_amount < budget) as decreased
    FROM projects
    WHERE contract_amount > 0 AND budget > 0
  `);
  console.log("budget delta when contract_amount > 0:", r3[0]);

  pool.end();
}
main();
