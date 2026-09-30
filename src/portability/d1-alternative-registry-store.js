import { createAlternativeRegistry } from './prevalidated-alternative-registry.js';

const STORE_ID='technical-sovereignty-alternatives';

function parse(value,fallback){
  try{return JSON.parse(value);}catch{return fallback;}
}

export class D1AlternativeRegistryStore{
  constructor(db,{id=STORE_ID}={}){
    if(!db) throw Object.assign(new Error('ALTERNATIVE_REGISTRY_DB_REQUIRED'),{code:'ALTERNATIVE_REGISTRY_DB_REQUIRED'});
    this.db=db;
    this.id=String(id||STORE_ID).slice(0,200);
    this._ready=false;
  }

  async ready(){
    if(this._ready)return this;
    await this.db.prepare(`CREATE TABLE IF NOT EXISTS mel_alternative_registry (
      id TEXT PRIMARY KEY,
      registry_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )`).run();
    this._ready=true;
    return this;
  }

  async load(){
    await this.ready();
    const row=await this.db.prepare(
      'SELECT registry_json,updated_at FROM mel_alternative_registry WHERE id=?'
    ).bind(this.id).first();
    if(!row?.registry_json) return createAlternativeRegistry([]);
    const parsed=parse(row.registry_json,null);
    if(!parsed?.all || !Array.isArray(parsed.all)) return createAlternativeRegistry([]);
    return createAlternativeRegistry(parsed.all);
  }

  async save(registry){
    await this.ready();
    const normalized=createAlternativeRegistry(registry?.all||[]);
    const updatedAt=Date.now();
    await this.db.prepare(`INSERT INTO mel_alternative_registry(id,registry_json,updated_at)
      VALUES(?,?,?)
      ON CONFLICT(id) DO UPDATE SET
        registry_json=excluded.registry_json,
        updated_at=excluded.updated_at`)
      .bind(this.id,JSON.stringify(normalized),updatedAt).run();
    return {ok:true,id:this.id,updated_at:updatedAt,count:normalized.all.length};
  }
}

export function createD1AlternativeRegistryStore(db,options){
  return new D1AlternativeRegistryStore(db,options);
}
