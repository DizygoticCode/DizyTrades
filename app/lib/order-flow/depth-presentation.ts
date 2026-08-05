import type {DepthEnvelope} from "./types.ts";

export const DOM_DEPTH_LEVEL_CAP=100;

/** Keep the shared collector broad for the heatmap while bounding the 4 Hz DOM payload. */
export function capDepthEnvelopeForDom(envelope:DepthEnvelope,maxLevels=DOM_DEPTH_LEVEL_CAP):DepthEnvelope{
 const limit=Math.max(1,Math.floor(Number.isFinite(maxLevels)?maxLevels:DOM_DEPTH_LEVEL_CAP));
 return{...envelope,snapshot:{...envelope.snapshot,bids:envelope.snapshot.bids.slice(0,limit),asks:envelope.snapshot.asks.slice(0,limit)}};
}
