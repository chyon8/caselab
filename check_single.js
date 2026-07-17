const { Pool } = require('@neondatabase/serverless');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const { rows: proj } = await pool.query("SELECT embedding::text FROM projects WHERE id = '154164'");
  const vec = proj[0].embedding;

  const { rows } = await pool.query(`
    WITH pool AS MATERIALIZED (
      SELECT p.contract_amount, p.budget
      FROM projects p
      WHERE p.id <> '154164' AND p.embedding IS NOT NULL AND p.deleted_at IS NULL AND p.hidden = false
      ORDER BY p.embedding <=> $1::vector
      LIMIT 50
    )
    SELECT 
      count(*) as total,
      count(*) FILTER (WHERE contract_amount > budget) as increased,
      count(*) FILTER (WHERE contract_amount = budget) as same,
      count(*) FILTER (WHERE contract_amount < budget) as decreased
    FROM pool
    WHERE contract_amount > 0 AND budget > 0
  `, [vec]);
  console.log("similar pool budget delta:", rows[0]);
  pool.end();
}
main();
