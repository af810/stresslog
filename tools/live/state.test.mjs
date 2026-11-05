import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LiveState} from './state.mjs';
const ppg=(stamp='10000000000')=>({sensorStringType:'com.google.wear.sensor.ppg',sensorTimestampNs:stamp,values:[1,2,3,4,5,6],accuracy:3});
const batch=(sequence=0,events=[ppg()])=>({sessionId:'test-session',model:'test-watch',sequence,sentAtEpochMs:100000,sentElapsedNs:'11000000000',registrations:{ppg:true,heartRate:true,acceleration:true},events});
test('new receiver exposes a complete disconnected window before the first measurement',()=>{
  const window=new LiveState().window(100000);
  assert.equal(window.connected,false);assert.equal(window.ppgFresh,false);assert.equal(window.lastReceivedAt,null);
  assert.equal(window.sampleCount,0);assert.deepEqual(window.report.events,[]);
  assert.deepEqual(window.registrations,{ppg:false,heartRate:false,acceleration:false});
});
test('valid telemetry is fresh, becomes stale, and never invents samples',()=>{
  const s=new LiveState();assert.equal(s.accept(batch(),100000),true);assert.equal(s.status(100001).ppgFresh,true);
  assert.equal(s.status(120000).ppgFresh,false);assert.equal(s.window(120000).report.reason,'disconnected');assert.equal(s.events.length,1);
});
test('retries are idempotent and cannot make old samples look fresh',()=>{
  const s=new LiveState();s.accept(batch(),100000);assert.equal(s.accept(batch(),200000),false);assert.equal(s.lastReceivedAt,100000);
});
test('long-queued PPG is not considered current',()=>{
  const s=new LiveState();s.accept({...batch(),sentElapsedNs:'50000000000'},100000);assert.equal(s.status(100000).ppgFresh,false);
});
test('rejects invalid fields atomically and bounds the sensor types and batch size',()=>{
  const s=new LiveState();assert.throws(()=>s.accept(batch(0,[{...ppg(),values:[NaN]}])));assert.equal(s.events.length,0);
  assert.throws(()=>s.accept(batch(0,[{...ppg(),sensorStringType:'private.ecg'}])));
  assert.throws(()=>s.accept(batch(0,Array.from({length:2001},()=>ppg()))));
});
test('rolling buffer expires old samples and resets on a new watch session',()=>{
  const s=new LiveState();s.accept(batch(0,[ppg('1000000000')]),100000);
  s.accept(batch(1,[ppg('400000000000')]),100100);assert.equal(s.events.length,1);
  s.accept({...batch(),sessionId:'another-session'},100200);assert.equal(s.events.length,1);assert.equal(s.lastSequence,0);
});
test('nonmonotonic sensor data is reported, not silently declared healthy after sorting',()=>{
  const s=new LiveState();s.accept(batch(0,[ppg('11000000000'),ppg('10000000000')]),100000);assert.equal(s.status(100000).streamErrors,1);
});
test('worn state is retained even after its on-change event leaves the rolling window',()=>{
  const s=new LiveState();s.accept(batch(0,[{sensorStringType:'android.sensor.low_latency_offbody_detect',sensorTimestampNs:'1',values:[1]}]),100000);
  s.accept(batch(1,[ppg('400000000000')]),100100);assert.equal(s.status(100100).worn,true);
  s.accept(batch(2,[{sensorStringType:'android.sensor.low_latency_offbody_detect',sensorTimestampNs:'400000000001',values:[0]}]),100200);assert.equal(s.status(100200).worn,false);
});
