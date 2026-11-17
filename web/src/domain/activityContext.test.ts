import {describe,it,expect} from 'vitest';
import fixtures from '../../../tools/population/activity-artifacts/context-parity.json' with {type:'json'};
import {ActivityContext,predictPhysicalContext} from './activityContext';
import type {PopulationFeatures,PopulationObservation} from './populationFeatures';
const features=(heartRateMedian=65,logEnmo=Math.log1p(.1),logJerk=Math.log1p(.1)):PopulationFeatures=>({heartRateMedian,logEnmo,logJerk,prvAvailable:false,heartSource:'native',lnRmssd:null,lnSdnn:null,pnn50:null,pulseRejectedFraction:null,variabilitySource:null});
const observation=(at:number,f=features()):PopulationObservation=>({at,features:f,device:'test-watch',sessionId:'session',startNs:'1000000000',endNs:'61000000000',featureMethod:'wesad-wrist60-elgendi100-acc25-v1'});
describe('separate physical context',()=>{
 it('matches exported scikit-learn class outputs',()=>{
   for(const row of fixtures){const actual=predictPhysicalContext({...features(),...row.features});for(let c=0;c<3;c++)expect(actual[c]).toBeCloseTo(row.expected[c],12);}
 });
 it('never relabels a high body response during movement as high psychological stress or fake zero',()=>{
   const context=new ActivityContext(),result=context.assess(observation(100000,features(110,Math.log1p(120),Math.log1p(50))),92);
   expect(result.status).toBe('movement');expect(result.stressScore).toBeNull();expect(result.bodyResponseScore).toBe(92);
 });
 it('keeps a two-minute recovery interval and releases it without changing an eligible raw score',()=>{
   const context=new ActivityContext();context.assess(observation(100000,features(110,6,6)),90);
   const recovery=context.assess(observation(200000),33);expect(recovery.status).toBe('recovery');expect(recovery.stressScore).toBeNull();
   const calm=context.assess(observation(221000),33);expect(calm.status).toBe('eligible');expect(calm.stressScore).toBe(33);
 });
});
