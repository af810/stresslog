import {useEffect,useState} from 'react';
import {POPULATION_MODEL_INFO} from '../../domain/populationStress';
import {ACTIVITY_CONTEXT_METHOD} from '../../domain/activityContext';
interface Point {at:number;value:number;stressValue:number|null;activityState:string;exerciseOutput:number|null;hrvUsed:boolean;outsideTrainingRange:boolean;sessionId:string}
interface History {schemaVersion:2;contextMethod:string;modelId:string;day:string;points:Point[];days:string[];error:string|null}
const time=(at:number)=>new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'}).format(at);
export function StressTimeline(){
  const [history,setHistory]=useState<History|null>(null),[error,setError]=useState(''),[day,setDay]=useState(''),[hours,setHours]=useState(1),[legacy,setLegacy]=useState(false),[showBody,setShowBody]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();let busy=false;setHistory(null);
    async function load(){
      if(busy)return;busy=true;
      try{
        const query=new URLSearchParams();if(day)query.set('day',day);if(legacy)query.set('series','legacy');
        const response=await fetch('/live-api/population-history?'+query,{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(8000)])});
        if(!response.ok)throw Error('時系列を読み込めません');const data=await response.json() as History;
        if(data.schemaVersion!==2||data.contextMethod!==(legacy?'legacy_unfiltered':ACTIVITY_CONTEXT_METHOD)||data.modelId!==POPULATION_MODEL_INFO.id||!Array.isArray(data.points)||data.points.length>7000||!Array.isArray(data.days)||data.points.some(p=>!Number.isFinite(p.at)||!Number.isFinite(p.value)||p.value<0||p.value>100||typeof p.sessionId!=='string'||(p.stressValue!==null&&(!Number.isFinite(p.stressValue)||p.stressValue!==p.value))||!['eligible','movement','recovery','legacy_unfiltered'].includes(p.activityState)||(p.activityState!=='eligible'&&p.stressValue!==null)))throw Error('時系列の形式を確認できません');
        if(!controller.signal.aborted){setHistory(data);setError('');}
      }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'記録を読み込めません');}
      finally{busy=false;}
    }
    void load();const timer=setInterval(()=>void load(),15000);
    return()=>{controller.abort();clearInterval(timer);};
  },[day,legacy]);
  const all=history?.points??[],end=all.at(-1)?.at??Date.now(),start=end-hours*3600000,points=all.filter(p=>p.at>=start),bodyVisible=legacy||showBody;
  function paths(body:boolean){
    const segments:string[]=[];let segment='',previous:Point|undefined;
    for(const p of points){const value=body?p.value:p.stressValue;
      if(value===null){if(segment)segments.push(segment);segment='';previous=undefined;continue;}
      const x=44+(p.at-start)/(end-start)*740,y=168-value*1.4;
      if(!previous||p.at-previous.at>45000||p.sessionId!==previous.sessionId){if(segment)segments.push(segment);segment='M'+x.toFixed(1)+','+y.toFixed(1);}
      else segment+=' L'+x.toFixed(1)+','+y.toFixed(1);previous=p;
    }if(segment)segments.push(segment);return segments;
  }
  function download(){if(!history)return;const csv='time_jst,stress_score,body_response_score,activity_state,exercise_model_output,prv_used,outside_training_range\r\n'+history.points.map(p=>new Date(p.at+9*3600000).toISOString().replace('Z','+09:00')+','+(p.stressValue??'')+','+p.value+','+p.activityState+','+(p.exerciseOutput??'')+','+p.hrvUsed+','+p.outsideTrainingRange).join('\r\n');const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='stresslog-'+history.day+(legacy?'-legacy':'')+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  return <section className="card"><h3>{legacy?'以前の身体反応の記録':'ストレス推定値の推移'}</h3>
    <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center'}}>
      <label>記録方式 <select value={legacy?'legacy':'context'} onChange={e=>{setLegacy(e.target.value==='legacy');setDay('');}}><option value="context">運動・回復の判定あり</option><option value="legacy">以前の記録（運動判定なし）</option></select></label>
      <label>表示する日 <select value={day} onChange={e=>setDay(e.target.value)}><option value="">今日（自動更新）</option>{history?.days.map(d=><option key={d} value={d}>{d}</option>)}</select></label>
      <label>表示範囲 <select value={hours} onChange={e=>setHours(Number(e.target.value))}><option value={1}>直近1時間</option><option value={6}>直近6時間</option><option value={24}>1日</option></select></label>
      {!legacy&&<label><input type="checkbox" checked={showBody} onChange={e=>setShowBody(e.target.checked)}/>身体反応の参考値も表示</label>}
      <button onClick={download} disabled={!all.length}>この日のCSVを保存</button>
    </div>
    <svg viewBox="0 0 800 200" role="img" aria-label="緑はストレス推定、橙は身体反応の参考値。運動・回復中は緑の線が途切れます。" style={{width:'100%',marginTop:12}}>
      {[0,25,50,75,100].map(v=><g key={v}><line x1="44" x2="784" y1={168-v*1.4} y2={168-v*1.4} stroke="currentColor" opacity="0.12"/><text x="34" y={172-v*1.4} textAnchor="end" fontSize="12" fill="currentColor">{v}</text></g>)}
      {bodyVisible&&paths(true).map((d,i)=><path key={'body'+i} d={d} fill="none" stroke="#a86627" strokeWidth="1.5" strokeDasharray="5 3"/>)}
      {!legacy&&paths(false).map((d,i)=><path key={'stress'+i} d={d} fill="none" stroke="#397b68" strokeWidth="2"/>)}
      {points.map(p=>{const value=p.stressValue??(bodyVisible?p.value:null);return value===null?null:<circle key={p.at} cx={44+(p.at-start)/(end-start)*740} cy={168-value*1.4} r="1.8" fill={p.stressValue===null?'#a86627':'#397b68'}/>;})}
      <text x="44" y="193" fontSize="12" fill="currentColor">{time(start)}</text><text x="784" y="193" textAnchor="end" fontSize="12" fill="currentColor">{time(end)}</text>
    </svg>
    <p>{all.length?history?.day+' · '+all.length+'件を保存。最終記録 '+time(end):'この方式の記録はまだありません。計測データが届くとグラフが始まります。'}</p>
    <p className="live-hint">{legacy?'以前の値には運動・回復の除外判定がありません。身体反応の参考値として表示します。':'緑：ストレス推定値。運動・体動の影響が疑われる間とその後2分は表示を保留します。橙：運動などでも上がる身体反応の参考値。CSVの保留区間はストレス値が空欄になり、参考値と判定は残ります。'}</p>
    <p className="live-hint">直近60秒から推定し、約15秒以上の間隔でPCへ自動保存します。ブラウザを閉じてもPC受信機が動いていれば保存を続けます。PCのスリープ・通信切断中は記録できません。値は心理的ストレスの絶対量ではありません。</p>
    {(error||history?.error)&&<p role="alert">{error||history?.error}</p>}
  </section>;
}
