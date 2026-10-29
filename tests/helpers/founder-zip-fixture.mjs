const utf8 = new TextEncoder();
export export function zipOne(name, data) {
  const n=utf8.encode(name), d=utf8.encode(JSON.stringify(data));
  let crc=0xffffffff;
  for (const x of d) { crc^=x; for(let k=0;k<8;k++) crc=(crc>>>1)^((crc&1)?0xedb88320:0); }
  crc=(crc^0xffffffff)>>>0;
  const local=new Uint8Array(30+n.length+d.length), lv=new DataView(local.buffer);
  lv.setUint32(0,0x04034b50,true); lv.setUint16(4,20,true); lv.setUint32(14,crc,true);
  lv.setUint32(18,d.length,true); lv.setUint32(22,d.length,true); lv.setUint16(26,n.length,true);
  local.set(n,30);local.set(d,30+n.length);
  const central=new Uint8Array(46+n.length),cv=new DataView(central.buffer);
  cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);
  cv.setUint32(16,crc,true);cv.setUint32(20,d.length,true);cv.setUint32(24,d.length,true);
  cv.setUint16(28,n.length,true);central.set(n,46);
  const end=new Uint8Array(22),ev=new DataView(end.buffer);
  ev.setUint32(0,0x06054b50,true);ev.setUint16(8,1,true);ev.setUint16(10,1,true);
  ev.setUint32(12,central.length,true);ev.setUint32(16,local.length,true);
  const all=new Uint8Array(local.length+central.length+end.length);
  all.set(local);all.set(central,local.length);all.set(end,local.length+central.length);
  return all;
}
