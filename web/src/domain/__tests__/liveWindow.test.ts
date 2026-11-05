import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {analyzeLiveWindow,captureLiveLabel,liveWindowReasons,readLiveWindow,type LiveWindow} from '../liveWindow';
import {trainPersonalStress} from '../personalStress';
import {SHORT_LIVE_METHOD} from '../prv';

const now=Date.parse('2026-11-05T18:00:00+09:00');
const events:LiveWindow['report']['events']=Array.from({length:36000},(_,i)=>({
  sensorStringType:'com.google.wear.sensor.ppg',sensorTimestampNs:String(BigInt(i)*10_000_000n),
  values:[-10,100,-10,100,-10,1000+100*Math.sin(2*Math.PI*(i/100+.02*Math.sin(i/200))),...Array(10).fill(0)],
}));
for(let i=0;i<9000;i++)events.push({
  sensorStringType:'android.sensor.accelerometer',sensorTimestampNs:String(BigInt(i)*40_000_000n),values:[0,0,9.8],
});
for(let i=0;i<360;i++)events.push({
  sensorStringType:'android.sensor.heart_rate',sensorTimestampNs:String(BigInt(i)*1_000_000_000n),values:[60],accuracy:3,
});
const quiet:LiveWindow={connected:true,ppgFresh:true,worn:true,lastReceivedAt:now-500,lastPpgReceivedAt:now-500,
  ppgLagMs:50,windowSeconds:359.99,sampleCount:36000,droppedEvents:0,batteryPercent:80,
  model:'Google Pixel Watch',sessionId:'synthetic-test',clockSkewMs:0,streamErrors:0,
  registrations:{ppg:true,heartRate:true,acceleration:true},
  report:{model:'Google Pixel Watch',startedAtEpochMs:now-360000,reason:'completed_test',events}};

function receive(value:LiveWindow,capturedAt=now) {
  const request=vi.fn().mockImplementation(async(_url,options)=>{
    const body=JSON.parse(options.body);
    return {ok:true,json:async()=>({schemaVersion:1,...body,capturedAt,window:value})};
  });
  vi.stubGlobal('fetch',request);
  return request;
}
beforeEach(()=>vi.spyOn(Date,'now').mockReturnValue(now));
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

describe('capture from the current live window',()=>{
  it('saves a fresh, eligible label even when the previously displayed window has expired',async()=>{
    const cached={...quiet,lastReceivedAt:now-20000,lastPpgReceivedAt:now-20000};
    expect(liveWindowReasons(cached,analyzeLiveWindow(cached),now)).toContain('時計の最新データを待っています');
    const request=receive(quiet);
    const {label}=await captureLiveLabel(4);
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith('/live-api/capture',expect.objectContaining({method:'POST',cache:'no-store'}));
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({captureId:label.captureId,subjectiveStress0to10:4,subjectiveWindowSeconds:120});
    expect(label.qualityPassed).toBe(true);
    expect(label.sensorWindowEnd).toBe(quiet.lastReceivedAt);
    expect(label.method).toBe(SHORT_LIVE_METHOD);
    expect(label.subjectiveWindowSeconds).toBe(120);
    expect(trainPersonalStress([label],label.key,SHORT_LIVE_METHOD,now).count).toBe(1);
  });
  it('rejects an actually stale window received from the PC',async()=>{
    receive({...quiet,lastReceivedAt:now-20000,lastPpgReceivedAt:now-20000});
    const {label}=await captureLiveLabel(4);
    expect(label.qualityPassed).toBe(false);
    expect(label.reasons).toContain('時計の最新データを待っています');
  });
  it('does not mistake fresh non-pulse packets for a fresh pulse signal',async()=>{
    receive({...quiet,lastReceivedAt:now,lastPpgReceivedAt:now-13000,ppgLagMs:3000});
    expect((await captureLiveLabel(4)).label.qualityPassed).toBe(false);
  });
  it('keeps movement exclusions when saving a newly fetched window',async()=>{
    receive({...quiet,report:{...quiet.report,events:events.map(event=>event.sensorStringType==='android.sensor.accelerometer'?
      {...event,values:[Number(BigInt(event.sensorTimestampNs)/40_000_000n)%2?3:-3,0,9.8]}:event)}});
    const {label}=await captureLiveLabel(4);
    expect(label.qualityPassed).toBe(false);
    expect(label.reasons.join(' ')).toContain('加速度変化');
  });
  it('records the layout of the freshly fetched data',async()=>{
    receive({...quiet,report:{...quiet.report,events:events.map(event=>event.sensorStringType==='com.google.wear.sensor.ppg'?
      {...event,values:[-10,100,-10,100,100,-10,event.values[5],...Array(9).fill(0)]}:event)}});
    const {label}=await captureLiveLabel(4);
    expect(label.qualityPassed).toBe(true);
    expect(label.key).toContain(':ch6:');
  });
  it('fails without producing a cached-data label when the latest read fails',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockRejectedValue(Error('connection failed')));
    await expect(captureLiveLabel(4)).rejects.toThrow('connection failed');
  });
  it('uses the original capture time when a response is retried later',async()=>{
    const id='01234567-89ab-4cde-8123-0123456789ab';
    const request=receive(quiet);
    vi.spyOn(Date,'now').mockReturnValue(now+60000);
    const {label}=await captureLiveLabel(4,undefined,id);
    expect(label.captureId).toBe(id);expect(label.recordedAt).toBe(now);
    expect(label.qualityPassed).toBe(true);
    expect(JSON.parse(request.mock.calls[0][1].body).captureId).toBe(id);
  });
  it('fails when the PC archive fails instead of silently saving an unpaired label',async()=>{
    const request=vi.fn().mockResolvedValue({ok:false,status:503});vi.stubGlobal('fetch',request);
    await expect(captureLiveLabel(4)).rejects.toThrow('PCへ保存できません');
    expect(request).toHaveBeenCalledOnce();
  });
  it('rejects a response paired with a different score or request',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({schemaVersion:1,captureId:'wrong',
      capturedAt:now,subjectiveStress0to10:8,window:quiet})}));
    await expect(captureLiveLabel(4)).rejects.toThrow('保存結果を確認できません');
  });
  it('does not reinterpret an old five-minute self-report as a two-minute label',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockImplementation(async(_url,options)=>({ok:true,json:async()=>({schemaVersion:1,
      ...JSON.parse(options.body),subjectiveWindowSeconds:300,capturedAt:now,window:quiet})})));
    await expect(captureLiveLabel(4)).rejects.toThrow('保存結果を確認できません');
  });
  it('keeps routine live polling read-only',async()=>{
    const request=vi.fn().mockResolvedValue({ok:true,json:async()=>quiet});vi.stubGlobal('fetch',request);
    expect(await readLiveWindow()).toEqual(quiet);
    expect(request).toHaveBeenCalledWith('/live-api/window',expect.objectContaining({cache:'no-store'}));
    expect(request.mock.calls[0][1].method).toBeUndefined();
  });
  it('accepts a disconnected receiver before its first watch measurement',async()=>{
    const empty={...quiet,connected:false,ppgFresh:false,worn:null,model:'',lastReceivedAt:null,lastPpgReceivedAt:null,
      windowSeconds:0,sampleCount:0,registrations:{ppg:false,heartRate:false,acceleration:false},
      report:{...quiet.report,model:'',reason:'disconnected',events:[]}};
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>empty}));
    const value=await readLiveWindow();
    expect(analyzeLiveWindow(value)).toBeNull();
    expect(liveWindowReasons(value,null,now)).toContain('時計の最新データを待っています');
  });
});
