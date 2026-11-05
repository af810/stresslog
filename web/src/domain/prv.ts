/** Exploratory PPG pipeline. Policy thresholds are engineering choices, not diagnostic cutoffs. */
import { bandpassPpg } from './ppgFilter.ts';
import { ELGENDI_METHOD, elgendiBandpass, elgendiPeaks } from './elgendi.ts';
export { ELGENDI_METHOD } from './elgendi.ts';
export const METHOD = 'prv-exploratory-v1';
export const BANDPASS_METHOD = 'prv-bandpass-v2';
export const LIVE_METHOD = 'prv-elgendi-level-guard-v4';
export const SHORT_LIVE_METHOD = 'prv-elgendi-level-guard-short120-v1';
export const SHORT_MIN_VALID_SECONDS = 120;
export const SHORT_SOURCE_SECONDS = 140;
export const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
export function median(x: number[]) { const s = [...x].sort((a,b)=>a-b); return (s[Math.floor((s.length-1)/2)] + s[Math.floor(s.length/2)]) / 2; }
export function intervalMetrics(intervals: number[], valid = intervals.map(()=>true)) {
  const clean = intervals.filter((_,i)=>valid[i]);
  const diffs = intervals.slice(1).flatMap((v,i)=>valid[i] && valid[i+1] ? [v-intervals[i]] : []);
  if (clean.length < 2 || !diffs.length) return null;
  const avg = mean(clean);
  const rmssd = Math.sqrt(mean(diffs.map(d=>d*d)));
  return { rmssd, lnRmssd: rmssd > 0 ? Math.log(rmssd) : null,
    sdnn: Math.sqrt(clean.reduce((s,v)=>s+(v-avg)**2,0)/(clean.length-1)),
    pnn50: diffs.filter(d=>Math.abs(d)>50).length/diffs.length*100,
    heartRate: 60000/avg, intervalCount: clean.length, pairCount: diffs.length };
}
export interface ProbeEvent { sensorStringType: string; sensorTimestampNs: string; values: number[]; accuracy?: number }
export interface ProbeReport { model: string; startedAtEpochMs: number; reason: string; events: ProbeEvent[] }
export function parseProbe(raw: unknown): ProbeReport {
  if (!raw || typeof raw !== 'object') throw Error('診断JSONの形式ではありません');
  const r = raw as ProbeReport;
  if (!Array.isArray(r.events) || r.events.length > 100000 || !r.events.length ||
      typeof r.model !== 'string' || !Number.isFinite(r.startedAtEpochMs) || typeof r.reason !== 'string') throw Error('日時・機種・測定イベントを確認してください');
  for (const e of r.events) {
    if (typeof e.sensorStringType !== 'string' || typeof e.sensorTimestampNs !== 'string' || !/^\d+$/.test(e.sensorTimestampNs) ||
        !Array.isArray(e.values) || e.values.length > 64 || e.values.some(v=>typeof v !== 'number' || !Number.isFinite(v))) throw Error('無効な時刻またはセンサー値があります');
  }
  return r;
}
function movingAverage(x: number[], radius: number) {
  const sums = [0]; for (const v of x) sums.push(sums[sums.length-1]+v);
  return x.map((_,i)=>{ const a=Math.max(0,i-radius),b=Math.min(x.length,i+radius+1);return (sums[b]-sums[a])/(b-a); });
}
// Observed on this Pixel Watch only. The vendor payload layout is undocumented.
export function channelFor(values: number[]) {
    if (values.length !== 16 || values[0] >= 0 || values[1] <= 0 || values[3] <= 0 ||
        values.slice(7).some(value => value !== 0)) return undefined;
    return values[6] > 0 && values[5] < 0 ? 6 :
      values[6] === 0 && values[5] > 0 && values[4] < 0 ? 5 : undefined;
}
export function analyzeLivePpg(report: ProbeReport) {
  return analyzeLiveDuration(report,300,LIVE_METHOD);
}
/** Separate experimental protocol. Never reuses a five-minute fitted model. */
export function analyzeShortLivePpg(report: ProbeReport) {
  return analyzeLiveDuration(report,SHORT_MIN_VALID_SECONDS,SHORT_LIVE_METHOD,SHORT_SOURCE_SECONDS);
}
function analyzeLiveDuration(report:ProbeReport,minimumSeconds:number,method:string,maximumSeconds?:number) {
  if (report.model !== 'Google Pixel Watch') throw Error('この時計の脈波形式は未確認です');
  const samples = report.events.filter(event => event.sensorStringType === 'com.google.wear.sensor.ppg');
  if (!samples.length) throw Error('PPGデータが不足しています');
  const last = samples[samples.length - 1];
  const channel = channelFor(last.values);
  if (channel === undefined) throw Error('時計の脈波形式を確認できません');
  let start = samples.length - 1;
  let interrupted = false;
  while (start > 0) {
    const previous = samples[start - 1];
    const elapsed = BigInt(samples[start].sensorTimestampNs) - BigInt(previous.sensorTimestampNs);
    if (elapsed <= 0n) throw Error('脈波の時刻が重複または逆行しています');
    if (elapsed > 1_000_000_000n) {
      interrupted = true;
      break;
    }
    if (channelFor(previous.values) !== channel) break;
    start--;
  }
  let startNs = BigInt(samples[start].sensorTimestampNs);
  let sourceSeconds = Number(BigInt(last.sensorTimestampNs) - startNs) / 1e9;
  // The pulse detector excludes the first 10 and last 1 seconds and then
  // separately requires at least 300 seconds between detected beats.
  if (start > 0 && sourceSeconds < minimumSeconds+11) {
    throw Error(interrupted
      ? '脈波が途切れたため、再開後の連続データを蓄積しています'
      : '脈波の形式が切り替わったため、安定したデータを待っています');
  }
  if(maximumSeconds!==undefined){
    const fixedStart=BigInt(last.sensorTimestampNs)-BigInt(maximumSeconds)*1_000_000_000n;
    if(fixedStart>startNs)startNs=fixedStart;
  }
  const windowReport = start === 0 && startNs===BigInt(samples[0].sensorTimestampNs) ? report : {
    ...report,
    events: report.events.filter(event => BigInt(event.sensorTimestampNs) >= startNs),
  };
  const first=windowReport.events.find(event=>event.sensorStringType==='com.google.wear.sensor.ppg')!;
  sourceSeconds=Number(BigInt(last.sensorTimestampNs)-BigInt(first.sensorTimestampNs))/1e9;
  return { ...analyzePpg(windowReport, channel, false, method), windowReport, sourceSeconds };
}

export function analyzeLayoutTransition(report: ProbeReport) {
  if (report.model !== 'Google Pixel Watch') return null;
  const samples = report.events.filter(event => event.sensorStringType === 'com.google.wear.sensor.ppg');
  const first = samples[0] && channelFor(samples[0].values);
  if (first === undefined) return null;
  const index = samples.findIndex(event => channelFor(event.values) !== first);
  if (index < 1) return null;
  const second = channelFor(samples[index].values);
  if (second === undefined || samples.slice(index).some(event => channelFor(event.values) !== second)) return null;
  const boundary = BigInt(samples[index].sensorTimestampNs);
  const before = analyzePpg({...report,events:report.events.filter(event => BigInt(event.sensorTimestampNs) < boundary)},first,false,LIVE_METHOD);
  const after = analyzePpg({...report,events:report.events.filter(event => BigInt(event.sensorTimestampNs) >= boundary)},second,false,LIVE_METHOD);
  const durationOnly = ['解析可能な拍動区間が5分未満です', '有効な拍動間隔の合計が5分未満です'];
  if ([before,after].some(part => part.validIntervalSeconds < 60 || part.reasons.some(reason => !durationOnly.includes(reason)))) return null;
  // A rejected separator prevents computing a successive difference across the switch.
  const metrics = intervalMetrics([...before.intervals,0,...after.intervals],[...before.localValid,false,...after.localValid]);
  return metrics ? {rmssd:metrics.rmssd,validIntervalSeconds:before.validIntervalSeconds+after.validIntervalSeconds} : null;
}
export function analyzePpg(report: ProbeReport, channel: number, inverted = false, method = METHOD) {
  const liveMethod = method === LIVE_METHOD || method === SHORT_LIVE_METHOD;
  const usesElgendi = method === ELGENDI_METHOD || liveMethod;
  const requiredSeconds = method === SHORT_LIVE_METHOD ? SHORT_MIN_VALID_SECONDS : 300;
  const requiredMinutes = method === SHORT_LIVE_METHOD ? 2 : 5;
  if(!usesElgendi && ![METHOD,BANDPASS_METHOD].includes(method))throw Error('未対応の解析方法です');
  const rows = report.events.filter(e=>e.sensorStringType === 'com.google.wear.sensor.ppg');
  if (rows.length < 100) throw Error('PPGデータが不足しています');
  if (!Number.isInteger(channel) || channel < 0 || channel >= 16 || rows.some(e=>e.values.length <= channel)) throw Error('チャンネルを確認してください');
  const origin = BigInt(rows[0].sensorTimestampNs);
  let times = rows.map(e=>Number(BigInt(e.sensorTimestampNs)-origin)/1e6);
  const deltas = times.slice(1).map((t,i)=>t-times[i]);
  if (deltas.some(d=>d<=0)) throw Error('重複・逆行時刻があります。並べ替えて修復せず測定をやり直してください');
  const dt = median(deltas); if (dt < 4 || dt > 50) throw Error('対応するサンプリング周期の範囲外です');
  const gapTimes = deltas.flatMap((d,i)=>d>dt*2.5 ? [times[i+1]] : []);
  const analysisGaps = gapTimes.filter(t=>t>=10000 && t<=times[times.length-1]-1000);
  let raw = rows.map(e=>e.values[channel]*(inverted ? -1 : 1));
  if (Math.max(...raw)-Math.min(...raw) === 0) throw Error('このチャンネルは一定値です');
  const levelChanges: number[] = [];
  if (liveMethod) {
    const differences = raw.slice(1).map((value, i) => Math.abs(value - raw[i]));
    const sorted = [...differences].sort((a, b) => a - b);
    const jumpThreshold = 12 * sorted[Math.floor(sorted.length * .95)];
    const twoSeconds = Math.round(2000 / dt);
    for (let i = twoSeconds; i <= raw.length - twoSeconds; i++) {
      const jump = raw[i] - raw[i - 1];
      if (Math.abs(jump) <= jumpThreshold) continue;
      const shift = median(raw.slice(i, i + twoSeconds)) - median(raw.slice(i - twoSeconds, i));
      // A persistent step differs from an isolated spike or a pulse upslope.
      if (Math.sign(shift) === Math.sign(jump) && Math.abs(shift) >= .75 * Math.abs(jump)) levelChanges.push(times[i]);
    }
  }
  // Centered moving average detrending (1 s radius), followed by 50 ms smoothing.
  // Deliberately not a clinical / vendor validated beat detector.
  const trend = movingAverage(raw, Math.round(1000/dt));
  let wave = movingAverage(raw.map((v,i)=>v-trend[i]),Math.max(1,Math.round(25/dt)));
  if(method===BANDPASS_METHOD || usesElgendi) {
    const uniform:number[]=[], values:number[]=[];let cursor=0;
    for(let t=0;t<=times[times.length-1];t+=dt) {
      while(cursor+1<times.length-1 && times[cursor+1]<t)cursor++;
      const fraction=(t-times[cursor])/(times[cursor+1]-times[cursor]);
      uniform.push(t);values.push(raw[cursor]+fraction*(raw[cursor+1]-raw[cursor]));
    }
    times=uniform;raw=values;
    wave=usesElgendi?elgendiBandpass(raw,1000/dt):bandpassPpg(raw,1000/dt);
  }
  const center = median(wave); const mad = median(wave.map(v=>Math.abs(v-center)));
  const candidates: number[] = [];
  const prominence=new Map<number,number>();
  const blockSize=Math.max(1,Math.round(5000/dt));
  const scales:number[]=[];
  for(let i=0;i<wave.length;i+=blockSize) {const block=wave.slice(i,i+blockSize),mid=median(block);scales.push(1.4826*median(block.map(v=>Math.abs(v-mid))));}
  if (usesElgendi) {
    candidates.push(...elgendiPeaks(wave,1000/dt).filter(i=>times[i]>=10000&&times[i]<=times[times.length-1]-1000));
  }
  for (let i=1;!usesElgendi && i<wave.length-1;i++) {
    if (times[i]<10000 || times[i]>times[times.length-1]-1000) continue;
    if (wave[i]>wave[i-1] && wave[i]>=wave[i+1]) {
      if(method===BANDPASS_METHOD) {
        const radius=Math.max(2,Math.round(250/dt));
        const left=Math.min(...wave.slice(Math.max(0,i-radius),i));
        const right=Math.min(...wave.slice(i+1,Math.min(wave.length,i+radius+1)));
        const p=wave[i]-Math.max(left,right);prominence.set(i,p);
        if(p>0.7*scales[Math.floor(i/blockSize)])candidates.push(i);
      } else if(wave[i]>center+0.5*mad) candidates.push(i);
    }
  }
  // Amplitude-based nonmaximum suppression with 300 ms refractory period.
  const peaks = usesElgendi?candidates:candidates.sort((a,b)=>method===BANDPASS_METHOD?(prominence.get(b)!-prominence.get(a)!):wave[b]-wave[a]).reduce<number[]>((kept,i)=>{
    if (kept.every(k=>Math.abs(times[k]-times[i])>=300)) kept.push(i); return kept;
  },[]).sort((a,b)=>a-b);
  const intervals = peaks.slice(1).map((p,i)=>times[p]-times[peaks[i]]);
  const localValid = intervals.map((v,i)=>{
    const reference = median(intervals.slice(Math.max(0,i-5),i+6));
    return v>=300 && v<=2000 && Math.abs(v-reference)<=reference*0.2 &&
      !gapTimes.some(t=>t>times[peaks[i]] && t<=times[peaks[i+1]]) &&
      !levelChanges.some(t=>t>times[peaks[i]] && t<=times[peaks[i+1]]);
  });
  const metrics = intervalMetrics(intervals, localValid);
  const usableSeconds = peaks.length>1 ? (times[peaks[peaks.length-1]]-times[peaks[0]])/1000 : 0;
  const validIntervalSeconds = intervals.reduce((total, interval, i) => total + (localValid[i] ? interval : 0), 0) / 1000;
  const rejectedFraction = intervals.length ? 1-localValid.filter(Boolean).length/intervals.length : 1;
  const hr = report.events.filter(e=>e.sensorStringType==='android.sensor.heart_rate' && e.values[0]>0);
  const referenceHr = hr.length ? median(hr.map(e=>e.values[0])) : null;
  const reasons: string[] = [];
  if (!report.reason.startsWith('completed_')) reasons.push('測定が完了していません');
  if (usableSeconds<requiredSeconds) reasons.push(`解析可能な拍動区間が${requiredMinutes}分未満です`);
  else if (liveMethod && validIntervalSeconds<requiredSeconds) reasons.push(`有効な拍動間隔の合計が${requiredMinutes}分未満です`);
  if (!metrics || metrics.lnRmssd === null) reasons.push('有効な連続間隔が不足しています');
  if (rejectedFraction>0.05) reasons.push('除外間隔が5%を超えます');
  if (analysisGaps.length) reasons.push('サンプル時刻に欠測候補があります');
  if (levelChanges.some(t=>t+3000>=10000 && t-3000<=times[times.length-1]-1000)) reasons.push('脈波の基準値が急変したため、安定したデータを待っています');
  if (referenceHr === null || !metrics || Math.abs(metrics.heartRate-referenceHr)>5) reasons.push('時計の心拍数との整合を確認できません');
  return { method, channel, inverted, metrics, referenceHr, usableSeconds, validIntervalSeconds, rejectedFraction,
    gapCount: analysisGaps.length, totalGapCount:gapTimes.length, levelChangeCount:levelChanges.length, reasons, peaks, times, wave, intervals, localValid };
}
export interface BaselineEntry { id: string; day: string; key: string; lnRmssd: number }
export function compareBaseline(value: number, key: string, id: string, entries: BaselineEntry[], currentDay='9999-12-31') {
  const unique = new Map<string, number>();
  for (const e of entries) if(e.key===key && e.id!==id && e.day<currentDay && Number.isFinite(e.lnRmssd)) unique.set(e.day,e.lnRmssd);
  const values = [...unique.values()];
  if(values.length<7) return { days: values.length, z: null, percent: null };
  const avg=mean(values), sd=Math.sqrt(values.reduce((s,v)=>s+(v-avg)**2,0)/(values.length-1));
  return { days:values.length, z:sd>0.01 ? (avg-value)/sd : null, percent:(Math.exp(value-avg)-1)*100 };
}
