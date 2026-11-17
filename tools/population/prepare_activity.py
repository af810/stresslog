"""Independent-subject exercise-context benchmark. Never uses current-user data.

Hongn 2025 raw E4 HR/ACC, fixed 60 s non-overlapping windows. Tags follow the
authors' notebook (which prepends the recording origin to its tags array).
Exercise includes pedalling and recovery; it is not a walking annotation.
"""
import argparse
import hashlib
import io
import json
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path
import numpy as np

def stamp(value):
    return datetime.fromisoformat(value.strip()).replace(tzinfo=timezone.utc).timestamp()

def main():
    p=argparse.ArgumentParser();p.add_argument('archive',type=Path);p.add_argument('output',type=Path);args=p.parse_args()
    rows=[];skipped=[];checks=[]
    with zipfile.ZipFile(args.archive) as z:
        root=z.namelist()[0].split('/')[0]+'/'
        manifest={}
        for line in z.read(root+'SHA256SUMS.txt').decode().splitlines():
            digest,name=line.split(maxsplit=1);manifest[name.strip().lstrip('*')]=digest
        def read(name):
            content=z.read(root+name)
            expected=manifest.get(name) or manifest.get('./'+name)
            if not expected or hashlib.sha256(content).hexdigest()!=expected:raise ValueError('Official file checksum mismatch: '+name)
            checks.append(name);return content.decode('utf-8-sig',errors='strict')
        sessions=sorted(n[len(root):].removesuffix('/ACC.csv') for n in z.namelist() if n.startswith(root+'Wearable_Dataset/') and n.endswith('/ACC.csv'))
        for folder in sessions:
            _,protocol,session=folder.split('/')
            subject=session.split('_')[0]
            if session!=subject or protocol=='STRESS' and subject in ('S02','f07','f14'):
                skipped.append(dict(session=folder,reason='published duplicate/covered-PPG or split recording; excluded conservatively'));continue
            try:
                def signal(kind):
                    lines=[s.strip() for s in read(folder+'/'+kind+'.csv').splitlines() if s.strip()]
                    origin=stamp(lines[0].split(',')[0]);fs=float(lines[1].split(',')[0]);values=np.loadtxt(io.StringIO('\n'.join(lines[2:])),delimiter=',',ndmin=2)
                    return origin,fs,values
                ao,af,acc=signal('ACC');ho,hf,hr=signal('HR')
                if af!=32 or hf!=1 or acc.shape[1]!=3:raise ValueError('Unexpected source sampling/layout')
                tags=[stamp(s) for s in read(folder+'/tags.csv').splitlines() if s.strip()]
                if any(b<=a for a,b in zip(tags,tags[1:])):raise ValueError('Non-increasing tags')
                blocks=[]
                if protocol=='STRESS':
                    pairs=[(2,3),(4,5),(6,7),(8,9),(10,11)] if subject.startswith('S') else [(1,2),(3,4),(5,6),(7,8)]
                    if len(tags)<=max(b for a,b in pairs):raise ValueError('Missing protocol tags')
                    blocks.append((tags[0],tags[1],0))
                    for a,b in pairs:blocks.append((tags[a],tags[b],1))
                    for (_,end),(next_start,_) in zip(pairs,pairs[1:]):
                        # Settled latter half of rest; task transitions/questionnaires are excluded.
                        lo,hi=tags[end],tags[next_start]
                        if hi-lo>=120:blocks.append(((lo+hi)/2,hi,0))
                else:
                    if len(tags)<3:raise ValueError('Missing exercise boundaries')
                    blocks=[(tags[1],tags[-1],2)]
                for lo,hi,label in blocks:
                    first=max(lo+2,ao,ho);limit=min(hi-2,ao+(len(acc)-1)/af,ho+(len(hr)-1)/hf)
                    for start in np.arange(first,limit-60+1e-6,60):
                        h=hr[int(np.ceil(start-ho)):int(np.floor(start+60-ho)),0]
                        good=h[np.isfinite(h)&(h>=30)&(h<=200)]
                        if len(good)<40 or len(good)<.8*len(h):continue
                        times=start+np.arange(1500)/25
                        source=ao+np.arange(len(acc))/af
                        a=np.column_stack([np.interp(times,source,acc[:,j]) for j in range(3)])/64*9.80665
                        enmo=np.maximum(0,np.linalg.norm(a,axis=1)/9.80665-1).mean()*1000
                        jerk=np.linalg.norm(np.diff(a,axis=0),axis=1).mean()*25
                        rows.append(dict(subject=subject,session=session,protocol=protocol,label=label,startSeconds=round(start-ao,3),
                                         features=dict(heartRateMedian=float(np.median(good)),logEnmo=float(np.log1p(enmo)),logJerk=float(np.log1p(jerk)))))
            except (ValueError,KeyError,UnicodeDecodeError) as error:skipped.append(dict(session=folder,reason=str(error)))
    result=dict(dataset='Hongn2025-E4',doi='10.13026/he0v-tf17',archiveSha256=hashlib.sha256(args.archive.read_bytes()).hexdigest(),
                labels={'0':'protocol rest','1':'protocol stress','2':'exercise session including recovery'},
                method='fixed non-overlapping 60s; E4 native HR and ACC interpolated25; no individual normalization or questionnaires',
                verifiedFiles=sorted(set(checks)),skipped=skipped,rows=rows)
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(result),encoding='utf-8')
    print(json.dumps(dict(rows=len(rows),subjects=len(set(r['subject'] for r in rows)),counts={str(i):sum(r['label']==i for r in rows) for i in range(3)},skipped=skipped)))
if __name__=='__main__':main()
