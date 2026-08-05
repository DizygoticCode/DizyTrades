"use client";

import {useCallback,useEffect,useState} from "react";
import {createPortal} from "react-dom";
import {
  DEFAULT_HEATMAP_DISPLAY_TUNING,
  readHeatmapDisplayTuning,
  writeHeatmapDisplayTuning,
  type HeatmapDisplayTuning,
  type HeatmapPalette,
  type HeatmapPriceGrouping,
  type HeatmapTimeSliceMs,
} from "./lib/order-flow/heatmap";

const LEGACY_FIELDS=new Set(["Colour map","Vertical smoothing","Manual price-bin size"]);

function NumberField({label,value,min,max,step=1,suffix,onChange,disabled=false}:{label:string;value:number;min:number;max:number;step?:number;suffix?:string;onChange:(value:number)=>void;disabled?:boolean}){
 return <label className="field-row"><span>{label}</span><span className="number-shell"><input aria-label={label} disabled={disabled} max={max} min={min} onChange={event=>onChange(Number(event.target.value))} step={step} type="number" value={value}/>{suffix?<em>{suffix}</em>:null}</span></label>;
}

function locateHeatmapHost(){
 for(const panel of document.querySelectorAll<HTMLElement>(".flow-settings")){
  const heading=[...panel.querySelectorAll<HTMLHeadingElement>("h3")].find(node=>node.textContent?.trim()==="Heatmap");
  if(!heading)continue;
  for(const label of panel.querySelectorAll<HTMLLabelElement>("label.field-row")){
   const name=label.querySelector("span")?.textContent?.trim();
   if(name&&LEGACY_FIELDS.has(name)){label.hidden=true;label.dataset.heatmapLegacyHidden="true"}
  }
  let host=panel.querySelector<HTMLElement>("[data-heatmap-display-host]");
  if(!host){host=document.createElement("div");host.dataset.heatmapDisplayHost="true";heading.insertAdjacentElement("afterend",host)}
  return host;
 }
 return null;
}

export function HeatmapSettingsPortal(){
 const[target,setTarget]=useState<HTMLElement|null>(null),[tuning,setTuning]=useState<HeatmapDisplayTuning>(DEFAULT_HEATMAP_DISPLAY_TUNING);
 useEffect(()=>setTuning(readHeatmapDisplayTuning()),[]);
 useEffect(()=>{
  let frame=0;const refresh=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const next=locateHeatmapHost();setTarget(current=>current===next?current:next)})};
  refresh();const observer=new MutationObserver(refresh);observer.observe(document.body,{childList:true,subtree:true});
  return()=>{cancelAnimationFrame(frame);observer.disconnect();document.querySelectorAll<HTMLElement>("[data-heatmap-legacy-hidden=true]").forEach(node=>{node.hidden=false;delete node.dataset.heatmapLegacyHidden});document.querySelectorAll<HTMLElement>("[data-heatmap-display-host]").forEach(node=>node.remove())};
 },[]);
 const update=useCallback((patch:Partial<HeatmapDisplayTuning>)=>{setTuning(current=>writeHeatmapDisplayTuning({...current,...patch}))},[]);
 if(!target)return null;
 return createPortal(<div className="heatmap-display-settings" data-testid="heatmap-display-settings">
  <p className="setting-help">Bookmap-style screen tuning. These controls change display aggregation and visual weight only; the live public depth feed remains authoritative.</p>
  <label className="field-row"><span>Colour palette</span><select aria-label="Heatmap colour palette" value={tuning.palette} onChange={event=>update({palette:event.target.value as HeatmapPalette})}><option value="bookmap">Bookmap</option><option value="thermal">Thermal</option><option value="ocean">Ocean</option></select></label>
  <NumberField label="Band height" min={3} max={24} step={.5} suffix="px" value={tuning.minimumPricePixels} onChange={minimumPricePixels=>update({minimumPricePixels})}/>
  <NumberField label="Minimum slice width" min={2.5} max={24} step={.5} suffix="px" value={tuning.minimumTimePixels} onChange={minimumTimePixels=>update({minimumTimePixels})}/>
  <label className="field-row"><span>Time-slice aggregation</span><select aria-label="Heatmap time-slice aggregation" value={tuning.timeSliceMs} onChange={event=>update({timeSliceMs:Number(event.target.value) as HeatmapTimeSliceMs})}><option value={0}>Automatic</option><option value={5000}>5 seconds</option><option value={15000}>15 seconds</option><option value={30000}>30 seconds</option><option value={60000}>1 minute</option></select></label>
  <label className="field-row"><span>Price grouping</span><select aria-label="Heatmap price grouping" value={tuning.priceGrouping} onChange={event=>update({priceGrouping:event.target.value as HeatmapPriceGrouping})}><option value="auto">Automatic by zoom</option><option value="exchange">Exchange tick</option><option value="manual">Manual step</option></select></label>
  <NumberField disabled={tuning.priceGrouping!=="manual"} label="Manual grouping step" min={.00000001} max={100000} step="any" as never value={tuning.manualPriceStep} onChange={manualPriceStep=>update({manualPriceStep})}/>
  <div className="heatmap-display-actions"><button className="secondary" type="button" onClick={()=>setTuning(writeHeatmapDisplayTuning(DEFAULT_HEATMAP_DISPLAY_TUNING))}>Restore Bookmap defaults</button><small>Default: 7px bands · 6px slices · 15s aggregation</small></div>
 </div>,target);
}
