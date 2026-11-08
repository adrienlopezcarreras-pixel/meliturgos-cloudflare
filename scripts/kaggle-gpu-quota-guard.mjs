import fs from 'node:fs';

export function inspectKaggleGpuQuota(quota) {
  if (!Array.isArray(quota)) return {status:'UNKNOWN'};
  const gpu=quota.find(item=>String(item?.resource||'').toUpperCase()==='GPU');
  if(!gpu) return {status:'UNKNOWN'};
  const value=String(gpu.remaining??'').trim();
  // Kaggle CLI formats hours as "0.00h"; do not infer exhaustion
  // from missing, malformed or otherwise unrecognized quota data.
  if(!/^\d+(?:\.\d+)?h$/.test(value)) return {status:'UNKNOWN'};
  return Number.parseFloat(value)===0?{status:'EXHAUSTED'}:{status:'AVAILABLE'};
}

if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
  const path=process.argv[2];
  if(!path){console.error('KAGGLE_QUOTA_PATH_REQUIRED');process.exitCode=2;}
  else{
    let result={status:'UNKNOWN'};
    try{result=inspectKaggleGpuQuota(JSON.parse(fs.readFileSync(path,'utf8')));}
    catch{console.log('KAGGLE_GPU_QUOTA_UNKNOWN');}
    if(result.status==='EXHAUSTED'){
      console.error('KAGGLE_GPU_WEEKLY_QUOTA_EXHAUSTED: 0.00h of free GPU remaining. Training submission withheld.');
      process.exitCode=3;
    }else if(result.status==='AVAILABLE')console.log('KAGGLE_GPU_QUOTA_AVAILABLE');
    else console.log('KAGGLE_GPU_QUOTA_UNKNOWN');
  }
}
