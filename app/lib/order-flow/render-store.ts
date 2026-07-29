import type { BookView,LiquidityObservation,RawTrade } from "./types.ts";
import type { OrderFlowSettings } from "./settings.ts";

export type FlowRenderDiagnostics={
  primitiveAttached:boolean;renderEnabled:boolean;heatmapVisible:boolean;bubblesVisible:boolean;paintCallCount:number;candleCount:number;
  visibleLogicalRange:{from:number;to:number}|null;heatmapObservationsRetained:number;heatmapCandidateCells:number;heatmapProjectedCells:number;
  heatmapCellsDrawn:number;rawTradesRetained:number;bubbleGroupsProduced:number;bubblesRejectedBelowThreshold:number;
  bubblesRejectedByTimeProjection:number;bubblesRejectedByPriceProjection:number;bubblesDrawn:number;currentPriceStep:number;
  lastRendererError:string|null;sourceFeedConnected:boolean|null;failure:string|null;heatmapDrawnBounds:{minX:number;maxX:number}|null;bubbleXCoordinates:number[];
};
export type FlowRenderSnapshot={generation:string;enabled:boolean;bookValid:boolean;captureStarted:number|null;priceStep:number;heatmap:readonly LiquidityObservation[];trades:readonly RawTrade[];book:BookView;settings:OrderFlowSettings};
type Listener=()=>void;
const emptyBook:BookView={valid:false,version:-1,bids:[],asks:[]};
const initialDiagnostics=(settings:OrderFlowSettings):FlowRenderDiagnostics=>({primitiveAttached:false,renderEnabled:false,heatmapVisible:settings.heatmapVisible,bubblesVisible:settings.bubblesVisible,paintCallCount:0,candleCount:0,visibleLogicalRange:null,heatmapObservationsRetained:0,heatmapCandidateCells:0,heatmapProjectedCells:0,heatmapCellsDrawn:0,rawTradesRetained:0,bubbleGroupsProduced:0,bubblesRejectedBelowThreshold:0,bubblesRejectedByTimeProjection:0,bubblesRejectedByPriceProjection:0,bubblesDrawn:0,currentPriceStep:1,lastRendererError:null,sourceFeedConnected:null,failure:null,heatmapDrawnBounds:null,bubbleXCoordinates:[]});

export class FlowRenderStore {
  private listeners=new Set<Listener>();private diagnosticListeners=new Set<Listener>();private frame:number|null=null;private diagnosticTimer:ReturnType<typeof setTimeout>|null=null;
  private snapshot:FlowRenderSnapshot;private diagnostics:FlowRenderDiagnostics;
  constructor(settings:OrderFlowSettings){this.snapshot={generation:"",enabled:false,bookValid:false,captureStarted:null,priceStep:1,heatmap:[],trades:[],book:emptyBook,settings};this.diagnostics=initialDiagnostics(settings);}
  getSnapshot=()=>this.snapshot;getDiagnostics=()=>this.diagnostics;
  subscribe=(listener:Listener)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener)}};
  subscribeDiagnostics=(listener:Listener)=>{this.diagnosticListeners.add(listener);return()=>{this.diagnosticListeners.delete(listener)}};
  update(next:Partial<FlowRenderSnapshot>){this.snapshot={...this.snapshot,...next};this.requestNotification();}
  updateDiagnostics(next:Partial<FlowRenderDiagnostics>){this.diagnostics={...this.diagnostics,...next};if(this.diagnosticTimer===null)this.diagnosticTimer=setTimeout(()=>{this.diagnosticTimer=null;this.diagnosticListeners.forEach(listener=>listener())},250);}
  reset(generation:string,settings=this.snapshot.settings){this.snapshot={generation,enabled:settings.enabled,bookValid:false,captureStarted:settings.enabled?Date.now():null,priceStep:this.snapshot.priceStep,heatmap:[],trades:[],book:emptyBook,settings};this.diagnostics={...initialDiagnostics(settings),primitiveAttached:this.diagnostics.primitiveAttached};this.requestNotification();}
  requestNotification(){if(this.frame!==null)return;const flush=()=>{this.frame=null;this.listeners.forEach(listener=>listener())};this.frame=typeof requestAnimationFrame==="function"?requestAnimationFrame(flush):setTimeout(flush,0) as unknown as number;}
  destroy(){if(this.frame!==null){if(typeof cancelAnimationFrame==="function")cancelAnimationFrame(this.frame);else clearTimeout(this.frame);this.frame=null;}if(this.diagnosticTimer!==null)clearTimeout(this.diagnosticTimer);this.listeners.clear();this.diagnosticListeners.clear();}
}
