import {test} from 'node:test';
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import {answerDiscovery,proof,startDiscovery} from './receiver-discovery.mjs';
const token='a'.repeat(64),nonce='b'.repeat(32);
const request=(key=token)=>Buffer.from(JSON.stringify({kind:'stresslog-discover-v1',nonce,proof:proof(key,`stresslog-discover-v1|${nonce}`)}));
test('discovery requires the paired secret; response binds nonce and port without revealing credentials',()=>{
  for(const invalid of [Buffer.from('{}'),Buffer.from('broken'),Buffer.alloc(513),request('c'.repeat(64))])assert.equal(answerDiscovery(invalid,token),null);
  const result=JSON.parse(answerDiscovery(request(),token));
  assert.equal(result.nonce,nonce);assert.equal(result.port,8787);
  assert.equal(result.proof,proof(token,`stresslog-receiver-v1|${nonce}|8787`));
  assert.ok(!JSON.stringify(result).includes(token));
});
test('paired discovery round-trips over UDP and closes cleanly',async()=>{
  const server=await startDiscovery({token,host:'127.0.0.1',port:0}),client=dgram.createSocket('udp4');
  try{
    const result=await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(Error('UDP discovery timeout')),2000);
      client.once('message',bytes=>{clearTimeout(timeout);resolve(JSON.parse(bytes));});
      client.send(request(),server.socket.address().port,'127.0.0.1');
    });
    assert.equal(result.nonce,nonce);assert.equal(result.port,8787);
  }finally{client.close();await server.close();}
});
