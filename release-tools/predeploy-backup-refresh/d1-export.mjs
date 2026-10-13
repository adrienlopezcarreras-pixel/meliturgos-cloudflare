// Fail-closed logical D1 export for the ephemeral predeploy backup sidecar.
// The sidecar caps read offsets at 250_000; never silently truncate.
export const D1_PAGE_SIZE = 500;
export const MAX_ROWS_PER_TABLE = 250_000;

export async function exportD1(sidecar, sidecarJson, {
  pageSize = D1_PAGE_SIZE,
  maxRowsPerTable = MAX_ROWS_PER_TABLE,
} = {}) {
  if (typeof sidecarJson !== 'function') throw new Error('D1_SIDECAR_REQUIRED');
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > D1_PAGE_SIZE) throw new Error('D1_PAGE_SIZE_INVALID');
  if (!Number.isInteger(maxRowsPerTable) || maxRowsPerTable < 1 || maxRowsPerTable > MAX_ROWS_PER_TABLE) {
    throw new Error('D1_MAX_ROWS_INVALID');
  }
  const discovered = await sidecarJson(sidecar, '/d1/tables');
  if (discovered?.status !== 'D1_TABLES' || !Array.isArray(discovered.tables)) {
    throw new Error('D1_TABLE_DISCOVERY_INVALID');
  }
  const tables = [];
  for (const descriptor of discovered.tables) {
    const name = String(descriptor?.name || '').trim();
    if (!name || name.startsWith('_cf_')) continue;
    const tableRows = [];
    let offset = 0;
    while (true) {
      const qs = new URLSearchParams({ table: name, offset: String(offset), limit: String(pageSize) });
      const page = await sidecarJson(sidecar, `/d1/rows?${qs.toString()}`);
      if (page?.status !== 'D1_ROWS_PAGE' || String(page?.table || '') !== name
          || !Array.isArray(page.rows) || Number(page.offset) !== offset
          || Number(page.limit) !== pageSize || typeof page.has_more !== 'boolean'
          || page.rows.length > pageSize) {
        throw new Error(`D1_ROWS_PAGE_INVALID:${name}`);
      }
      if (page.has_more && page.rows.length !== pageSize) throw new Error(`D1_PAGINATION_STALLED:${name}`);
      if (tableRows.length + page.rows.length > maxRowsPerTable) throw new Error(`BACKUP_TABLE_ROW_LIMIT:${name}`);
      tableRows.push(...page.rows);
      if (page.has_more !== true) break;
      if (page.rows.length === 0) throw new Error(`D1_PAGINATION_STALLED:${name}`);
      offset += page.rows.length;
      if (offset > MAX_ROWS_PER_TABLE) throw new Error(`BACKUP_TABLE_ROW_LIMIT:${name}`);
    }
    tables.push({ name, schema: descriptor?.schema || null, rowCount: tableRows.length, rows: tableRows });
  }
  return { type: 'MEL_D1_LOGICAL_EXPORT_V1', tableCount: tables.length, tables };
}
