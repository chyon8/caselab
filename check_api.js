const { Pool } = require('@neondatabase/serverless');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const { rows: proj } = await pool.query("SELECT id, embedding::text FROM projects WHERE embedding IS NOT NULL LIMIT 5");
  
  for (const p of proj) {
    const { rows } = await pool.query(`
      WITH pool AS MATERIALIZED (
        SELECT p.contract_amount, p.budget
        FROM projects p
        WHERE p.id <> $2 AND p.embedding IS NOT NULL AND p.deleted_at IS NULL AND p.hidden = false
        ORDER BY p.embedding <=> $1::vector
        LIMIT 50
      )
      SELECT 
        (SELECT count(*) FROM pool WHERE contract_amount IS NOT NULL AND budget > 0 AND contract_amount > budget) AS budget_increased,
        (SELECT count(*) FROM pool WHERE contract_amount IS NOT NULL AND budget > 0 AND contract_amount = budget) AS budget_same,
        (SELECT count(*) FROM pool WHERE contract_amount IS NOT NULL AND budget > 0 AND contract_amount < budget) AS budget_decreased
    `, [p.embedding, p.id]);
    console.log(`id ${p.id}:`, rows[0]);
  }
  pool.end();
}
main();
