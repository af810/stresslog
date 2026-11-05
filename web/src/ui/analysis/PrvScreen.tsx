import { useMemo, useState } from 'react';
import { analyzePpg, compareBaseline, parseProbe, type ProbeReport, type BaselineEntry } from '../../domain/prv';
const STORAGE = 'stresslog.prv.baseline.v1';
export function PrvScreen() {
  const [report,setReport]=useState<ProbeReport|null>(null), [channel,setChannel]=useState(5), [invert,setInvert]=useState(false);
  const [rest,setRest]=useState(false), [reviewed,setReviewed]=useState(false), [error,setError]=useState('');
  const [entries,setEntries]=useState<BaselineEntry[]>(()=>{try { const v=JSON.parse(localStorage.getItem(STORAGE)||'[]');return Array.isArray(v)?v.filter(e=>e && typeof e.id==='string' && typeof e.day==='string' && typeof e.key==='string' && Number.isFinite(e.lnRmssd)):[]; }catch{return [];} });
  const computed=useMemo(()=>{if(!report)return null;try{return {result:analyzePpg(report,channel,invert),error:''};}catch(e){return {result:null,error:String(e)};}},[report,channel,invert]);
  const result=computed?.result;
  const id=report ? `${report.model}:${report.startedAtEpochMs}` : '';
  const day=report ? new Date(report.startedAtEpochMs).toLocaleDateString('sv-SE') : '';
  const key=`${report?.model}:${result?.method}:${channel}:${invert}:seated-normal-breathing`;
  const ready=!!result && result.reasons.length===0 && rest && reviewed;
  const comparison=ready && result?.metrics?.lnRmssd!=null ? compareBaseline(result.metrics.lnRmssd,key,id,entries,day) : null;
  function saveBaseline() {
    if(!ready || result?.metrics?.lnRmssd==null) return;
    const next=[...entries.filter(e=>!(e.key===key && e.day===day)),{id,day,key,lnRmssd:result.metrics.lnRmssd}];
    try {localStorage.setItem(STORAGE,JSON.stringify(next));setEntries(next);setError('');}catch{setError('基準値を保存できません。ブラウザの空き容量を確認してください');}
  }
  return <div className="screen"><h2>実測PRV・HRV解析</h2>
    <div className="card"><p>Pixel WatchのPPGから脈拍間隔の変動（PRV）を試算します。研究用の試作です。ECGのHRVや医学的なストレス診断とは区別します。</p>
    <p>5分座って安静にした後、同じ姿勢・自然な呼吸で「PPGを5分30秒測定」。毎日同じ時間帯で測り、7日以上の安静基準を集めます。7日・品質基準は本システムの運用設定で、診断の確立した閾値ではありません。</p>
    <label>時計から回収した latest-ppg-session.json<input type="file" accept=".json,application/json" onChange={async e=>{
      const file=e.target.files?.[0];if(!file)return;setError('');setReport(null);setReviewed(false);setRest(false);
      try {if(file.size>50_000_000)throw Error('ファイルは50MB以下にしてください');setReport(parseProbe(JSON.parse(await file.text())));}catch(err){setError(String(err));}
    }}/></label></div>
    {(error||computed?.error) && <p role="alert">{error||computed?.error}</p>}
    {report && <div className="card"><p>{report.model} / {new Date(report.startedAtEpochMs).toLocaleString()}（記録ファイルの測定日時）</p>
      <label>解析チャンネル（各値の意味は未検証）<select value={channel} onChange={e=>{setChannel(+e.target.value);setReviewed(false);}}>{Array.from({length:16},(_,i)=><option key={i} value={i}>{i}</option>)}</select></label>
      <label><input type="checkbox" checked={invert} onChange={e=>{setInvert(e.target.checked);setReviewed(false);}}/>波形の上下を反転</label>
    </div>}
    {result && <>
      <div className="card"><h3>波形と検出点（開始10秒後から8秒間）</h3>
        <Wave result={result}/><p className="muted">点が1拍に1つ対応するか確認します。波形の見た目と心拍数の一致だけでは間隔の精度を保証できません。</p>
        <p>有効拍動区間 {result.usableSeconds.toFixed(1)}秒 / 欠測候補 {result.gapCount} / 間隔除外 {(result.rejectedFraction*100).toFixed(1)}%</p>
        <p>推定脈拍 {result.metrics?.heartRate.toFixed(1)??'—'} bpm / 時計心拍 {result.referenceHr??'—'} bpm</p>
        <label><input type="checkbox" checked={rest} onChange={e=>setRest(e.target.checked)}/>安静・座位・自然呼吸で測定し、体動、発熱、直前の運動などの影響がないことを確認</label><br/>
        <label><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>解析チャンネルと検出点を確認した（外部基準機器との精度検証は未完了）</label>
      </div>
      <div className="card"><h3>{ready?'PRV指標（試算）':'参考指標・ストレス推定は保留'}</h3>
        <p>RMSSD {result.metrics?.rmssd.toFixed(2)??'—'} ms / lnRMSSD {result.metrics?.lnRmssd?.toFixed(3)??'—'}</p>
        <p>SDNN {result.metrics?.sdnn.toFixed(2)??'—'} ms / pNN50 {result.metrics?.pnn50.toFixed(1)??'—'}%</p>
        {result.reasons.map(r=><p key={r}>・{r}</p>)}
        {!rest && <p>・安静条件を確認してください</p>}{!reviewed && <p>・波形と検出点を確認してください</p>}
        <p>短時間の参考値も表示しますが、上の条件を満たすまで基準への登録と負荷比較は行いません。</p>
        <button className="btn outlined" disabled={!ready} onClick={saveBaseline}>この安静測定を基準へ登録（同日分を置換）</button>
      </div>
      <div className="card"><h3>平常時との比較による負荷の手がかり</h3>
        <p>独立した基準日数 {comparison?.days??0} / 最低7日（今回の測定自体を除く、同一機種・チャンネル・処理・条件）</p>
        {comparison?.z!=null ? <><p>lnRMSSD低下の標準化偏差 z = {comparison.z.toFixed(2)} / 基準比 {comparison.percent?.toFixed(1)}%</p><p>正のzは基準より低い変動です。負荷上昇の可能性を検討する手がかりですが、睡眠・呼吸・体調・薬剤等でも変わります。ストレスの確率や診断点数ではありません。</p></> : <p>比較を保留しています。品質条件と、ばらつきのある7日以上の基準が必要です。</p>}
      </div></>}
    <div className="card"><h3>計算方法と根拠</h3><p>RMSSD = √平均((隣接する有効間隔の差)²)。除外区間を飛び越えて差分は作りません。SDNNは有効間隔の標本標準偏差、lnRMSSDは自然対数です。</p>
      <p>処理は移動平均によるトレンド除去と平滑化、300msの不応期を用いた試作ピーク検出。300〜2000ms・局所中央値±20%以外を除外し、除外5%超・欠測・心拍差5bpm超は保留します。これらは検証が必要な工学的設定です。</p>
      <p>LF/HFを交感神経の単独指標として使わず、根拠のない0〜100点への換算も行いません。実測解析からのLED自動制御は精度確認後に接続します。</p>
      <ul><li><a href="https://doi.org/10.3389/fpsyg.2017.00213" target="_blank" rel="noreferrer">Laborde et al. 2017：測定・解析の推奨</a></li>
      <li><a href="https://doi.org/10.30773/pi.2017.08.17" target="_blank" rel="noreferrer">Kim et al. 2018：HRVとストレスのレビュー</a></li>
      <li><a href="https://pubmed.ncbi.nlm.nih.gov/32811571/" target="_blank" rel="noreferrer">Yuda et al. 2020：PRVとHRVの区別</a></li></ul>
      <p>入力ファイルはブラウザ内で解析し外部へ送信しません。基準指標はこのブラウザに保存します。</p>
      <button className="btn outlined" onClick={()=>{const blob=new Blob([JSON.stringify({method:result?.method,entries},null,2)],{type:'application/json'});const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download='prv-baseline.json';a.click();URL.revokeObjectURL(u);}}>基準値をバックアップ</button>
    </div>
  </div>;
}
function Wave({result:r}:{result:ReturnType<typeof analyzePpg>}) {
  const ids=r.times.map((t,i)=>t>=10000 && t<=18000?i:-1).filter(i=>i>=0);
  if(!ids.length)return null;
  const values=ids.map(i=>r.wave[i]),min=Math.min(...values),span=Math.max(...values)-min||1;
  const x=(i:number)=>(r.times[i]-10000)/8000*700,y=(i:number)=>130-(r.wave[i]-min)/span*110;
  return <svg viewBox="0 0 700 150" role="img" aria-label="脈波とピーク検出点" style={{width:'100%',background:'#f1f7f6'}}><polyline fill="none" stroke="#17675f" strokeWidth="1.5" points={ids.map(i=>`${x(i)},${y(i)}`).join(' ')}/>{r.peaks.filter(i=>r.times[i]>=10000 && r.times[i]<=18000).map(i=><circle key={i} cx={x(i)} cy={y(i)} r="4" fill="#c64e35"/>)}</svg>;
}
