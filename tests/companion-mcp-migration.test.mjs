import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

test('Companion grant migration executes on isolated SQLite and denies by default',()=>{
 const sql=readFileSync('migrations/20261013_companion_mcp_device_grants.sql','utf8');
 const python=`
import sqlite3,sys
db=sqlite3.connect(':memory:')
db.execute("PRAGMA foreign_keys=ON")
db.execute("CREATE TABLE computer_devices(id TEXT PRIMARY KEY)")
db.execute("INSERT INTO computer_devices(id) VALUES ('pc1')")
db.executescript(sys.stdin.read())
columns={r[1]:r for r in db.execute("PRAGMA table_info(companion_mcp_device_grants)")}
assert columns['revoked'][4]=='1'
assert db.execute("SELECT COUNT(*) FROM companion_mcp_device_grants").fetchone()[0]==0
db.execute("INSERT INTO companion_mcp_device_grants(owner_subject,device_id,granted_at,expires_at) VALUES ('owner','pc1',1,2)")
assert db.execute("SELECT revoked FROM companion_mcp_device_grants").fetchone()[0]==1
try:
 db.execute("INSERT INTO companion_mcp_device_grants(owner_subject,device_id,granted_at,expires_at,revoked) VALUES ('other','pc1',1,2,2)")
 raise AssertionError("invalid revoked value accepted")
except sqlite3.IntegrityError: pass
print("MIGRATION_SQLITE_OK")
`;
 const r=spawnSync('python3',['-c',python],{input:sql,encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
 assert.match(r.stdout,/MIGRATION_SQLITE_OK/);
});
