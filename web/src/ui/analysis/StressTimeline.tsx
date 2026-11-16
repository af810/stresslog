import {useEffect,useState} from 'react';
import {POPULATION_MODEL_INFO} from '../../domain/populationStress';
interface Point {at:number;value:number;hrvUsed:boolean;outsideTrainingRange:boolean;sessionId:string}
interface History {schemaVersion:1;modelId:string;day:string;points:Point[];days:string[];error:string|null}
const time=(at:number)=>new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'}).format(at);
export function StressTimeline(){
  const [history,setHistory]=useState<History|null>(null),[error,setError]=useState(''),[day,setDay]=useState(''),[hours,setHours]=useState(1);
  useEffect(()=>{
    const controller=new AbortController();let busy=false;
    async function load(){
      if(busy)return;busy=true;
      try{
        const response=await fetch('/live-api/population-history'+(day?'?day='+encodeURIComponent(day):''),{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(8000)])});
        if(!response.ok)throw Error('時系列を読み込めません');const data=await response.json() as History;
        if(data.schemaVersion!==1||data.modelId!==POPULATION_MODEL_INFO.id||!Array.isArray(data.points)||data.points.length>7000||!Array.isArray(data.days)||data.points.some(p=>!Number.isFinite(p.at)||!Number.isFinite(p.value)||p.value<0||p.value>100||typeof p.sessionId!=='string'))throw Error('時系列の形式を確認できません');
        if(!controller.signal.aborted){setHistory(data);setError('');}
      }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'記録を読み込めません');}
      finally{busy=false;}
    }
    void load();const timer=setInterval(()=>void load(),15000);
    return()=>{controller.abort();clearInterval(timer);};
  },[day]);
  const all=history?.points??[],end=all.at(-1)?.at??Date.now(),start=end-hours*3600000,points=all.filter(p=>p.at>=start);
  const segments:string[]=[];let segment='',previous:Point|undefined;
  for(const p of points){const x=44+(p.at-start)/(end-start)*740,y=168-p.value*1.4;
    if(!previous||p.at-previous.at>45000||p.sessionId!==previous.sessionId){if(segment)segments.push(segment);segment=`M${x.toFixed(1)},${y.toFixed(1)}`;}
    else segment+=` L${x.toFixed(1)},${y.toFixed(1)}`;previous=p;
  }if(segment)segments.push(segment);
  function download(){if(!history)return;const csv='time_jst,score,prv_used,outside_training_range\r\n'+history.points.map(p=>`${new Date(p.at+9*3600000).toISOString().replace('Z','+09:00')},${p.value},${p.hrvUsed},${p.outsideTrainingRange}`).join('\r\n');const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`stresslog-${history.day}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  return <section className="card"><h3>ストレス値の推移</h3>
    <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center'}}>
      <label>表示する日 <select value={day} onChange={e=>setDay(e.target.value)}><option value="">今日（自動更新）</option>{history?.days.map(d=><option key={d} value={d}>{d}</option>)}</select></label>
      <label>表示範囲 <select value={hours} onChange={e=>setHours(Number(e.target.value))}><option value={1}>直近1時間</option><option value={6}>直近6時間</option><option value={24}>1日</option></select></label>
      <button onClick={download} disabled={!all.length}>この日のCSVを保存</button>
    </div>
    <svg viewBox="0 0 800 200" role="img" aria-label={`${history?.day??'今日'}のストレス推定値。受信できない時間は線が途切れます。`} style={{width:'100%',marginTop:12}}>
      {[0,25,50,75,100].map(v=><g key={v}><line x1="44" x2="784" y1={168-v*1.4} y2={168-v*1.4} stroke="currentColor" opacity="0.12"/><text x="34" y={172-v*1.4} textAnchor="end" fontSize="12" fill="currentColor">{v}</text></g>)}
      {segments.map((d,i)=><path key={i} d={d} fill="none" stroke="#397b68" strokeWidth="2"/>)}
      {points.length===1&&<circle cx={784} cy={168-points[0].value*1.4} r="3" fill="#397b68"/>}
      <text x="44" y="193" fontSize="12" fill="currentColor">{time(start)}</text><text x="784" y="193" textAnchor="end" fontSize="12" fill="currentColor">{time(end)}</text>
    </svg>
    <p>{all.length?`${history?.day} · ${all.length}件を保存。最終記録 ${time(end)}`:'有効な計測データが届くとグラフが始まります。'}</p>
    <p className="live-hint">直近60秒から推定し、時系列は約15秒以上の間隔でPCへ自動保存します。保存はブラウザを閉じてもPC受信機が動いていれば続きます。PCのスリープ・通信切断中は記録できず、線が途切れます。値は心理的ストレスの絶対量ではありません。</p>
    {(error||history?.error)&&<p role="alert">{error||history?.error}</p>}
  </section>;
}
