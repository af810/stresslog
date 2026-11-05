"""Offline electrical/optical access inspection; never a diagnostic ECG reader.

The ECG channel interpretation and detector are exploratory. R candidates must
be reviewed on the waveform before using them as a timing reference. This tool
does not write application measurements, labels, models, or quality thresholds.
"""
import json
import os
import sys
from pathlib import Path

local_root = Path(__file__).resolve().parents[2] / '.stresslog-local'
sys.path.insert(0, str(local_root / 'analysis-python'))
os.environ.setdefault('MPLCONFIGDIR', str(local_root / 'matplotlib'))
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from scipy.signal import butter, sosfiltfilt, find_peaks

source = Path(sys.argv[1]).resolve()
report = json.loads(source.read_text(encoding='utf-8'))
if report.get('mode') != 'simultaneous_ecg_ppg_access_probe':
    raise ValueError('Not a simultaneous reference probe')
origin = int(report['startedElapsedNs'])

def series(sensor, channel):
    rows = [event for event in report['events'] if event['sensorStringType'] == sensor]
    t = np.array([(int(row['sensorTimestampNs']) - origin) / 1e9 for row in rows])
    x = np.array([row['values'][channel] for row in rows], dtype=float)
    if len(t) < 100 or not np.all(np.isfinite(x)) or np.any(np.diff(t) <= 0):
        raise ValueError('Missing or invalid waveform')
    return t, x

ecg_t, ecg = series('com.google.sensor.ecg', 0)
ppg_t, ppg = series('com.google.wear.sensor.ppg', 1)
fs = 1 / np.median(np.diff(ecg_t))
filtered = sosfiltfilt(butter(2, [5, 25], btype='bandpass', fs=fs, output='sos'), ecg)
middle = (ecg_t >= 10) & (ecg_t <= 59)
mad = np.median(np.abs(filtered[middle] - np.median(filtered[middle])))
threshold = 5 * mad
indices, _ = find_peaks(filtered, distance=round(.35 * fs), prominence=threshold)
indices = indices[(ecg_t[indices] >= 10) & (ecg_t[indices] <= 59)]
rr = np.diff(ecg_t[indices]) * 1000
ecg_metrics = dict(candidateCount=len(indices), medianIntervalMs=float(np.median(rr)),
    minIntervalMs=float(rr.min()), maxIntervalMs=float(rr.max()),
    candidateIntervalRmssdMs=float(np.sqrt(np.mean(np.diff(rr)**2))), prominence=float(threshold))

normal_layouts = {'channel5': 0, 'channel6': 0, 'other': 0}
for event in report['events']:
    if event['sensorStringType'] != 'com.google.wear.sensor.ppg':
        continue
    v = event['values']
    known = len(v) == 16 and v[0] < 0 and v[1] > 0 and v[3] > 0 and not any(v[7:])
    key = 'channel6' if known and v[6] > 0 and v[5] < 0 else 'channel5' if known and v[6] == 0 and v[5] > 0 and v[4] < 0 else 'other'
    normal_layouts[key] += 1

fig, axes = plt.subplots(4, 1, figsize=(13, 10), layout='constrained')
axes[0].plot(ecg_t, ecg, linewidth=.6)
axes[0].set_ylim(*np.quantile(ecg[middle], [.005, .995]))
axes[0].set_title('Simultaneous watch reference probe - raw electrical channel 0 (display clipped)')
axes[0].set_ylabel('Raw units')
axes[1].plot(ecg_t, filtered, linewidth=.6)
axes[1].scatter(ecg_t[indices], filtered[indices], s=12, color='#d33', label='Exploratory R candidates')
axes[1].set_ylim(*np.quantile(filtered[middle], [.001, .999]))
axes[1].legend(loc='upper right')
axes[1].set_ylabel('ECG 5-25 Hz')
zoom = (ecg_t >= 15) & (ecg_t <= 25)
axes[2].plot(ecg_t[zoom], ecg[zoom], linewidth=.8)
near = indices[(ecg_t[indices] >= 15) & (ecg_t[indices] <= 25)]
axes[2].scatter(ecg_t[near], ecg[near], s=15, color='#d33')
axes[2].set_ylabel('ECG raw / zoom')
axes[2].set_xlim(15, 25)
ppg_zoom = (ppg_t >= 15) & (ppg_t <= 25)
axes[3].plot(ppg_t[ppg_zoom], ppg[ppg_zoom], linewidth=.8, color='#087f8c')
for time in ecg_t[near]:
    axes[3].axvline(time, color='#d33', alpha=.3, linewidth=.8)
axes[3].set_ylabel('Optical channel 1')
axes[3].set_xlim(15, 25)
for axis in axes:
    axis.set_xlabel('Seconds from shared sensor clock origin')
    axis.grid(alpha=.2)
figure = source.with_name('reference-waveforms.png')
fig.savefig(figure, dpi=150)
plt.close(fig)
summary = dict(source=str(source), waveform=str(figure), ecgChannel=0, opticalChannel=1,
    ecgSamplingHz=float(fs), ecgMetrics=ecg_metrics, candidateSeconds=ecg_t[indices].tolist(),
    normalLiveLayoutCounts=normal_layouts, rCandidatesNeedManualAdjudication=True,
    validated=False, applicationUse=False,
    limitation='One short recording, undocumented vendor fields, ECG mode changes PPG layout. Exploratory R detector, not clinically validated or manually adjudicated. Not validation of ordinary optical mode or stress estimation.')
source.with_name('reference-inspection.json').write_text(json.dumps(summary, indent=2)+'\n', encoding='utf-8')
print(json.dumps({key:summary[key] for key in ['source','waveform','ecgSamplingHz','normalLiveLayoutCounts','validated']}))
