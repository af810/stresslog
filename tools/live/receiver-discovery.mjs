import dgram from 'node:dgram';
import {createHmac, timingSafeEqual} from 'node:crypto';

export const DISCOVERY_PORT=8789;
export const proof=(token,message)=>createHmac('sha256',token).update(message).digest('hex');
const equal=(a,b)=>typeof a==='string'&&/^[a-f0-9]{64}$/.test(a)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
/** No credentials, certificate, identity or health data are advertised. */
export function answerDiscovery(bytes,token,ingestPort=8787){
  if(bytes.length>512||!Number.isInteger(ingestPort)||ingestPort<1||ingestPort>65535)return null;
  let q;try{q=JSON.parse(bytes);}catch{return null;}
  if(q.kind!=='stresslog-discover-v1'||typeof q.nonce!=='string'||!/^[a-f0-9]{32}$/.test(q.nonce)||
    !equal(q.proof,proof(token,`${q.kind}|${q.nonce}`)))return null;
  const kind='stresslog-receiver-v1';
  return Buffer.from(JSON.stringify({kind,nonce:q.nonce,port:ingestPort,proof:proof(token,`${kind}|${q.nonce}|${ingestPort}`)}));
}
export async function startDiscovery({token,ingestPort=8787,port=DISCOVERY_PORT,host='0.0.0.0'}){
  const socket=dgram.createSocket('udp4'),rates=new Map();let total=0,bucket=0,authenticatedReplies=0;
  socket.on('message',(bytes,remote)=>{
    // Bound CPU, source-map size and responses even on a busy shared LAN.
    const second=Math.floor(Date.now()/1000);
    if(second!==bucket){bucket=second;total=0;rates.clear();}
    if(++total>50||!/^\d{1,3}(\.\d{1,3}){3}$/.test(remote.address))return;
    const count=(rates.get(remote.address)??0)+1;rates.set(remote.address,count);if(count>3)return;
    const response=answerDiscovery(bytes,token,ingestPort);
    if(response){authenticatedReplies++;socket.send(response,remote.port,remote.address,()=>{});}
  });
  await new Promise((resolve,reject)=>{socket.once('error',reject);socket.bind(port,host,()=>{socket.removeListener('error',reject);resolve();});});
  socket.on('error',()=>{});
  return {socket,summary:()=>({port:socket.address().port,authenticatedReplies}),close:()=>new Promise(resolve=>socket.close(resolve))};
}
