import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {PopulationStore} from './population-store.mjs';
import {extractPopulationObservation} from '../../web/src/domain/populationFeatures.ts';
import {POPULATION_MODEL_INFO} from '../../web/src/domain/populationStress.ts';
function window(now){
 const events=[];
 for(let i=0;i<=7100;i++)events.push({sensorStringType:'com.google.wear.sensor.ppg',sensorTimestampNs:String(1_000_000_000n+BigInt(i)*10_000_000n),values:[0]});
 for(let i=0;i<=1775;i++)events.push({sensorStringType:'android.sensor.accelerometer',sensorTimestampNs:String(1_000_000_000n+BigInt(i)*40_000_000n),values:[0,0,9.80665]});
 for(let i=0;i<=71;i++)events.push({sensorStringType:'android.sensor.heart_rate',sensorTimestampNs:String(1_000_000_000n+BigInt(i)*1_000_000_000n),values:[85],accuracy:3});
 return {connected:true,ppgFresh:true,worn:true,lastReceivedAt:now,lastPpgReceivedAt:now,ppgLagMs:0,model:'synthetic',sessionId:'test',
  streamErrors:0,clockSkewMs:0,registrations:{ppg:true,heartRate:true,acceleration:true},report:{model:'synthetic',reason:'completed_test',startedAtEpochMs:now-71000,events}};
}
async function temporary(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'stresslog-population-test-'));
 t.after(async()=>{assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert.ok(path.basename(dir).startsWith('stresslog-population-test-'));await fs.rm(dir,{recursive:true,force:true});});return dir;}
test('first use predicts without references; restart restores only a dated last value, never live data',async t=>{
 const dir=await temporary(t),store=new PopulationStore(dir),now=Date.now(),data=window(now);
 const first=await store.snapshot(data,now);assert.ok(first.current);assert.equal(first.current.prediction.hrvUsed,false);
 assert.equal(first.model.personalBaseline,false);assert.equal(first.model.id,POPULATION_MODEL_INFO.id);
 const stale=await store.snapshot({...data,connected:false,ppgFresh:false},now+20000);
 assert.equal(stale.current,null);assert.equal(stale.last.prediction.value,first.current.prediction.value);
 await store.finish();const restarted=new PopulationStore(dir);
 const restored=await restarted.snapshot({...data,connected:false,ppgFresh:false},now+20000);
 assert.equal(restored.current,null);assert.deepEqual(restored.last,first.current);
 const saved=await fs.readFile(path.join(dir,'last-observation-v1.json'),'utf8');
 assert.equal(saved.includes('subjective'),false);assert.equal(saved.includes('baseline'),false);assert.equal(saved.includes('events'),false);
});
test('offline reanalysis stays historical and malformed cache is not overwritten',async t=>{
 const dir=await temporary(t),now=Date.now(),data=window(now),observation=extractPopulationObservation(data,now).observation;
 const store=new PopulationStore(dir);assert.equal(await store.importHistorical(observation),true);
 const result=await store.snapshot({...data,connected:false},now);assert.equal(result.current,null);assert.equal(result.last.source,'historical');
 const file=path.join(dir,'last-observation-v1.json');await fs.writeFile(file,'broken');
 const corrupted=new PopulationStore(dir);const fresh=await corrupted.snapshot(data,now);assert.ok(fresh.error);assert.ok(fresh.current);
 assert.equal(await fs.readFile(file,'utf8'),'broken');
});
