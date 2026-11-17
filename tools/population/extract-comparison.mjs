import fs from 'node:fs';
import readline from 'node:readline';
import {candidateFeatures,COMPARISON_FEATURE_METHOD} from '../../web/src/experimental/features.ts';
const [input,output]=process.argv.slice(2),rows=[];let rejected=0;
for await(const line of readline.createInterface({input:fs.createReadStream(input),crlfDelay:Infinity})){
 const r=JSON.parse(line),result=candidateFeatures(r.ppg,r.acc,r.heart,r.history);
 if(result)rows.push({subject:r.subject,session:r.session,label:r.label,endSeconds:r.endSeconds,...result});else rejected++;
}
fs.writeFileSync(output,JSON.stringify({featureMethod:COMPARISON_FEATURE_METHOD,rows}));
console.log(JSON.stringify({rows:rows.length,subjects:new Set(rows.map(r=>r.subject)).size,prv:rows.filter(r=>r.features.prvAvailable).length,counts:[0,1,2].map(v=>rows.filter(r=>r.label===v).length),rejected}));
