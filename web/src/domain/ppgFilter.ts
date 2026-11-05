/** Diagnostic zero-phase cascade: 2nd-order HP 0.5 Hz + LP 4 Hz.
 * Algorithm versioning is essential: baselines from other filters are incompatible.
 * Not a clinically validated beat detector. */
export function bandpassPpg(input: number[], fs: number): number[] {
  if(fs<20 || fs>250 || input.length<fs*3) throw Error('フィルターに必要なサンプルが不足しています');
  function biquad(x: number[], cutoff: number, highpass: boolean) {
    const w=2*Math.PI*cutoff/fs, c=Math.cos(w), alpha=Math.sin(w)/(2*Math.SQRT1_2), a0=1+alpha;
    const b0=(highpass?(1+c):(1-c))/2/a0, b1=(highpass?-(1+c):(1-c))/a0, b2=b0;
    const a1=-2*c/a0, a2=(1-alpha)/a0;
    let x1=0,x2=0,y1=0,y2=0;
    return x.map(v=>{const y=b0*v+b1*x1+b2*x2-a1*y1-a2*y2;x2=x1;x1=v;y2=y1;y1=y;return y;});
  }
  const pad=Math.min(Math.round(fs*3),input.length-1), offset=input[0];
  const x=input.map(v=>v-offset);
  const padded=[...x.slice(1,pad+1).reverse().map(v=>2*x[0]-v),...x,...x.slice(-pad-1,-1).reverse().map(v=>2*x[x.length-1]-v)];
  const forward=biquad(biquad(padded,.5,true),4,false);
  const backward=biquad(biquad(forward.reverse(),.5,true),4,false).reverse();
  return backward.slice(pad,pad+input.length);
}
