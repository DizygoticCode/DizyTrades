import type { BookView,LiquidityObservation,RawTrade } from "./types.ts";
import type { OrderFlowSettings } from "./settings.ts";
export type FlowRenderSnapshot={generation:string;enabled:boolean;bookValid:boolean;captureStarted:number|null;heatmap:readonly LiquidityObservation[];trades:readonly RawTrade[];book:BookView;settings:OrderFlowSettings};
type Listener=()=>void;
const emptyBook:BookView={valid:false,version:-1,bids:[],asks:[]};
export class FlowRenderStore {
  private listeners=new Set<Listener>();private frame:number|null=null;
  private snapshot:FlowRenderSnapshot;
  constructor(settings:OrderFlowSettings){this.snapshot={generation:"",enabled:false,bookValid:false,captureStarted:null,heatmap:[],trades:[],book:emptyBook,settings};}
  getSnapshot=()=>this.snapshot;
  subscribe=(listener:Listener)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener)}};
  update(next:Partial<FlowRenderSnapshot>){this.snapshot={...this.snapshot,...next};this.requestNotification();}
  reset(generation:string,settings=this.snapshot.settings){this.snapshot={generation,enabled:settings.enabled,bookValid:false,captureStarted:settings.enabled?Date.now():null,heatmap:[],trades:[],book:emptyBook,settings};this.requestNotification();}
  requestNotification(){if(this.frame!==null)return;const flush=()=>{this.frame=null;this.listeners.forEach(listener=>listener())};this.frame=typeof requestAnimationFrame==="function"?requestAnimationFrame(flush):setTimeout(flush,0) as unknown as number;}
  destroy(){if(this.frame!==null){if(typeof cancelAnimationFrame==="function")cancelAnimationFrame(this.frame);else clearTimeout(this.frame);this.frame=null;}this.listeners.clear();}
}
