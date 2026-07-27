import assert from "node:assert/strict";
import test from "node:test";
import {DEFAULT_VIEW,sanitiseTerminalSettings} from "../app/lib/config.ts";
test("signal labels default to Small and full-width opaque lines",()=>{assert.equal(DEFAULT_VIEW.signalBubbleSize,"Small");assert.equal(DEFAULT_VIEW.globalLineExtensionOverride,"both");assert.equal(DEFAULT_VIEW.fadeExtendedPortions,false);});
test("legacy implicit Large migrates once while v2 choice persists",()=>{assert.equal(sanitiseTerminalSettings({view:{signalBubbleSize:"Large"}}).view.signalBubbleSize,"Small");assert.equal(sanitiseTerminalSettings({view:{settingsSchemaVersion:2,signalBubbleSize:"Large"}}).view.signalBubbleSize,"Large");});
test("every signal size is accepted",()=>{for(const size of ["Tiny","Small","Medium","Large","Extra Large"])assert.equal(sanitiseTerminalSettings({view:{settingsSchemaVersion:2,signalBubbleSize:size}}).view.signalBubbleSize,size);});
