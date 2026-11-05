// Offline audit only. Does not start sensors, alter labels, or train a model.
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {analyzeLiveWindow,liveWindowReasons} from '../../web/src/domain/liveWindow.ts';
import {extractMultisensorFeatures} from '../../web/src/domain/multisensorFeatures.ts';

const [directory,captureDirectory]=process.argv.slice(2);
if(!directory || !captureDirectory)throw new Error('Provide observer directory and capture directory');
const monitor=fs.readFileSync(path.join(directory,'monitor.jsonl'),'utf8').trim().split(/\r?\n/).map(line=>JSON.parse(line));
const summary=JSON.parse(fs.readFileSync(path.join(directory,'summary.json'),'utf8'));
const sessionId=monitor[0].sessionId;
const afterWarmup=monitor.filter(row=>row.elapsed>=150);
const reasons={};
for(const row of afterWarmup)for(const reason of row.reasons??[])reasons[reason]=(reasons[reason]??0)+1;
const snapshots=[];
for(const name of fs.readdirSync(directory).filter(name=>/^window-\d+s\.json\.gz$/.test(name))){
  const window=JSON.parse(gunzipSync(fs.readFileSync(path.join(directory,name))).toString('utf8'));
  const features=extractMultisensorFeatures(window,window.lastReceivedAt);
  snapshots.push({elapsed:Number(name.match(/\d+/)[0]),coreAvailable:features.coreAvailable,reasons:features.reasons,
    prvAvailable:features.features?.prvAvailable??false,features:features.features});
}
snapshots.sort((a,b)=>a.elapsed-b.elapsed);
const captures=[];
for(const name of fs.readdirSync(captureDirectory).filter(name=>name.endsWith('.json.gz'))){
  const capture=JSON.parse(gunzipSync(fs.readFileSync(path.join(captureDirectory,name))).toString('utf8'));
  if(capture.window.sessionId!==sessionId)continue;
  const analysis=analyzeLiveWindow(capture.window);
  const rejected=liveWindowReasons(capture.window,analysis,capture.capturedAt);
  const extra=extractMultisensorFeatures(capture.window,capture.capturedAt);
  captures.push({captureId:capture.captureId,capturedAt:capture.capturedAt,score:capture.subjectiveStress0to10,
    targetSeconds:capture.subjectiveWindowSeconds,events:capture.window.report.events.length,ready:!rejected.length,
    reasons:rejected,researchCoreAvailable:extra.coreAvailable,researchReasons:extra.reasons,
    researchPrvAvailable:extra.features?.prvAvailable??false,usedForCurrentModel:false});
}
captures.sort((a,b)=>a.capturedAt-b.capturedAt);
const audit={sessionId,summary,afterWarmupPolls:afterWarmup.length,readyAfterWarmup:afterWarmup.filter(row=>row.ready).length,
  reasonPollCounts:reasons,disconnectedPolls:monitor.filter(row=>!row.connected).length,
  offBodyPolls:monitor.filter(row=>row.sensorWorn===false).length,
  unknownWearPolls:monitor.filter(row=>row.sensorWorn!==true && row.sensorWorn!==false).length,
  maxDropped:Math.max(...monitor.map(row=>row.dropped??0)),maxStreamErrors:Math.max(...monitor.map(row=>row.streamErrors??0)),
  batteryStart:monitor[0].battery,batteryEnd:monitor.at(-1).battery,
  snapshots,captures,
  limitations:['One person, one session; overlapping observations are not independent trials.',
    'Research feature availability is evaluated at the last packet reception time, not an accuracy result.',
    'No stress score, HRV accuracy claim, or model training is produced.']};
fs.writeFileSync(path.join(directory,'ordinary-use-audit.json'),JSON.stringify(audit,null,2));
fs.writeFileSync(path.join(directory,'capture-check.json'),JSON.stringify(captures,null,2));
console.log(JSON.stringify({...audit,snapshots:{count:snapshots.length,coreAvailable:snapshots.filter(row=>row.coreAvailable).length,
  prvAvailable:snapshots.filter(row=>row.prvAvailable).length}},null,2));
