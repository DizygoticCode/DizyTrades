import {expect,test} from "@playwright/test";

const captureSvg=async(page:import("@playwright/test").Page,path:string,title:string)=>{const jpeg=await page.screenshot({fullPage:true,type:"jpeg",quality:88}),size=page.viewportSize()??{width:1280,height:720},height=await page.evaluate(()=>document.documentElement.scrollHeight),svg=`<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size.width} ${height}" role="img" aria-label="${title}"><image width="${size.width}" height="${height}" href="data:image/jpeg;base64,${jpeg.toString("base64")}"/></svg>\n`;await import("node:fs/promises").then(fs=>fs.writeFile(path,svg,"utf8"));};

test("world lines and labels survive pan, future whitespace, and both zoom axes",async({page},testInfo)=>{
 await page.goto("/world-lines-fixture");const canvas=page.getByTestId("world-lines-canvas"),diagnostics=page.getByTestId("world-lines-diagnostics");await expect(canvas).toBeVisible();
 const original=JSON.parse(await diagnostics.textContent()||"{}").anchorSnapshot;
 await captureSvg(page,testInfo.outputPath("world-lines-before.svg"),"World lines before viewport movement");
 for(const control of ["anchors-left","future","zoom-x","zoom-y","drag-scale"]){await page.getByTestId(control).click();await expect.poll(async()=>JSON.parse(await diagnostics.textContent()||"{}").anchorSnapshot).toBe(original)}
 const pixels=await canvas.evaluate((node:HTMLCanvasElement)=>{const c=node.getContext("2d")!,data=c.getImageData(0,0,node.width,node.height).data;let coloured=0;for(let i=0;i<data.length;i+=4)if(data[i]>40||data[i+1]>40||data[i+2]>60)coloured++;return coloured});expect(pixels).toBeGreaterThan(1000);
 await captureSvg(page,testInfo.outputPath("world-lines-after.svg"),"World lines after panning and zooming into future whitespace");
});
