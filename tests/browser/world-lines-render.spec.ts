import {expect,test} from "@playwright/test";
const expected=["Upper trend","Lower trend","LR Upper","LR Basis","LR Lower"];
test("native strategy primitive survives pan, zoom, and price-scale changes",async({page},testInfo)=>{
 await page.goto("/world-lines-fixture");const chart=page.getByTestId("world-lines-chart"),diagnostics=page.getByTestId("world-lines-diagnostics");await expect(chart).toBeVisible();
 const read=async()=>JSON.parse(await diagnostics.textContent()||"{}");await expect.poll(async()=>((await read()).paint.ids as string[]).sort()).toEqual([...expected].sort());const original=(await read()).anchorSnapshot;
 for(const control of ["anchors-left","future","zoom-x","zoom-out","pan-left","zoom-y","drag-scale","original"]){await page.getByTestId(control).click();await expect.poll(async()=>((await read()).paint.ids as string[]).sort()).toEqual([...expected].sort());expect((await read()).anchorSnapshot).toBe(original)}
 await expect(chart.locator("canvas").first()).toBeVisible();await page.screenshot({path:testInfo.outputPath("strategy-world-lines.png"),fullPage:true});
});
