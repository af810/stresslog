"""Old/new transfer comparison and external walking/running/cycling challenge.
The external reference has separate clocks; this is not beat-timing validation.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path
import numpy as np
from train_activity import fit,predict

def head_score(head,rows):
    x=np.array([[r['features'][f] for f in head['features']] for r in rows],dtype=np.float32);score=np.zeros(len(rows))
    for t in head['trees']:
        nodes=np.zeros(len(rows),dtype=int);left=np.array(t['left']);right=np.array(t['right']);feature=np.array(t['feature']);threshold=np.array(t['threshold']);prob=np.array(t['probability'])
        for _ in range(20):
            active=left[nodes]!=-1
            if not active.any():break
            n=nodes[active];nodes[active]=np.where(x[active,feature[n]]<=threshold[n],left[n],right[n])
        score+=prob[nodes]
    return score/len(head['trees'])
def external_rows(directory):
    result=[];skipped=[]
    manifest={name.strip().lstrip('*'):digest for digest,name in (line.split(maxsplit=1) for line in (directory/'SHA256SUMS.txt').read_text().splitlines() if line.strip())}
    for header in sorted(directory.glob('*.hea')):
        for file in [header,header.with_suffix('.dat'),header.with_suffix('.atr')]:
            if manifest.get(file.name)!=hashlib.sha256(file.read_bytes()).hexdigest():raise ValueError('External source checksum mismatch: '+file.name)
        name=header.stem;lines=header.read_text().splitlines();_,count,fs,length=lines[0].split();count=int(count);fs=float(fs);length=int(length)
        meta=[]
        for line in lines[1:1+count]:
            parts=line.split();m=re.fullmatch(r'([\d.]+)\((-?\d+)\)/(.*)',parts[2]);assert parts[1]=='16' and m
            meta.append(dict(gain=float(m[1]),baseline=int(m[2]),name=parts[-1]))
        raw=np.fromfile(header.with_suffix('.dat'),dtype='<i2').reshape(length,count)
        index=lambda key:next(i for i,m in enumerate(meta) if m['name']==key)
        channels=[index('wrist_low_noise_accelerometer_'+a) for a in 'xyz'];clock=index('sample_times_for_all_signals_apart_from_ecg')
        good=(raw[:,channels+[clock]]!=-32768).all(axis=1)
        physical=(raw.astype(float)-np.array([m['baseline'] for m in meta]))/np.array([m['gain'] for m in meta])
        wrapped=physical[good,clock];offset=np.r_[0,np.cumsum(np.diff(wrapped)<-30)*60];times=wrapped+offset;times-=times[0];acc=physical[good][:,channels]
        if np.any(np.diff(times)<=0):raise ValueError('Invalid source clock')
        ann=header.with_suffix('.atr').read_bytes();beats=[];sample=0;i=0
        while i+1<len(ann):
            word=int.from_bytes(ann[i:i+2],'little');i+=2
            if not word:break
            kind=word>>10;delta=word&1023
            if kind==59:
                sample+=int.from_bytes(ann[i:i+2],'little',signed=True)*65536+int.from_bytes(ann[i+2:i+4],'little');i+=4
            elif kind==63:i+=delta+delta%2
            elif kind<59:
                sample+=delta
                if kind==1:beats.append(sample/fs)
        beats=np.array(beats)
        for start in np.arange(0,min(times[-1],length/fs)-60,60):
            selected=(times>=start)&(times<=start+60)
            if selected.sum()<100 or np.diff(times[selected]).max()>.5:
                skipped.append(dict(record=name,start=float(start),reason='accelerometer gap'));continue
            grid=start+np.arange(1500)/25;a=np.column_stack([np.interp(grid,times,acc[:,j]) for j in range(3)])
            rr=np.diff(beats[(beats>=start)&(beats<start+60)])*1000;rr=rr[(rr>=300)&(rr<=2000)]
            if len(rr)<20:continue
            enmo=np.maximum(0,np.linalg.norm(a,axis=1)/9.80665-1).mean()*1000;jerk=np.linalg.norm(np.diff(a,axis=0),axis=1).mean()*25
            result.append(dict(subject=name.split('_')[0],record=name,label=2,features=dict(heartRateMedian=float(np.median(60000/rr)),logEnmo=float(np.log1p(enmo)),logJerk=float(np.log1p(jerk)))))
    return result,skipped
def main():
    p=argparse.ArgumentParser();p.add_argument('activity',type=Path);p.add_argument('wesad',type=Path);p.add_argument('old_model',type=Path);p.add_argument('candidate',type=Path);p.add_argument('external',type=Path);args=p.parse_args()
    activity=json.loads(args.activity.read_text());wesad=json.loads(args.wesad.read_text());old=json.loads(args.old_model.read_text());cardiac=json.loads((args.candidate/'cardiac-model.json').read_text());context=json.loads((args.candidate/'physical-context.json').read_text())
    names=['heartRateMedian','logEnmo','logJerk'];test_rows=[];gate=[];exercise=[]
    for subject in sorted(set(r['subject'] for r in activity['rows'])):
        train=[r for r in activity['rows'] if r['subject']!=subject];test=[r for r in activity['rows'] if r['subject']==subject];model=fit(train,names)
        non_ex=[r for r in train if r['label']!=2]+wesad['rows']
        limits={f:float(np.quantile([r['features'][f] for r in non_ex],.99)) for f in ['logEnmo','logJerk']}
        probabilities=predict(model,test,names)[:,2]
        gate.extend([bool(q>=.7 or any(r['features'][f]>limits[f] for f in limits)) for r,q in zip(test,probabilities)]);exercise.extend(probabilities);test_rows.extend(test)
    def report(rows,rejected):
        baseline=head_score(old['heads']['heartMotion'],rows);new=head_score(cardiac['heads']['heartMotion'],rows);labels=np.array([r['label'] for r in rows]);rejected=np.array(rejected)
        output={}
        for c,name in [(0,'rest'),(1,'stress_task'),(2,'exercise_or_recovery')]:
            mask=labels==c
            if mask.any():output[name]=dict(windows=int(mask.sum()),oldPositiveRate=float((baseline[mask]>=.5).mean()),oldModelWithContextPositiveRate=float(((baseline>=.5)&~rejected)[mask].mean()),oldModelPositiveRateAmongEligible=float((baseline[mask&~rejected]>=.5).mean()) if (mask&~rejected).any() else None,cardiacOnlyPositiveRate=float((new[mask]>=.5).mean()),rejectedFraction=float(rejected[mask].mean()),newPositiveRateAcrossAllWindows=float(((new>=.5)&~rejected)[mask].mean()),positiveRateAmongEligible=float((new[mask&~rejected]>=.5).mean()) if (mask&~rejected).any() else None)
        return output
    external,skipped=external_rows(args.external);model=fit(activity['rows'],names);p_ex=predict(model,external,names)[:,2];limits=context['largeMotionLimits'];g=[q>=.7 or any(r['features'][f]>limits[f] for f in limits) for r,q in zip(external,p_ex)]
    output=dict(e4PersonHeldOut=report(test_rows,gate),externalExercise=report(external,g),externalRecords=len(set(r['record'] for r in external)),externalSubjects=len(set(r['subject'] for r in external)),externalSkipped=skipped,
                limitations=['Rejection is abstention, not a correct non-stress diagnosis.','E4 mental-task sensitivity and eligibility must be reported alongside lower exercise false-positive rate.','External HR uses ECG annotations and separate wearable clocks; Pixel Watch transfer remains unvalidated.','No concurrent exercise-plus-psychological-stress labels or true daily-life ground truth.'])
    (args.candidate/'comparison.json').write_text(json.dumps(output,indent=2),encoding='utf8');print(json.dumps(output))
if __name__=='__main__':main()
