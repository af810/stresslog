"""Convert the official WESAD archive to synchronized, non-overlapping wrist windows.

Protocol labels 1/2/3, wrist BVP/ACC and reference ECG beat intervals are used.
No questionnaires, subject baselines, arbitrary pickle globals or executable models.
"""
import argparse
import gc
import hashlib
import json
import pickle
import re
import zipfile
from pathlib import Path
import os
os.environ.setdefault('MPLCONFIGDIR', str(Path(__file__).resolve().parents[2]/'.stresslog-local/population/matplotlib'))
import numpy as np
import neurokit2 as nk

EXPECTED_SHA1 = 'bae786bf599ef28e42e1c2e18da9b84d685e84e7'

class ArrayUnpickler(pickle.Unpickler):
    def find_class(self, module, name):
        if module in ('numpy.core.multiarray', 'numpy._core.multiarray') and name in ('_reconstruct', 'scalar'):
            return getattr(np._core.multiarray, name)
        if module == 'numpy' and name in ('ndarray', 'dtype'):
            return getattr(np, name)
        if module == '_codecs' and name == 'encode':
            import codecs
            return codecs.encode
        raise pickle.UnpicklingError(f'Unsupported dataset global: {module}.{name}')

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('archive', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    digest = hashlib.file_digest(args.archive.open('rb'), 'sha1').hexdigest()
    if digest != EXPECTED_SHA1:
        raise ValueError('Archive differs from university-published OC-Checksum')
    args.output.mkdir(parents=True, exist_ok=True)
    manifest = dict(dataset='WESAD', source='https://ubi29.informatik.uni-siegen.de/usi/data_wesad.html',
                    doi='10.1145/3242969.3242985', sha1=digest, windowSeconds=60, strideSeconds=60,
                    bvpHz=100, accelerationHz=25, labels={'1': 0, '2': 1, '3': 0},
                    cardiacReference=f'Chest ECG, NeuroKit2 {nk.__version__}, ecg_clean/peaks neurokit, no artifact correction', subjects=[])
    with zipfile.ZipFile(args.archive) as archive:
        members = sorted((n for n in archive.namelist() if re.fullmatch(r'WESAD/S\d+/S\d+\.pkl', n)),
                         key=lambda n: int(re.search(r'/S(\d+)/', n)[1]))
        if len(members) != 15:
            raise ValueError('Expected all 15 published subjects')
        with (args.output/'windows.jsonl').open('w', encoding='utf8') as output:
            for member in members:
                with archive.open(member) as stream:
                    subject = ArrayUnpickler(stream, encoding='latin1').load()
                sid = subject['subject']
                wrist, labels = subject['signal']['wrist'], subject['label']
                ecg = np.asarray(subject['signal']['chest']['ECG'], dtype=np.float64).reshape(-1)
                cleaned = nk.ecg_clean(ecg, sampling_rate=700, method='neurokit')
                _, detected = nk.ecg_peaks(cleaned, sampling_rate=700, method='neurokit', correct_artifacts=False)
                peak_seconds = np.asarray(detected['ECG_R_Peaks'])/700
                bvp = np.asarray(wrist['BVP'], dtype=np.float64).reshape(-1)
                # Synchronized .pkl retains E4 accelerometer units of 1/64 g.
                acceleration = np.asarray(wrist['ACC'], dtype=np.float64) / 64 * 9.80665
                counts = {1: 0, 2: 0, 3: 0}
                transitions = np.r_[0, np.flatnonzero(labels[1:] != labels[:-1])+1, len(labels)]
                for lo, hi in zip(transitions[:-1], transitions[1:]):
                    condition = int(labels[lo])
                    if condition not in counts:
                        continue
                    # Exclude the first/last two seconds of each protocol block.
                    first = int(np.ceil(lo/700+2))
                    limit = hi/700-2
                    for start in range(first, int(limit)-59, 60):
                        end = start+60
                        if end > limit or end*64 >= len(bvp) or end*32 >= len(acceleration):
                            continue
                        target_bvp = start+np.arange(6000)/100
                        source_bvp = np.arange(start*64, end*64+1)/64
                        ppg = np.interp(target_bvp, source_bvp, bvp[start*64:end*64+1])
                        target_acc = start+np.arange(1500)/25
                        source_acc = np.arange(start*32, end*32+1)/32
                        acc = np.column_stack([np.interp(target_acc, source_acc,
                                               acceleration[start*32:end*32+1, axis]) for axis in range(3)])
                        full_peaks = peak_seconds[(peak_seconds >= start) & (peak_seconds < end)]
                        inner_peaks = peak_seconds[(peak_seconds >= start+10) & (peak_seconds <= end-1)]
                        row = dict(subject=sid, condition=condition, label=int(condition == 2), startSeconds=start,
                                   ppg=ppg.round(8).tolist(), acceleration=acc.round(8).tolist(),
                                   referenceIntervals=(np.diff(full_peaks)*1000).tolist(),
                                   referencePrvIntervals=(np.diff(inner_peaks)*1000).tolist())
                        output.write(json.dumps(row, separators=(',', ':'), allow_nan=False)+'\n')
                        counts[condition] += 1
                manifest['subjects'].append(dict(subject=sid, windows=counts,
                    accRawRange=[float(np.min(wrist['ACC'])), float(np.max(wrist['ACC']))]))
                print(json.dumps(manifest['subjects'][-1]), flush=True)
                del subject, wrist, labels, bvp, acceleration, ecg, cleaned, detected, peak_seconds
                gc.collect()
    (args.output/'source-manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf8')

if __name__ == '__main__':
    main()
