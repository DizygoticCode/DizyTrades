export const PAPER_SIZE_STOPS=[0,25,50,75,100] as const;
export function sliderToAmount(percent:number,equity:number,mode:"fixed-margin"|"fixed-notional"|"equity-percent",leverage:number){const safe=Math.min(100,Math.max(0,percent));if(mode==="equity-percent")return safe;const margin=equity*safe/100;return mode==="fixed-notional"?margin*Math.max(1,leverage):margin;}
