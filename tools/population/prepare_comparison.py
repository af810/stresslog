"""Hongn2025 wrist-only candidate: 120 s windows, 60 s hop, causal 5 min ACC history.
Uses protocol labels, no questionnaires or current-user data. Raw windows stay private.
"""
import argparse,hashlib,io,json,zipfile
from pathlib import Path
import numpy as np
from prepare_activity import stamp

def main():
 p=argparse.ArgumentParser();p.add_argument('archive',type=Path);p.add_argument('output',type=Path);args=p.parse_args();args.output.parent.mkdir(parents=True,exist_ok=True)
 count=0;skipped=[];files=set()
 with zipfile.ZipFile(args.archive) as z,args.output.open('w',encoding='utf8') as out:
  root=z.namelist()[0].split('/')[0]+'/'
  hashes={name.strip().lstrip('*'):digest for digest,name in (line.split(maxsplit=1) for line in z.read(root+'SHA256SUMS.txt').decode().splitlines())}
  def read(name):
   raw=z.read(root+name)
   if hashlib.sha256(raw).hexdigest()!=(hashes.get(name) or hashes.get('./'+name)):raise ValueError('Source checksum mismatch: '+name)
   files.add(name);return raw.decode('utf-8-sig')
  folders=sorted(n[len(root):].removesuffix('/ACC.csv') for n in z.namelist() if n.startswith(root+'Wearable_Dataset/') and n.endswith('/ACC.csv'))
  for folder in folders:
   _,protocol,session=folder.split('/');subject=session.split('_')[0]
   if session!=subject or protocol=='STRESS' and subject in ('S02','f07','f14'):
    skipped.append(folder);continue
   def signal(kind):
    lines=[s.strip() for s in read(folder+'/'+kind+'.csv').splitlines() if s.strip()]
    return stamp(lines[0].split(',')[0]),float(lines[1].split(',')[0]),np.loadtxt(io.StringIO('\n'.join(lines[2:])),delimiter=',',ndmin=2)
   try:
    ao,af,a=signal('ACC');ho,hf,h=signal('HR');po,pf,ppg=signal('BVP')
    if af!=32 or hf!=1 or pf!=64:raise ValueError('Unexpected sampling')
    a=a/64*9.80665;at=ao+np.arange(len(a))/af;pt=po+np.arange(len(ppg))/pf
    tags=[stamp(s) for s in read(folder+'/tags.csv').splitlines() if s.strip()]
    if any(b<=v for v,b in zip(tags,tags[1:])):raise ValueError('Invalid tags')
    if protocol=='STRESS':
     pairs=[(2,3),(4,5),(6,7),(8,9),(10,11)] if subject.startswith('S') else [(1,2),(3,4),(5,6),(7,8)]
     blocks=[(tags[0],tags[1],0)]+[(tags[v],tags[b],1) for v,b in pairs]
     blocks += [((tags[end]+tags[nxt])/2,tags[nxt],0) for (_,end),(nxt,_) in zip(pairs,pairs[1:]) if tags[nxt]-tags[end]>=240]
    else:blocks=[(tags[1],tags[-1],2)]
    for lo,hi,label in blocks:
     first=max(lo+2,ao,ho,po);limit=min(hi-2,at[-1],pt[-1],ho+len(h)-1)
     for start in np.arange(first,limit-120+1e-6,60):
      end=start+120;grid=start+np.arange(3000)/25
      acc=np.column_stack([np.interp(grid,at,a[:,j]) for j in range(3)])
      pulse=np.interp(start+np.arange(12000)/100,pt,ppg[:,0])
      native=h[int(np.ceil(start-ho)):int(np.ceil(end-ho)),0]
      if len(native)!=120 or not np.all(np.isfinite(native)&(native>=30)&(native<=200)):continue
      # Only past measurements; same 60 s summary and missing-history convention at runtime.
      history=[]
      for lag in [120,180,240,300]:
       begin=end-lag-60;finish=end-lag
       if begin<ao or finish>at[-1]:history.append(None);continue
       values=np.column_stack([np.interp(begin+np.arange(1500)/25,at,a[:,j]) for j in range(3)])
       enmo=np.maximum(0,np.linalg.norm(values,axis=1)/9.80665-1).mean()*1000
       history.append(float(np.log1p(enmo)))
      row=dict(subject=subject,session=folder,label=label,startSeconds=float(start-ao),endSeconds=float(end-ao),ppg=np.round(pulse,6).tolist(),acc=np.round(acc,7).tolist(),heart=native.tolist(),history=history)
      out.write(json.dumps(row,separators=(',',':'))+'\n');count+=1
   except (ValueError,KeyError,IndexError) as e:skipped.append(folder+': '+str(e))
 manifest=dict(datasetDoi='10.13026/he0v-tf17',archiveSha256=hashlib.sha256(args.archive.read_bytes()).hexdigest(),windowSeconds=120,hopSeconds=60,windows=count,verifiedFiles=sorted(files),skipped=skipped)
 args.output.with_suffix('.manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf8');print(json.dumps(dict(windows=count,skipped=skipped)))
if __name__=='__main__':main()
