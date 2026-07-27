export function percentile(values:number[],p=0.95){if(!values.length)return 0;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.max(0,Math.floor((sorted.length-1)*p)))]!;}
export function logarithmicIntensity(value:number,ceiling:number){return value<=0||ceiling<=0?0:Math.min(1,Math.log1p(value)/Math.log1p(ceiling));}
