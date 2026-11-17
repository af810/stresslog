/** Descriptive comparison. Candidate scores are outer subject-held-out.
 * WESAD is independent of Hongn. The current guard is NOT evaluated here because
 * its shipped classifier contains these Hongn participants; using it would leak.
 */
import fs from 'node:fs';
import {predictPopulationStress} from '../../web/src/domain/populationStress.ts';
const [input,output]=process.argv.slice(2),rows=JSON.parse(fs.readFileSync(input,'utf8'));
const result={candidateEvaluation:'Outer leave-one-person-out, inner 3-fold physical adjustment cross-fit',currentEvaluation:'Independent WESAD classifier on the final 60 s of each candidate window; no current movement/recovery guard, no temporal smoothing',thresholds:{},limits:['Matched endpoints but 60 s and 120 s inputs have different meanings.','The current shipped activity guard was deliberately not evaluated in-sample.','These rates are not event precision, real-life accuracy or candidate adoption criteria.','Temporal event performance has not been evaluated on 30 s hop annotated sequences.']};
for(const threshold of [50,65]){
 result.thresholds[threshold]={};
 for(const [label,name] of [[0,'rest'],[1,'stress_task'],[2,'exercise_recovery']]){
  const selected=rows.filter(r=>r.label===label);result.thresholds[threshold][name]={windows:selected.length,currentBodyHighRate:selected.filter(r=>predictPopulationStress(r.latest)?.value>=threshold).length/selected.length,candidateRawHighRate:selected.filter(r=>r.score>=threshold).length/selected.length};
 }
}
fs.writeFileSync(output,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
