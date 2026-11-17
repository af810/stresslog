import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {DailyHistory,dayKey} from './daily-history.mjs';
import {ACTIVITY_CONTEXT_METHOD} from '../../web/src/domain/activityContext.ts';
const record=(at,value,endNs=String(at),source='live')=>({source,observation:{at,endNs,sessionId:'s'},prediction:{value,hrvUsed:false,outsideTrainingRange:[]},assessment:{method:ACTIVITY_CONTEXT_METHOD,status:'eligible',stressScore:value,bodyResponseScore:value,exerciseOutput:.1}});
test('time series survives restart, deduplicates windows, and excludes historical estimates',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'stresslog-history-'));
  t.after(async()=>{assert.equal(path.dirname(dir),os.tmpdir());assert.ok(path.basename(dir).startsWith('stresslog-history-'));await fs.rm(dir,{recursive:true,force:true});});
  const now=Date.UTC(2026,10,17,0),store=new DailyHistory(dir);
  await store.record(record(now,91.25));await store.record(record(now+1000,99,String(now)));
  await store.record(record(now+2000,100,'h','historical'));await store.record(record(now+15000,30));
  const restored=await new DailyHistory(dir).snapshot(now+15000);
  assert.deepEqual(restored.points.map(p=>p.value),[91.25,30]);
  const csv=await fs.readFile(path.join(dir,`${dayKey(now)}.csv`),'utf8');
  assert.equal(csv.trim().split('\r\n').length,3);assert.ok(csv.includes('2026-11-17T09:00:00.000+09:00,91.25,91.25,eligible,0.1,false,false'));
  const afterRestart=new DailyHistory(dir);await afterRestart.record(record(now+30000,44));
  assert.equal((await fs.readFile(path.join(dir,`${dayKey(now)}.csv`),'utf8')).trim().split('\r\n').length,4);
  const next=new DailyHistory(dir);await next.record(record(now+86400000,22));
  assert.equal((await next.snapshot(now+86400000)).points[0].value,22);
  assert.equal(dayKey(Date.UTC(2026,10,17,15)),'2026-11-18');
});

test('movement keeps a body response but no stress score; legacy files remain unchanged',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'stresslog-history-'));
  t.after(async()=>{assert.equal(path.dirname(dir),os.tmpdir());assert.ok(path.basename(dir).startsWith('stresslog-history-'));await fs.rm(dir,{recursive:true,force:true});});
  const now=Date.UTC(2026,10,17,0),r=record(now,94);r.assessment={...r.assessment,status:'movement',stressScore:null,exerciseOutput:.9};
  await new DailyHistory(dir).record(r);
  const restored=await new DailyHistory(dir).snapshot(now);assert.equal(restored.points[0].stressValue,null);assert.equal(restored.points[0].value,94);
  const csvPath=path.join(dir,`${dayKey(now)}.csv`),journal=path.join(dir,`${dayKey(now)}.jsonl`),csv=await fs.readFile(csvPath,'utf8'),original=await fs.readFile(journal,'utf8');
  assert.ok(csv.includes('+09:00,,94,movement,0.9,false,false'));
  const legacy=new DailyHistory(dir,true);assert.equal((await legacy.snapshot(now)).points[0].activityState,'legacy_unfiltered');
  await legacy.record(record(now+30000,5));assert.equal(await fs.readFile(journal,'utf8'),original);assert.equal(await fs.readFile(csvPath,'utf8'),csv);
});
test('corrupt history is preserved and produces a visible error',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'stresslog-history-'));
  t.after(async()=>{assert.equal(path.dirname(dir),os.tmpdir());assert.ok(path.basename(dir).startsWith('stresslog-history-'));await fs.rm(dir,{recursive:true,force:true});});
  const now=Date.now(),file=path.join(dir,`${dayKey(now)}.jsonl`);await fs.writeFile(file,'broken');
  const history=new DailyHistory(dir);await history.record(record(now,50));
  assert.ok((await history.snapshot(now)).error);assert.equal(await fs.readFile(file,'utf8'),'broken');
});
