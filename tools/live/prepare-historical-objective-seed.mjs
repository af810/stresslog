// Explicit developer migration of existing watch recordings. No ratings read,
// signal gates relaxed, network requests, or sensor start/stop operations.
// Usage: node tools/live/prepare-historical-objective-seed.mjs REPLAY.json VALIDATION_ROOT OUTPUT.json
import fs from 'node:fs';
import path from 'node:path';
import {objectiveObservation} from '../../web/src/domain/objectiveStress.ts';
const [replayPath,validationRoot,output]=process.argv.slice(2);
if(!replayPath||!validationRoot||!output)throw Error('Provide replay manifest, validation root, and output file');
const root=path.resolve(validationRoot),manifest=JSON.parse(fs.readFileSync(replayPath,'utf8'));
const candidates=[];
for(const {file} of manifest.windows){
 const source=path.resolve(file);
 if(!source.startsWith(root+path.sep))throw Error('Snapshot outside the designated validation directory');
 const data=JSON.parse(fs.readFileSync(source,'utf8'));
 // These snapshots retain their original connected/fresh/contact metadata;
 // lastReceivedAt anchors the measurement time, not a claim of current data.
 const observation=objectiveObservation(data,data.lastReceivedAt);
 if(observation?.features.prvAvailable)candidates.push({...observation,id:`historical:${observation.sessionId}:${observation.endNs}`});
}
candidates.sort((a,b)=>a.at-b.at);
const records=[];
for(const row of candidates)if(!records.some(old=>old.id===row.id||old.device===row.device&&(
 Math.abs(old.at-row.at)<150000||old.sessionId===row.sessionId&&BigInt(old.endNs)>BigInt(row.startNs)&&BigInt(row.endNs)>BigInt(old.startNs))))records.push(row);
const result={schemaVersion:1,kind:'historical-sensor-only',records};
fs.writeFileSync(output,JSON.stringify(result,null,2),{flag:'wx'});
console.log(JSON.stringify({output:path.resolve(output),candidateCount:candidates.length,nonoverlapping:records.length,
 channels:{5:records.filter(row=>row.features.prvChannel===5).length,6:records.filter(row=>row.features.prvChannel===6).length}}));
