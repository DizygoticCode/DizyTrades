import assert from "node:assert/strict";
import test from "node:test";
import {DEFAULT_VIEW,sanitiseTerminalSettings} from "../app/lib/config.ts";
test("signal labels default to Small and full-width opaque lines",()=>{assert.equal(DEFAULT_VIEW.signalBubbleSize,"Small");assert.equal(DEFAULT_VIEW.globalLineExtensionOverride,"both");assert.equal(DEFAULT_VIEW.fadeExtendedPortions,false);});
test("legacy implicit Large migrates once while v2 choice persists",()=>{assert.equal(sanitiseTerminalSettings({view:{signalBubbleSize:"Large"}}).view.signalBubbleSize,"Small");assert.equal(sanitiseTerminalSettings({view:{settingsSchemaVersion:2,signalBubbleSize:"Large"}}).view.signalBubbleSize,"Large");});
test("every signal size is accepted",()=>{for(const size of ["Tiny","Small","Medium","Large","Extra Large"])assert.equal(sanitiseTerminalSettings({view:{settingsSchemaVersion:2,signalBubbleSize:size}}).view.signalBubbleSize,size);});

test("user profile sanitisation persists every volume bubble control",()=>{
 const input={orderFlow:{bubbles:{buyColour:"#102030",sellColour:"#405060",outlineColour:"#708090",opacity:.45,outlineOpacity:.8,timeBucketMs:5000,priceMode:"fixed",fixedPriceStep:2.5,minimumNotional:7654,adaptive:true,percentile:.94,minimumRadius:7,maximumRadius:31,maximumRetained:12345}}};
 const saved=sanitiseTerminalSettings(input).orderFlow.bubbles;
 assert.deepEqual({buyColour:saved.buyColour,sellColour:saved.sellColour,outlineColour:saved.outlineColour,opacity:saved.opacity,outlineOpacity:saved.outlineOpacity,timeBucketMs:saved.timeBucketMs,priceMode:saved.priceMode,fixedPriceStep:saved.fixedPriceStep,minimumNotional:saved.minimumNotional,adaptive:saved.adaptive,percentile:saved.percentile,minimumRadius:saved.minimumRadius,maximumRadius:saved.maximumRadius,maximumRetained:saved.maximumRetained},input.orderFlow.bubbles);
});
