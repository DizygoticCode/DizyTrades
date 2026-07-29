import {expect,test} from "@playwright/test";
test("the production DizyFlow primitive paints heatmap cells and historical bubbles",async({page},testInfo)=>{
 const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
 await page.goto("/dizyflow-fixture");
 const chart=page.getByTestId("dizyflow-production-fixture");await expect(chart).toBeVisible();await expect(chart.locator("canvas").first()).toBeVisible();
 const diagnostics=page.getByTestId("dizyflow-render-diagnostics");
 const read=async()=>JSON.parse((await diagnostics.textContent())||"{}");
 await expect.poll(async()=>({cells:(await read()).heatmapCellsDrawn,bubbles:(await read()).bubblesDrawn})).toMatchObject({cells:expect.any(Number),bubbles:expect.any(Number)});
 await expect.poll(async()=>((await read()).heatmapCellsDrawn??0)).toBeGreaterThan(0);
 await expect.poll(async()=>((await read()).bubblesDrawn??0)).toBeGreaterThan(5);
 let snapshot=await read();expect(snapshot.heatmapDrawnBounds.maxX-snapshot.heatmapDrawnBounds.minX).toBeGreaterThan(300);
 expect(new Set(snapshot.bubbleXCoordinates.map((x:number)=>Math.round(x))).size).toBeGreaterThan(5);expect(snapshot.bubbleXCoordinates.filter((x:number)=>x>20).length).toBeGreaterThan(5);
 await page.getByTestId("fixture-zoom-in").click();await expect.poll(async()=>((await read()).heatmapCellsDrawn??0)).toBeGreaterThan(0);await expect.poll(async()=>((await read()).bubblesDrawn??0)).toBeGreaterThan(0);
 const box=await chart.boundingBox();if(!box)throw Error("chart bounds unavailable");await page.mouse.move(box.x+box.width*.7,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.55,box.y+box.height*.5,{steps:5});await page.mouse.up();await page.getByTestId("fixture-zoom-out").click();
 await expect.poll(async()=>((await read()).heatmapCellsDrawn??0)).toBeGreaterThan(0);await expect.poll(async()=>((await read()).bubblesDrawn??0)).toBeGreaterThan(5);
 snapshot=await read();console.log("DizyFlow fixture diagnostics",JSON.stringify(snapshot));expect(snapshot.lastRendererError).toBeNull();expect(errors).toEqual([]);
 const screenshot=testInfo.outputPath("dizyflow-fixture.png");await page.screenshot({path:screenshot,fullPage:true});await testInfo.attach("dizyflow-fixture",{path:screenshot,contentType:"image/png"});
});
