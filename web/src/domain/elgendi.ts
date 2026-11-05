/** Experimental reproduction of the detector described by Elgendi et al. (2013).
 * https://doi.org/10.1371/journal.pone.0076585
 * Pixel Watch channel/beat timing validity still needs independent verification.
 * No coefficients/thresholds are fitted to watch HR, user labels or these recordings.
 */
export const ELGENDI_METHOD='prv-elgendi2013-v3';

export function elgendiCoefficients(fs:number) {
  if(!Number.isFinite(fs)||fs<20||fs>250)throw Error('対応するサンプリング周波数の範囲外です');
  // Second-order Butterworth prototype transformed to a fourth-order bandpass.
  // Prewarp analog corner frequencies, then apply the bilinear transform.
  const k=2*fs,lo=k*Math.tan(Math.PI*.5/fs),hi=k*Math.tan(Math.PI*8/fs);
  const width=hi-lo,w0Squared=lo*hi;
  const analog=[w0Squared*w0Squared,Math.SQRT2*width*w0Squared,width*width+2*w0Squared,Math.SQRT2*width,1];
  const powers=[[1,4,6,4,1],[1,2,0,-2,-1],[1,0,-2,0,1],[1,-2,0,2,-1],[1,-4,6,-4,1]];
  const a=Array.from({length:5},(_,j)=>analog.reduce((s,v,i)=>s+v*k**i*powers[i][j],0));
  const a0=a[0],gain=width*width*k*k/a0;
  return {a:a.map(v=>v/a0),b:[gain,0,-2*gain,0,gain]};
}

export function elgendiBandpass(input:number[],fs:number) {
  if(input.length<fs*3||input.some(v=>!Number.isFinite(v)))throw Error('フィルターに必要なデータが不足しています');
  const {a,b}=elgendiCoefficients(fs);
  function filter(x:number[]) {
    const state=[0,0,0,0];
    return x.map(v=>{
      const y=b[0]*v+state[0];
      for(let j=0;j<3;j++)state[j]=b[j+1]*v-a[j+1]*y+state[j+1];
      state[3]=b[4]*v-a[4]*y;
      return y;
    });
  }
  const offset=input[0],x=input.map(v=>v-offset),pad=Math.min(Math.round(3*fs),x.length-1);
  // Explicit implementation choice: 3 s odd reflection, zero initial filter state.
  // Edge exclusion is applied by the caller, separately from filter padding.
  const padded=[...x.slice(1,pad+1).reverse().map(v=>-v),...x,...x.slice(-pad-1,-1).reverse().map(v=>2*x[x.length-1]-v)];
  return filter(filter(padded).reverse()).reverse().slice(pad,pad+x.length);
}

export function elgendiPeaks(wave:number[],fs:number):number[] {
  if(!wave.length)return [];
  const odd=(seconds:number)=>Math.max(1,2*Math.round((seconds*fs-1)/2)+1);
  const squared=wave.map(v=>Math.max(v,0)**2);
  function smooth(width:number) {
    const half=(width-1)/2,sums=[0];
    for(const v of squared)sums.push(sums[sums.length-1]+v);
    return squared.map((_,i)=>{
      const left=Math.max(0,i-half),right=Math.min(squared.length,i+half+1);
      return (sums[right]-sums[left]+Math.max(0,half-i)*squared[0]+Math.max(0,i+half+1-squared.length)*squared[squared.length-1])/width;
    });
  }
  const width=odd(.111),short=smooth(width),long=smooth(odd(.667));
  const offset=.02*squared.reduce((s,v)=>s+v,0)/squared.length;
  const peaks:number[]=[];let start=-1;
  for(let i=0;i<=wave.length;i++) {
    const above=i<wave.length&&short[i]>long[i]+offset;
    if(above&&start<0)start=i;
    if(!above&&start>=0) {
      if(i-start>=width) {
        let peak=start;for(let j=start+1;j<i;j++)if(wave[j]>wave[peak])peak=j;
        peaks.push(peak);
      }
      start=-1;
    }
  }
  return peaks;
}
