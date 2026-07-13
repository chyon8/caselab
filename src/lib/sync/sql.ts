/** ($1,$2,$3),($4,$5,$6) ... 형태의 VALUES 절 생성 */
export function valuesClause(rowCount: number, colCount: number): string {
  const rows: string[] = [];
  let n = 1;
  for (let r = 0; r < rowCount; r++) {
    const placeholders: string[] = [];
    for (let c = 0; c < colCount; c++) placeholders.push(`$${n++}`);
    rows.push(`(${placeholders.join(",")})`);
  }
  return rows.join(",");
}
