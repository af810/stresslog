/** Offline availability audit. Node >=24; no receiver, watch, or label writes.
 * Usage: node audit-availability.mjs OUTPUT.json SNAPSHOT.json ...
 * Overlapping snapshots are deduplicated, never interpolated. Archive gaps are
 * excluded from the denominator: their cause cannot be inferred from snapshots.
 * The denominator is sampled, overlapping six-minute windows, not independent
 * measurements, daily coverage, stress accuracy, or ECG validation.
 */
import fs from 'node:fs';
import path from 'node:path';
import {analyzeLivePpg, LIVE_METHOD} from '../../web/src/domain/prv.ts';
import {analyzeRestingLivePpg} from '../../web/src/domain/liveAnalysis.ts';
import {motionQuality, heartSensorQuality, wearWindowQuality, QUALITY_METHOD} from '../../web/src/domain/liveQuality.ts';
import {motionExcisionCandidate,MOTION_EXCISION_PROPOSAL} from '../../web/src/domain/motionExcision.ts';
import {shortWindowProposal} from './short-window-proposal.mjs';

const [output, ...files] = process.argv.slice(2);
if (!output || !files.length) throw Error('Specify output JSON and snapshot JSON files');
const ppgType = 'com.google.wear.sensor.ppg';
const second = 1_000_000_000n;
const merged = new Map();
const snapshots = [];
let model, sessionId, reportTemplate;
let duplicates = 0;
for (const file of files) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!data.report?.events?.length || !data.sessionId) throw Error(`Not a receiver snapshot: ${file}`);
  if (model && (data.model !== model || data.sessionId !== sessionId)) throw Error('Mixed watches or sessions');
  model = data.model;
  sessionId = data.sessionId;
  reportTemplate = data.report;
  snapshots.push({file:path.resolve(file), lastReceivedAt:data.lastReceivedAt,
    droppedEvents:data.droppedEvents, streamErrors:data.streamErrors});
  for (const event of data.report.events) {
    const key = `${event.sensorStringType}:${event.sensorTimestampNs}`;
    const prior = merged.get(key);
    if (prior) {
      if (JSON.stringify(prior.values) !== JSON.stringify(event.values) || prior.accuracy !== event.accuracy)
        throw Error(`Conflicting duplicate ${key}`);
      duplicates++;
    } else merged.set(key, event);
  }
}
const events = [...merged.values()].map(event=>({event, time:BigInt(event.sensorTimestampNs)}))
  .sort((a,b)=>a.time < b.time ? -1 : a.time > b.time ? 1 : 0);
const pulses = events.filter(row=>row.event.sensorStringType === ppgType);
if (!pulses.length) throw Error('No PPG events');
const start = pulses[0].time;
const end = pulses.at(-1).time;
const gaps = [];
for (let i=1;i<pulses.length;i++) {
  const delta = pulses[i].time-pulses[i-1].time;
  if (delta > second) gaps.push({start:pulses[i-1].time,end:pulses[i].time});
}

function assess(report, current) {
  try {
    const analysis = current ? analyzeRestingLivePpg(report) : (()=>{
      const result = analyzeLivePpg(report);
      return {result, motion:motionQuality(result.windowReport), trimmedForMotion:false};
    })();
    const {result,motion,trimmedForMotion} = analysis;
    const heart=heartSensorQuality(result.windowReport),wear=wearWindowQuality(report,result.windowReport);
    const reasons = [...result.reasons, motion.reason,heart,wear].filter(Boolean);
    const candidate=motionExcisionCandidate(result,motion);
    const shortMotion=motionQuality(result.windowReport,5);
    const shortCandidate=motionExcisionCandidate(result,shortMotion,5);
    const shortReasons=[...(shortCandidate?.reasons??result.reasons),
      ...(shortCandidate?[]:[shortMotion.reason]),heart,wear].filter(Boolean);
    return {ready:reasons.length===0, reasons:[...new Set(reasons)], channel:result.channel,
      validSeconds:result.validIntervalSeconds, rmssd:result.metrics?.rmssd,trimmedForMotion, motionRms:motion.rms,
      candidate:candidate?{ready:candidate.accepted && !heart && !wear,reasons:[...candidate.reasons,heart,wear].filter(Boolean),
        validSeconds:candidate.validIntervalSeconds,excludedSeconds:candidate.excludedSeconds,
        rmssd:candidate.metrics?.rmssd,relativeRmssdChange:result.metrics&&candidate.metrics?
          candidate.metrics.rmssd/result.metrics.rmssd-1:null}:null,
      shortBlockCandidate:{ready:shortReasons.length===0,reasons:shortReasons,
        excludedSeconds:shortCandidate?.excludedSeconds??0,
        validSeconds:shortCandidate?.validIntervalSeconds??result.validIntervalSeconds,
        rmssd:shortCandidate?.metrics?.rmssd??result.metrics?.rmssd,
        relativeRmssdChange:result.metrics&&shortCandidate?.metrics?shortCandidate.metrics.rmssd/result.metrics.rmssd-1:0}};
  } catch (error) {
    return {ready:false,reasons:[error.message]};
  }
}

const windows = [];
let first=0,last=0,priorWear;
for (let cutoff=start+360n*second;cutoff<=end;cutoff+=30n*second) {
  const windowStart=cutoff-360n*second;
  while(first<events.length && events[first].time<windowStart) {
    if(events[first].event.sensorStringType==='android.sensor.low_latency_offbody_detect') priorWear=events[first].event;
    first++;
  }
  while(last<events.length && events[last].time<=cutoff)last++;
  const intersectingGap = gaps.find(gap=>gap.start<cutoff && gap.end>windowStart);
  if (intersectingGap) {
    windows.push({endSeconds:Number(cutoff-start)/1e9, archived:false});
    continue;
  }
  const samples=events.slice(first,last).map(row=>row.event);
  if(priorWear)samples.unshift(priorWear);
  const report={...reportTemplate, events:samples};
  windows.push({endSeconds:Number(cutoff-start)/1e9, archived:true,
    original:assess(report,false),current:assess(report,true),
    short60:shortWindowProposal(report,60),short120:shortWindowProposal(report,120)});
}
const covered=windows.filter(window=>window.archived);
function summarize(key) {
  const holds={};
  for(const window of covered)for(const reason of window[key].reasons)holds[reason]=(holds[reason]||0)+1;
  const ready=covered.filter(window=>window[key].ready).length;
  return {ready,total:covered.length,percent:covered.length?100*ready/covered.length:null,holdReasons:holds,
    trimmedForMotion:covered.filter(window=>window[key].trimmedForMotion).length};
}
const result={generatedAt:new Date().toISOString(),method:LIVE_METHOD,qualityMethod:QUALITY_METHOD,model,sessionId,
  scope:'Overlapping saved-data windows from one session. Not daily availability, independent trials, stress accuracy, or ECG agreement. Freshness and UI behavior are not reconstructed.',
  windowSeconds:360,stepSeconds:30,uniqueEvents:events.length,deduplicatedEvents:duplicates,
  spanSeconds:Number(end-start)/1e9,archiveGaps:gaps.map(gap=>({startSeconds:Number(gap.start-start)/1e9,durationSeconds:Number(gap.end-gap.start)/1e9})),
  windowsExcludedForArchiveGaps:windows.length-covered.length,original:summarize('original'),current:summarize('current'),snapshots,windows};
result.proposal=MOTION_EXCISION_PROPOSAL;
result.candidate={ready:covered.filter(window=>window.current.ready || window.current.candidate?.ready).length,
  total:covered.length,newlyAvailable:covered.filter(window=>!window.current.ready && window.current.candidate?.ready).length};
result.shortBlockCandidate={ready:covered.filter(window=>window.current.shortBlockCandidate?.ready).length,
  total:covered.length,newlyAvailable:covered.filter(window=>!window.current.ready && window.current.shortBlockCandidate?.ready).length};
result.shortDurations=[60,120].map(seconds=>{
  const key='short'+seconds;
  const paired=covered.filter(window=>window.current.ready && window[key].ready);
  return {minimumSeconds:seconds,ready:covered.filter(window=>window[key].ready).length,total:covered.length,
    comparisonWithEligibleLongWindows:paired.map(window=>({endSeconds:window.endSeconds,
      channel:window.current.channel,longRmssd:window.current.rmssd,shortRmssd:window[key].rmssd,
      relativeDifference:window[key].rmssd/window.current.rmssd-1}))};
});
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({output:path.resolve(output),spanSeconds:result.spanSeconds,archiveGaps:result.archiveGaps,
  excluded:result.windowsExcludedForArchiveGaps,original:result.original,current:result.current,candidate:result.candidate,shortBlockCandidate:result.shortBlockCandidate,
  shortDurations:result.shortDurations}));
