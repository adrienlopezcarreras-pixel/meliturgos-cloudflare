// D1 access stays in MEL's existing CapabilityBus and Worker DB binding.
// SQL is compiled from validated identifiers and bound scalar values: callers
// cannot supply statements or chain arbitrary SQL/DDL. No migration is needed.
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const SENSITIVE = /(?:secret|password|token|credential|oauth|cookie|authorization|api_?key|private_?key|refresh_?key)/i;
const MAX_READ_ROWS = 50;
const MAX_WRITE_ROWS = 5;

function d1Error(code, status = 400) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

function identifier(name) {
  if (typeof name !== 'string' || !IDENTIFIER.test(name) || /^sqlite_/i.test(name)) {
    throw d1Error('D1_INVALID_IDENTIFIER');
  }
  return '"' + name + '"';
}

function visible(name) {
  return typeof name === 'string' && IDENTIFIER.test(name)
    && !/^sqlite_/i.test(name) && !/^d1_migrations$/i.test(name)
    && !SENSITIVE.test(name);
}

function requireVisible(name) {
  if (!visible(name)) throw d1Error('D1_PROTECTED_IDENTIFIER', 403);
  return identifier(name);
}

function cleanScalar(value) {
  if (value === null) return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.length <= 4096) return value;
  throw d1Error('D1_INVALID_VALUE');
}

function cleanPairs(value, { required = true, maximum = 8 } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    if (required) throw d1Error('D1_FIELDS_REQUIRED');
    return [];
  }
  const pairs = Object.entries(value);
  if (pairs.length > maximum || (required && !pairs.length)) throw d1Error('D1_INVALID_FIELDS');
  return pairs.map(([key, entry]) => {
    requireVisible(key);
    return [key, cleanScalar(entry)];
  });
}

function ensureColumns(pairs, columnNames) {
  for (const [key] of pairs) {
    if (!columnNames.has(key.toLowerCase())) throw d1Error('D1_UNKNOWN_COLUMN');
  }
}

function requireDb(db) {
  if (!db || typeof db.prepare !== 'function') throw d1Error('D1_BINDING_UNAVAILABLE', 503);
  return db;
}

async function tableColumns(db, table) {
  requireVisible(table);
  // Both existence and type are checked: never execute against an arbitrary view.
  const found = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? COLLATE NOCASE")
    .bind(table).first();
  if (!found?.name || !visible(found.name)) throw d1Error('D1_TABLE_NOT_FOUND', 404);
  const rows = (await db.prepare('PRAGMA table_info(' + identifier(found.name) + ')').all()).results || [];
  if (!rows.length) throw d1Error('D1_TABLE_SCHEMA_UNAVAILABLE', 503);
  return { name: found.name, columns: rows };
}

function publicColumns(columns) {
  return columns.filter(row => visible(row?.name)).map(row => ({
    name: row.name, type: String(row.type || ''), not_null: Boolean(row.notnull), primary_key: Boolean(row.pk),
  }));
}

async function schema(db, input) {
  requireDb(db);
  if (input.table) {
    const { name, columns } = await tableColumns(db, input.table);
    return { table: name, columns: publicColumns(columns) };
  }
  const rows = (await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name LIMIT 500").all()).results || [];
  return { tables: rows.map(row => row.name).filter(visible), truncated: rows.length >= 500 };
}

async function read(db, input) {
  requireDb(db);
  const { name, columns } = await tableColumns(db, input.table);
  const known = new Set(publicColumns(columns).map(row => row.name.toLowerCase()));
  const selected = input.columns?.length ? input.columns : publicColumns(columns).map(row => row.name);
  if (!selected.length || selected.length > 24) throw d1Error('D1_INVALID_COLUMNS');
  for (const column of selected) {
    requireVisible(column);
    if (!known.has(column.toLowerCase())) throw d1Error('D1_UNKNOWN_COLUMN');
  }
  const filters = cleanPairs(input.where || {}, { required: false, maximum: 8 });
  ensureColumns(filters, known);
  const order = input.order_by ? requireVisible(input.order_by) : null;
  if (order && !known.has(input.order_by.toLowerCase())) throw d1Error('D1_UNKNOWN_COLUMN');
  const limit = Math.min(MAX_READ_ROWS, input.limit || 20);
  const offset = input.offset || 0;
  const where = filters.length ? ' WHERE ' + filters.map(([column]) => identifier(column) + ' IS ?').join(' AND ') : '';
  const sorting = order ? ' ORDER BY ' + identifier(input.order_by) + (input.descending ? ' DESC' : ' ASC') : '';
  const sql = 'SELECT ' + selected.map(identifier).join(', ') + ' FROM ' + identifier(name)
    + where + sorting + ' LIMIT ? OFFSET ?';
  const result = await db.prepare(sql).bind(...filters.map(([, value]) => value), limit, offset).all();
  const rows = result.results || [];
  if (JSON.stringify(rows).length > 96_000) throw d1Error('D1_RESULT_TOO_LARGE', 413);
  return { table: name, columns: selected, rows, count: rows.length, limit, offset };
}

async function write(db, input) {
  requireDb(db);
  const { name, columns } = await tableColumns(db, input.table);
  const known = new Set(publicColumns(columns).map(row => row.name.toLowerCase()));
  const operation = input.operation;
  const values = operation === 'delete' ? [] : cleanPairs(input.values, { maximum: 16 });
  ensureColumns(values, known);
  let sql, parameters;
  if (operation === 'insert') {
    if (input.where !== undefined) throw d1Error('D1_INSERT_WHERE_FORBIDDEN');
    sql = 'INSERT INTO ' + identifier(name) + ' (' + values.map(([name]) => identifier(name)).join(', ')
      + ') VALUES (' + values.map(() => '?').join(', ') + ')';
    parameters = values.map(([, value]) => value);
  } else if (operation === 'update' || operation === 'delete') {
    if (operation === 'delete' && input.values !== undefined) throw d1Error('D1_DELETE_VALUES_FORBIDDEN');
    const filters = cleanPairs(input.where, { maximum: 8 });
    ensureColumns(filters, known);
    const predicate = filters.map(([column]) => identifier(column) + ' IS ?').join(' AND ');
    const limit = Math.min(MAX_WRITE_ROWS, input.limit || 1);
    const target = 'rowid IN (SELECT rowid FROM ' + identifier(name) + ' WHERE ' + predicate
      + ' ORDER BY rowid LIMIT ?)';
    sql = operation === 'update'
      ? 'UPDATE ' + identifier(name) + ' SET ' + values.map(([column]) => identifier(column) + ' = ?').join(', ')
        + ' WHERE ' + target
      : 'DELETE FROM ' + identifier(name) + ' WHERE ' + target;
    parameters = [...(operation === 'update' ? values.map(([, value]) => value) : []),
      ...filters.map(([, value]) => value), limit];
  } else {
    throw d1Error('D1_INVALID_OPERATION');
  }
  const result = await db.prepare(sql).bind(...parameters).run();
  if (result.success === false) throw d1Error('D1_WRITE_FAILED', 502);
  return { table: name, operation, changes: Number(result?.meta?.changes || 0), approved: true };
}

const tableInput = { type: 'string', minLength: 1, maxLength: 64 };
const fieldsInput = { type: 'object', additionalProperties: true };
const columnsInput = { type: 'array', items: tableInput, minItems: 1, maxItems: 24 };

export function registerD1ConsoleCapabilities(bus, { db } = {}) {
  const health = db && typeof db.prepare === 'function' ? 'HEALTHY' : 'UNAVAILABLE';
  const common = {
    category: 'database', version: '1.0.0', provider: 'core',
    output_schema: { type: 'object', additionalProperties: true }, health, enabled: true,
  };
  bus.discover({
    ...common, id: 'd1.schema', name: 'Inspecter le schéma D1',
    description: 'List accessible D1 tables or inspect safe column metadata, without accessing row content.',
    risk: 'LOW', permissions: ['d1.read'],
    input_schema: { type: 'object', properties: { table: tableInput }, additionalProperties: false },
  }, input => schema(db, input));

  bus.discover({
    ...common, id: 'd1.read', name: 'Lire des lignes D1',
    description: 'Runs bounded parameterized SQL SELECT against one accessible D1 table; equality filters, column selection and pagination. No raw SQL.',
    risk: 'LOW', permissions: ['d1.read'],
    input_schema: {
      type: 'object', properties: {
        table: tableInput, columns: columnsInput, where: fieldsInput,
        order_by: tableInput, descending: { type: 'boolean' },
        limit: { type: 'integer', minimum: 1, maximum: MAX_READ_ROWS },
        offset: { type: 'integer', minimum: 0, maximum: 10000 },
      }, required: ['table'], additionalProperties: false,
    },
  }, input => read(db, input));

  bus.discover({
    ...common, id: 'd1.write', name: 'Modifier des lignes D1 avec approbation',
    description: 'Executes one parameterized INSERT/UPDATE/DELETE (at most five matched rows; update/delete require WHERE). Requires separate owner permission AND explicit owner approval.',
    risk: 'HIGH', permissions: ['d1.write'],
    approval: { required: true, scope: 'd1.write', reason: 'Owner must explicitly approve database modification' },
    input_schema: {
      type: 'object', properties: {
        operation: { type: 'string', enum: ['insert', 'update', 'delete'] },
        table: tableInput, values: fieldsInput, where: fieldsInput,
        limit: { type: 'integer', minimum: 1, maximum: MAX_WRITE_ROWS },
      }, required: ['operation', 'table'], additionalProperties: false,
    },
  }, input => write(db, input));
}
