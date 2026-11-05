// Public, non-executable research data only. Source and attribution:
// Jarchi & Casson, PhysioNet Wrist 1.0.0, https://doi.org/10.13026/C2PQ1X
// Dataset license: https://physionet.org/content/wrist/1.0.0/ (ODC Attribution).
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const directory=path.resolve(import.meta.dirname,'../../pc-local/live-validation/physionet-wrist-1.0.0');
const base='https://physionet.org/files/wrist/1.0.0/';
await fs.mkdir(directory,{recursive:true});
async function readRemote(name){
  const response=await fetch(base+name,{signal:AbortSignal.timeout(45000)});
  if(!response.ok)throw Error(`${name}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
const manifest=await readRemote('SHA256SUMS.txt');
const entries=manifest.toString('utf8').trim().split(/\r?\n/).map(line=>{
  const match=line.match(/^([a-f0-9]{64})\s+(s\d+_(?:walk|run|low_resistance_bike|high_resistance_bike)\.(?:dat|hea|atr))$/);
  return match && {hash:match[1],name:match[2]};
}).filter(Boolean);
if(entries.length!==57)throw Error('Unexpected reference manifest');
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
let downloaded=0,verified=0;
const queue=[...entries];
await Promise.all(Array.from({length:4},async()=>{
  while(queue.length){
    const entry=queue.shift(),target=path.join(directory,entry.name);
    let data;
    try{data=await fs.readFile(target);}catch(error){if(error.code!=='ENOENT')throw error;}
    if(!data || hash(data)!==entry.hash){
      data=await readRemote(entry.name);
      if(hash(data)!==entry.hash)throw Error(`Checksum mismatch: ${entry.name}`);
      await fs.writeFile(target,data);downloaded++;
    }
    verified++;
  }
}));
await fs.writeFile(path.join(directory,'SHA256SUMS.txt'),manifest);
console.log(JSON.stringify({directory,records:entries.length/3,verified,downloaded}));
