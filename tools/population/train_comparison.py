"""Frozen research candidate. Nested subject cross-fitting for physical adjustment.
No participant baseline, questionnaire or current-user data. Outputs are uncalibrated.
"""
import argparse,json,hashlib
from pathlib import Path
import numpy as np
from sklearn.ensemble import RandomForestRegressor,RandomForestClassifier
from sklearn.model_selection import GroupKFold
from sklearn.metrics import balanced_accuracy_score,roc_auc_score,confusion_matrix

ACT=['logEnmo','logJerk','lagEnmo','historyCoverage']
CLS=['heartResidual','heartDelta','prvResidual','prvAvailable','logEnmo','logJerk','lagEnmo','historyCoverage']
SEED=20261117
def array(rows,names):return np.array([[r['features'][f] for f in names] for r in rows])
def physical(rows):
 normal=[r for r in rows if r['label']!=1];x=array(normal,ACT);y=np.array([r['features']['heart'] for r in normal]);model=RandomForestRegressor(n_estimators=32,max_depth=4,min_samples_leaf=10,random_state=SEED,n_jobs=2).fit(x,y)
 prv=[r for r in normal if r['features']['prvAvailable']]
 pm=RandomForestRegressor(n_estimators=24,max_depth=3,min_samples_leaf=5,random_state=SEED,n_jobs=2).fit(array(prv,ACT),[r['features']['lnRmssd'] for r in prv]) if len(prv)>=30 else None
 return model,pm
def transformed(rows,models):
 m,pm=models;x=array(rows,ACT);heart=m.predict(x);prv=pm.predict(x) if pm else np.zeros(len(rows))
 return np.array([[r['features']['heart']-h,r['features']['heartDelta'],v-r['features']['lnRmssd'] if r['features']['prvAvailable'] and pm else 0,int(r['features']['prvAvailable'] and pm is not None),*[r['features'][f] for f in ACT]] for r,h,v in zip(rows,heart,prv)])
def fit(rows):
 # The classifier sees residuals predicted without the participant used for that row.
 groups=np.array([r['subject'] for r in rows]);oof=np.zeros((len(rows),len(CLS)))
 for tr,te in GroupKFold(n_splits=3).split(rows,groups=groups):
  oof[te]=transformed([rows[i] for i in te],physical([rows[i] for i in tr]))
 y=np.array([r['label'] for r in rows]);weights=np.zeros(len(rows))
 for subject in np.unique(groups):
  for label in np.unique(y[groups==subject]):
   mask=(groups==subject)&(y==label);weights[mask]=1/(len(np.unique(y[groups==subject]))*mask.sum())
 # Missing-PRV augmentation uses training participants only, no fabricated PRV values.
 missing=oof.copy();missing[:,2:4]=0
 clf=RandomForestClassifier(n_estimators=80,criterion='entropy',max_depth=5,min_samples_leaf=5,min_samples_split=20,max_features='sqrt',random_state=SEED,n_jobs=2).fit(np.r_[oof,missing],np.r_[y,y],sample_weight=np.r_[weights,weights]*.5)
 return physical(rows),clf
def export_tree(model,multi=False):
 out=[]
 for estimator in model.estimators_:
  t=estimator.tree_;values=t.value[:,0,:];values=values/values.sum(axis=1,keepdims=True) if multi else t.value[:,0,:]
  out.append(dict(left=t.children_left.tolist(),right=t.children_right.tolist(),feature=t.feature.tolist(),threshold=t.threshold.tolist(),value=values.tolist() if multi else values[:,0].tolist()))
 return out
def main():
 p=argparse.ArgumentParser();p.add_argument('features',type=Path);p.add_argument('output',type=Path);args=p.parse_args();args.output.mkdir(parents=True,exist_ok=True)
 source=json.loads(args.features.read_text(encoding='utf8'));rows=source['rows'];pred=[];labels=[];folds=[];results=[]
 for subject in sorted(set(r['subject'] for r in rows)):
  train=[r for r in rows if r['subject']!=subject];test=[r for r in rows if r['subject']==subject];models,clf=fit(train);scores=clf.predict_proba(transformed(test,models));pred.extend(scores.tolist());labels.extend(r['label'] for r in test)
  folds.append(dict(testSubject=subject,trainingSubjects=sorted(set(r['subject'] for r in train)),windows=len(test)))
  results.extend(dict(subject=r['subject'],session=r['session'],endSeconds=r['endSeconds'],label=r['label'],score=float(s[1])*100,features=r['features'],latest=r['latest']) for r,s in zip(test,scores))
  print(subject, len(test),flush=True)
 pp=np.array(pred);yy=np.array(labels);stress=pp[:,1];metrics=dict(subjects=len(set(r['subject'] for r in rows)),windows=len(rows),prvWindows=sum(r['features']['prvAvailable'] for r in rows),classCounts=np.bincount(yy,minlength=3).tolist(),balancedAccuracy3class=float(balanced_accuracy_score(yy,pp.argmax(axis=1))),confusionMatrix3class=confusion_matrix(yy,pp.argmax(axis=1)).tolist(),stressAuc=float(roc_auc_score(yy==1,stress)),operatingThreshold=.65,
 at65={name:float((stress[yy==label]>=.65).mean()) for label,name in [(0,'restHighRate'),(1,'stressDetectionRate'),(2,'exerciseHighRate')]},folds=folds)
 models,clf=fit(rows);m,pm=models
 artifact=dict(schemaVersion=1,id='hongn-residual-wrist120-v1',featureMethod=source['featureMethod'],datasetDoi='10.13026/he0v-tf17',activityFeatures=ACT,classifierFeatures=CLS,classes=['rest','stress_task','exercise_recovery'],heartTrees=export_tree(m),prvTrees=export_tree(pm) if pm else [],classifierTrees=export_tree(clf,True),windowSeconds=120,updateSeconds=30,smoothingSeconds=90,highThreshold=65,lowThreshold=45,confirmationSeconds=90,releaseSeconds=60,seed=SEED,personalBaseline=False,subjectiveInputs=False,validation={k:v for k,v in metrics.items() if k!='folds'},scoreMeaning='Uncalibrated protocol-class output, not psychological stress magnitude or real-life risk.')
 fixtures=[]
 for i in np.linspace(0,len(rows)-1,32,dtype=int):
  row=rows[i];x=transformed([row],models);fixtures.append(dict(features=row['features'],expected=float(clf.predict_proba(x)[0,1])*100,predictedHeart=float(m.predict(array([row],ACT))[0]),predictedPrv=float(pm.predict(array([row],ACT))[0]) if pm else None))
 for name,value in [('model.json',artifact),('evaluation.json',metrics),('parity.json',fixtures),('held-out.json',results)]:
  (args.output/name).write_text(json.dumps(value,ensure_ascii=False,separators=(',',':')),encoding='utf8')
 print(json.dumps({k:v for k,v in metrics.items() if k!='folds'}))
if __name__=='__main__':main()
