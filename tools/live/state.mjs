// Bounded in-memory live window. Sensor time is authoritative for interval work;
// wall-clock receive time is authoritative for freshness. No automatic raw disk log.
export const SENSOR_TYPES = new Set(['com.google.wear.sensor.ppg','android.sensor.heart_rate','android.sensor.accelerometer','android.sensor.low_latency_offbody_detect']);
export class LiveState {
  sessionId=null; model=''; events=[]; lastSequence=-1; lastReceivedAt=null;
  lastSentAt=null; lastPpgReceivedAt=null; droppedEvents=0; registrations={ppg:false,heartRate:false,acceleration:false}; battery=null;
  lastPpgLagMs=0;
  lastPpgNs=null;streamErrors=0;
  worn=null;
  accept(batch, now=Date.now()) {
    if(!batch || typeof batch.sessionId!=='string' || !/^[a-zA-Z0-9-]{8,80}$/.test(batch.sessionId) ||
      typeof batch.model!=='string' || batch.model.length>100 || !Number.isSafeInteger(batch.sequence) || batch.sequence<0 ||
      !Number.isSafeInteger(batch.sentAtEpochMs) || !Array.isArray(batch.events) || batch.events.length>2000) throw Error('Invalid batch');
    const checked=batch.events.map(e=>{
      if(!e || !SENSOR_TYPES.has(e.sensorStringType) || typeof e.sensorTimestampNs!=='string' ||
        !/^\d{1,20}$/.test(e.sensorTimestampNs) || !Array.isArray(e.values) || e.values.length>16 || !e.values.length ||
        e.values.some(v=>typeof v!=='number' || !Number.isFinite(v))) throw Error('Invalid event');
      return {sensorStringType:e.sensorStringType,sensorTimestampNs:e.sensorTimestampNs,values:e.values.slice(),accuracy:Number.isInteger(e.accuracy)?e.accuracy:0};
    });
    if(batch.sessionId===this.sessionId && batch.sequence<=this.lastSequence) return false;
    if(batch.sessionId!==this.sessionId) {this.events=[];this.lastSequence=-1;this.lastPpgReceivedAt=null;this.lastPpgNs=null;this.streamErrors=0;this.worn=null;}
    for(const e of checked)if(e.sensorStringType==='android.sensor.low_latency_offbody_detect') {
      if(e.values[0]===1)this.worn=true;else if(e.values[0]===0)this.worn=false;
    }
    for(const e of checked)if(e.sensorStringType==='com.google.wear.sensor.ppg'){
      const stamp=BigInt(e.sensorTimestampNs);
      if(this.lastPpgNs!==null && stamp<=this.lastPpgNs)this.streamErrors++;
      this.lastPpgNs=stamp;
    }
    this.sessionId=batch.sessionId;this.model=batch.model;this.lastSequence=batch.sequence;
    this.events.push(...checked);this.events=this.events.slice(-60000);
    if(this.events.length) {
      const newest=this.events.reduce((v,e)=>BigInt(e.sensorTimestampNs)>v?BigInt(e.sensorTimestampNs):v,0n);
      const cutoff=newest-360_000_000_000n;
      this.events=this.events.filter(e=>BigInt(e.sensorTimestampNs)>=cutoff);
    }
    this.lastReceivedAt=now;this.lastSentAt=batch.sentAtEpochMs;
    const batchPpg=checked.filter(e=>e.sensorStringType==='com.google.wear.sensor.ppg');
    if(batchPpg.length) {
      this.lastPpgReceivedAt=now;
      const latest=batchPpg.reduce((v,e)=>BigInt(e.sensorTimestampNs)>v?BigInt(e.sensorTimestampNs):v,0n);
      this.lastPpgLagMs=typeof batch.sentElapsedNs==='string' && /^\d{1,20}$/.test(batch.sentElapsedNs)?Math.max(0,Number(BigInt(batch.sentElapsedNs)-latest)/1e6):Infinity;
    }
    this.droppedEvents=Number.isSafeInteger(batch.droppedEvents)?Math.max(0,batch.droppedEvents):0;
    this.registrations={ppg:batch.registrations?.ppg===true,heartRate:batch.registrations?.heartRate===true,acceleration:batch.registrations?.acceleration===true};
    this.battery=Number.isFinite(batch.batteryPercent)?batch.batteryPercent:null;
    return true;
  }
  status(now=Date.now()) {
    const ppg=this.events.filter(e=>e.sensorStringType==='com.google.wear.sensor.ppg');
    const span=ppg.length>1?Number(BigInt(ppg[ppg.length-1].sensorTimestampNs)-BigInt(ppg[0].sensorTimestampNs))/1e9:0;
    return {service:'stresslog-live-v1',sessionId:this.sessionId,model:this.model,lastReceivedAt:this.lastReceivedAt,lastPpgReceivedAt:this.lastPpgReceivedAt,
      connected:this.lastReceivedAt!==null && now-this.lastReceivedAt<15000,
      ppgFresh:this.lastPpgReceivedAt!==null && now-this.lastPpgReceivedAt+this.lastPpgLagMs<15000,
      ppgLagMs:Number.isFinite(this.lastPpgLagMs)?this.lastPpgLagMs:null,
      clockSkewMs:this.lastReceivedAt===null?null:this.lastSentAt-this.lastReceivedAt,
      windowSeconds:span,sampleCount:ppg.length,droppedEvents:this.droppedEvents,registrations:this.registrations,batteryPercent:this.battery,streamErrors:this.streamErrors,worn:this.worn};
  }
  window(now=Date.now()) {
    const status=this.status(now);
    const sorted=[...this.events].sort((a,b)=>BigInt(a.sensorTimestampNs)<BigInt(b.sensorTimestampNs)?-1:BigInt(a.sensorTimestampNs)>BigInt(b.sensorTimestampNs)?1:0);
    return {...status,report:{model:this.model,startedAtEpochMs:now-Math.max(0,status.windowSeconds)*1000,
      reason:status.connected && status.ppgFresh?'completed_live_window':'disconnected',events:sorted}};
  }
}
