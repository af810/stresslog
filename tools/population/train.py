"""Fixed, reproducible subject-independent RF benchmark and browser export.

This is a new WESAD-based model, NOT a reproduction of the paper's reported scores.
All parameters are fixed before evaluating labels; no per-user normalization.
"""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import balanced_accuracy_score, f1_score, roc_auc_score, brier_score_loss, confusion_matrix

BASE = ['heartRateMedian', 'logEnmo', 'logJerk']
PRV = BASE + ['lnRmssd', 'lnSdnn', 'pnn50']
PARAMETERS = dict(n_estimators=100, criterion='entropy', max_depth=5,
                  min_samples_split=20, min_samples_leaf=5, max_features='sqrt',
                  random_state=20261106, n_jobs=2)

def weights(y, groups):
    result = np.zeros(len(y))
    for group in np.unique(groups):
        indices = groups == group
        classes = np.unique(y[indices])
        for label in classes:
            selected = indices & (y == label)
            result[selected] = 1 / (len(np.unique(groups))*len(classes)*selected.sum())
    return result*len(y)

def metrics(y, p):
    return dict(windows=len(y), stressWindows=int(y.sum()),
                balancedAccuracy=float(balanced_accuracy_score(y, p >= .5)) if len(np.unique(y)) == 2 else None,
                macroF1=float(f1_score(y, p >= .5, labels=[0,1], average='macro', zero_division=0)),
                auc=float(roc_auc_score(y, p)) if len(np.unique(y)) == 2 else None,
                brier=float(brier_score_loss(y, p)),
                confusionMatrix=confusion_matrix(y, p >= .5, labels=[0,1]).tolist())

def fit(x, y, groups):
    return RandomForestClassifier(**PARAMETERS).fit(x, y, sample_weight=weights(y, groups))

def export_tree(estimator):
    tree = estimator.tree_
    values = tree.value[:, 0, :]
    return dict(left=tree.children_left.tolist(), right=tree.children_right.tolist(),
                feature=tree.feature.tolist(), threshold=tree.threshold.tolist(),
                probability=(values[:, 1]/values.sum(axis=1)).tolist())

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('features', type=Path)
    parser.add_argument('model', type=Path)
    parser.add_argument('artifacts', type=Path)
    args = parser.parse_args()
    source = json.loads(args.features.read_text(encoding='utf8'))
    heads, evaluations, fixtures = {}, {}, []
    for name, names in [('heartMotion', BASE), ('heartMotionPrv', PRV)]:
        rows = [r for r in source['rows'] if name == 'heartMotion' or r['features']['prvAvailable']]
        x = np.array([[r['features'][f] for f in names] for r in rows], dtype=np.float64)
        y = np.array([r['label'] for r in rows])
        groups = np.array([r['subject'] for r in rows])
        if len(rows) < 50 or len(np.unique(groups)) < 8 or min(np.bincount(y)) < 10:
            raise ValueError(f'Insufficient independent data for {name}')
        predictions = np.zeros(len(y))
        folds, wrist_predictions, wrist_labels = [], [], []
        for subject in sorted(np.unique(groups), key=lambda s: int(s[1:])):
            test = groups == subject
            train = ~test
            assert not set(groups[train]) & set(groups[test])
            forest = fit(x[train], y[train], groups[train])
            predictions[test] = forest.predict_proba(x[test])[:, 1]
            wrist_rows = [r for r in source.get('wristRows', []) if r['subject'] == subject and
                          (name == 'heartMotion' or r['features']['prvAvailable'])]
            if wrist_rows:
                wrist_x = np.array([[r['features'][f] for f in names] for r in wrist_rows])
                wrist_predictions.extend(forest.predict_proba(wrist_x)[:,1].tolist())
                wrist_labels.extend(r['label'] for r in wrist_rows)
            fold = dict(testSubject=subject, trainingSubjects=sorted(set(groups[train])),
                        **metrics(y[test], predictions[test]))
            folds.append(fold)
        evaluation = dict(**metrics(y, predictions), subjects=len(np.unique(groups)),
                          macroSubjectBalancedAccuracy=float(np.mean([f['balancedAccuracy'] for f in folds
                                                                    if f['auc'] is not None])),
                          folds=folds,
                          heldOutWristTransfer=metrics(np.array(wrist_labels), np.array(wrist_predictions)) if wrist_labels else None)
        evaluations[name] = evaluation
        forest = fit(x, y, groups)
        heads[name] = dict(features=names, trees=[export_tree(t) for t in forest.estimators_],
                           minimum=x.min(axis=0).tolist(), maximum=x.max(axis=0).tolist(),
                           trainingWindows=len(y), trainingSubjects=len(np.unique(groups)))
        for i in np.linspace(0, len(rows)-1, min(32,len(rows)), dtype=int):
            feature_fixture = dict(rows[i]['features'])
            if name == 'heartMotion':
                feature_fixture.update(prvAvailable=False, lnRmssd=None, lnSdnn=None, pnn50=None, variabilitySource=None)
            fixtures.append(dict(head=name, features=feature_fixture,
                                 expected=float(forest.predict_proba(x[i:i+1])[0, 1])))
        print(json.dumps(dict(head=name, **{k:v for k,v in evaluation.items() if k != 'folds'})), flush=True)
    model = dict(schemaVersion=1, id='wesad-population-rf60-v1', featureMethod=source['featureMethod'],
                 dataset='WESAD', datasetDoi='10.24432/C57K5T', paperDoi='10.1145/3242969.3242985',
                 trainingCardiacSource='Chest ECG beat intervals; wrist acceleration. Watch uses native HR and optional PPG-derived PRV; transfer unvalidated on Pixel Watch.',
                 license='Scientific, non-commercial use with attribution; see dataset website',
                 source='https://ubi29.informatik.uni-siegen.de/usi/data_wesad.html',
                 trainingFeatureSha256=hashlib.sha256(args.features.read_bytes()).hexdigest(),
                 windowSeconds=60, personalBaseline=False, subjectiveInputs=False,
                 target='protocol stress (2) versus baseline/amusement (1,3)',
                 scoreMeaning='100 * uncalibrated classifier output, not psychological stress intensity or real-world probability',
                 parameters=PARAMETERS, heads=heads,
                 validation={name:{k:v for k,v in result.items() if k!='folds'} for name,result in evaluations.items()})
    args.model.parent.mkdir(parents=True, exist_ok=True)
    args.artifacts.mkdir(parents=True, exist_ok=True)
    args.model.write_text(json.dumps(model, separators=(',', ':'), allow_nan=False), encoding='utf8')
    report = dict(modelId=model['id'], featureMethod=model['featureMethod'], modelSha256=hashlib.sha256(args.model.read_bytes()).hexdigest(),
                  evaluation='Leave one subject out; non-overlapping 60 s windows; fixed parameters; all preprocessing label-blind',
                  rejectedWindows=source['rejected'], evaluations=evaluations,
                  pixelWatchValidation='Not performed; device and real-life domain shift unvalidated', accuracyClaimForUser=None)
    (args.artifacts/'evaluation.json').write_text(json.dumps(report, indent=2), encoding='utf8')
    (args.artifacts/'parity-fixtures.json').write_text(json.dumps(fixtures), encoding='utf8')

if __name__ == '__main__':
    main()
