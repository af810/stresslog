import fs from 'node:fs';
import readline from 'node:readline';
import {populationFeatures,POPULATION_FEATURE_METHOD} from '../../web/src/domain/populationFeatures.ts';
import {intervalMetrics,median} from '../../web/src/domain/prv.ts';
const [source,output]=process.argv.slice(2);
if(!source||!output)throw Error('Provide prepared windows.jsonl and output feature file');
const rows=[],wristRows=[];let rejected=0;
for await(const line of readline.createInterface({input:fs.createReadStream(source),crlfDelay:Infinity})){
  const row=JSON.parse(line);
  const wrist=populationFeatures(row.ppg,row.acceleration);
  if(wrist)wristRows.push({subject:row.subject,startSeconds:row.startSeconds,condition:row.condition,label:row.label,features:wrist});
  const validIntervals=values=>values.map((v,i)=>v>=300&&v<=2000&&Math.abs(v-median(values.slice(Math.max(0,i-5),i+6)))<=.2*median(values.slice(Math.max(0,i-5),i+6)));
  const valid=validIntervals(row.referenceIntervals);
  const heart=valid.filter(Boolean).length>=.8*valid.length?row.referenceIntervals.filter((_,i)=>valid[i]).map(v=>60000/v):[];
  const features=populationFeatures(null,row.acceleration,heart,'reference');
  if(features){
    const rr=row.referencePrvIntervals,accepted=validIntervals(rr),metrics=intervalMetrics(rr,accepted);
    const validMs=rr.reduce((sum,v,i)=>sum+(accepted[i]?v:0),0);
    if(metrics?.lnRmssd!==null&&metrics&&metrics.sdnn>0&&metrics.pairCount>=20&&validMs>=40000&&accepted.filter(Boolean).length>=.95*accepted.length){
      features.prvAvailable=true;features.lnRmssd=metrics.lnRmssd;features.lnSdnn=Math.log(metrics.sdnn);features.pnn50=metrics.pnn50;features.variabilitySource='ecg';
    }
  }
  if(features)rows.push({subject:row.subject,startSeconds:row.startSeconds,condition:row.condition,label:row.label,features});
  else rejected++;
}
fs.writeFileSync(output,JSON.stringify({featureMethod:POPULATION_FEATURE_METHOD,cardiacReference:'ECG',rejected,rows,wristRows}));
console.log(JSON.stringify({windows:rows.length,rejected,hrvWindows:rows.filter(r=>r.features.prvAvailable).length,subjects:new Set(rows.map(r=>r.subject)).size,wristReplayWindows:wristRows.length}));
