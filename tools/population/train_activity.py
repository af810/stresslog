"""Cardiac-only stress heads + separately evaluated physical-context model.

Predeclared fixed models, LOSO by person across all their sessions. No target
normalization, no questionnaires. Scores are not calibrated psychological risk.
"""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import balanced_accuracy_score, confusion_matrix, recall_score, roc_auc_score

PARAMS=dict(n_estimators=100,criterion='entropy',max_depth=5,min_samples_split=20,min_samples_leaf=5,max_features='sqrt',random_state=20261117,n_jobs=2)
def fit(rows,names):
    x=np.array([[r['features'][f] for f in names] for r in rows]);y=np.array([r['label'] for r in rows]);g=np.array([r['subject'] for r in rows])
    weights=np.zeros(len(rows))
    for subject in np.unique(g):
        mask=g==subject
        for label in np.unique(y[mask]):
            chosen=mask&(y==label);weights[chosen]=len(rows)/(len(np.unique(g))*len(np.unique(y[mask]))*chosen.sum())
    return RandomForestClassifier(**PARAMS).fit(x,y,sample_weight=weights)
def predict(model,rows,names):return model.predict_proba([[r['features'][f] for f in names] for r in rows])
def export(model,names,rows,multi=False):
    trees=[]
    for estimator in model.estimators_:
        t=estimator.tree_;v=t.value[:,0,:];v=v/v.sum(axis=1,keepdims=True)
        trees.append(dict(left=t.children_left.tolist(),right=t.children_right.tolist(),feature=t.feature.tolist(),threshold=t.threshold.tolist(),probability=v.tolist() if multi else v[:,1].tolist()))
    x=np.array([[r['features'][f] for f in names] for r in rows])
    return dict(features=names,trees=trees,minimum=x.min(axis=0).tolist(),maximum=x.max(axis=0).tolist(),trainingWindows=len(rows),trainingSubjects=len(set(r['subject'] for r in rows)))
def metrics(y,p):
    return dict(windows=len(y),stressWindows=int(sum(y)),auc=float(roc_auc_score(y,p)),balancedAccuracy=float(balanced_accuracy_score(y,np.array(p)>=.5)),confusionMatrix=confusion_matrix(y,np.array(p)>=.5).tolist())
def main():
    parser=argparse.ArgumentParser();parser.add_argument('wesad',type=Path);parser.add_argument('activity',type=Path);parser.add_argument('output',type=Path);args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
    source=json.loads(args.wesad.read_text(encoding='utf8'));activity=json.loads(args.activity.read_text(encoding='utf8'));heads={};evaluations={};fixtures=[]
    for name,names in [('heartMotion',['heartRateMedian']),('heartMotionPrv',['heartRateMedian','lnRmssd','lnSdnn','pnn50'])]:
        rows=[r for r in source['rows'] if name=='heartMotion' or r['features']['prvAvailable']];prob=[];truth=[];folds=[]
        for subject in sorted(set(r['subject'] for r in rows)):
            train=[r for r in rows if r['subject']!=subject];test=[r for r in rows if r['subject']==subject];model=fit(train,names);p=predict(model,test,names)[:,1];y=[r['label'] for r in test];prob.extend(p);truth.extend(y);folds.append(dict(testSubject=subject,trainingSubjects=sorted(set(r['subject'] for r in train)),windows=len(test)))
        evaluations[name]=dict(**metrics(truth,prob),subjects=len(set(r['subject'] for r in rows)),folds=folds)
        model=fit(rows,names);heads[name]=export(model,names,rows)
        for i in np.linspace(0,len(rows)-1,32,dtype=int):
            f=dict(rows[i]['features'])
            if name=='heartMotion':f.update(prvAvailable=False,lnRmssd=None,lnSdnn=None,pnn50=None,variabilitySource=None)
            fixtures.append(dict(head=name,features=f,expected=float(predict(model,[rows[i]],names)[0,1])))
    cardiac=dict(schemaVersion=1,id='wesad-cardiac-rf60-v2',featureMethod=source['featureMethod'],dataset='WESAD',datasetDoi='10.24432/C57K5T',paperDoi='10.1145/3242969.3242985',windowSeconds=60,personalBaseline=False,subjectiveInputs=False,
                 source='https://ubi29.informatik.uni-siegen.de/usi/data_wesad.html',license='Scientific, non-commercial use with attribution',parameters=PARAMS,heads=heads,validation={k:{n:v for n,v in d.items() if n!='folds'} for k,d in evaluations.items()},
                 trainingCardiacSource='Chest ECG reference; wrist HR and PRV transfer is unvalidated. No acceleration inputs to stress trees.',scoreMeaning='Uncalibrated protocol stress classifier output. Physical-context rejection is separate.')
    names=['heartRateMedian','logEnmo','logJerk'];rows=activity['rows'];allp=[];ally=[];folds=[];thresholds=[]
    # Physical context operating point was fixed before evaluating held-out people.
    exercise_threshold=.70
    for subject in sorted(set(r['subject'] for r in rows)):
        train=[r for r in rows if r['subject']!=subject];test=[r for r in rows if r['subject']==subject]
        model=fit(train,names);p=predict(model,test,names);y=np.array([r['label'] for r in test]);allp.extend(p.tolist());ally.extend(y.tolist())
        folds.append(dict(testSubject=subject,trainingSubjects=sorted(set(r['subject'] for r in train)),windows=len(test)))
    pp=np.array(allp);yy=np.array(ally);decisions=pp.argmax(axis=1)
    evaluation=dict(subjects=len(set(r['subject'] for r in rows)),windows=len(rows),classCounts=np.bincount(yy,minlength=3).tolist(),balancedAccuracy=float(balanced_accuracy_score(yy,decisions)),confusionMatrix=confusion_matrix(yy,decisions,labels=[0,1,2]).tolist(),
                    exerciseRejectionThreshold=exercise_threshold,exerciseSessionRecall=float((pp[yy==2,2]>=exercise_threshold).mean()),stressWindowsRejectedAsExercise=float((pp[yy==1,2]>=exercise_threshold).mean()),restWindowsRejectedAsExercise=float((pp[yy==0,2]>=exercise_threshold).mean()),folds=folds)
    non_ex=[r for r in rows if r['label']!=2]+source['rows']
    # Conservative large-motion envelope, never a claim of recognising walking.
    limits={name:float(np.quantile([r['features'][name] for r in non_ex],.99)) for name in ['logEnmo','logJerk']}
    model=fit(rows,names)
    context=dict(schemaVersion=1,id='hongn-physical-context-rf60-v1',classes=['rest','stress_task','exercise_or_recovery_session'],datasetDoi=activity['doi'],sourceArchiveSha256=activity['archiveSha256'],parameters=PARAMS,
                 head=export(model,names,rows,True),exerciseThreshold=exercise_threshold,largeMotionLimits=limits,recoverySeconds=120,validation={k:v for k,v in evaluation.items() if k!='folds'},
                 limitation='Stationary cycling including recovery; not a validated walking classifier, emotion diagnosis or concurrent exercise-plus-stress detector.')
    context_fixtures=[dict(features=rows[i]['features'],expected=predict(model,[rows[i]],names)[0].tolist()) for i in np.linspace(0,len(rows)-1,32,dtype=int)]
    for name,value in [('cardiac-model.json',cardiac),('physical-context.json',context),('cardiac-parity.json',fixtures),('context-parity.json',context_fixtures),('evaluation.json',dict(cardiac=evaluations,physicalContext=evaluation,dataPreparation={k:v for k,v in activity.items() if k!='rows'}))]:
        (args.output/name).write_text(json.dumps(value,ensure_ascii=False,separators=(',',':')),encoding='utf8')
    print(json.dumps(dict(cardiac={k:{n:v for n,v in d.items() if n!='folds'} for k,d in evaluations.items()},physicalContext={k:v for k,v in evaluation.items() if k!='folds'},largeMotionLimits=limits)))
if __name__=='__main__':main()
