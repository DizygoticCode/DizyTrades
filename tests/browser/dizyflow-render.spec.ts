import { expect, test } from "@playwright/test";

test("the actual DizyFlow canvas paints configurable Bookmap bands beneath candles", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/dizyflow-fixture");

  const chart = page.getByTestId("dizyflow-production-fixture");
  const diagnostics = page.getByTestId("dizyflow-render-diagnostics");
  await expect(chart).toBeVisible();

  const read = async () =>
    JSON.parse((await diagnostics.textContent()) || "{}");
  await expect
    .poll(async () => (await read()).heatmapCellsDrawn ?? 0)
    .toBeGreaterThan(3);
  await expect
    .poll(async () => (await read()).bubblesDrawn ?? 0)
    .toBeGreaterThan(0);

  const pixels = await chart.locator("canvas").evaluateAll((canvases) => {
    const thirds = [0, 0, 0];
    const candle = [0, 0, 0];
    for (const element of canvases) {
      const canvas = element as HTMLCanvasElement;
      const context = canvas.getContext("2d");
      if (!context) continue;
      const { data, width, height } = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      );
      for (let y = 0; y < height; y += 2)
        for (let x = 0; x < width; x += 2) {
          const i = (y * width + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          if (a > 25 && (b > 55 || g > 70))
            thirds[Math.min(2, Math.floor(x / Math.max(1, width / 3)))]++;
          if (
            a > 120 &&
            ((g > 150 && r < 100) || (r > 180 && g < 150))
          )
            candle[Math.min(2, Math.floor(x / Math.max(1, width / 3)))]++;
        }
    }
    return { thirds, candle };
  });

  expect(pixels.thirds.every((value) => value > 20)).toBe(true);
  expect(pixels.candle.some((value) => value > 2)).toBe(true);

  let snapshot = await read();
  expect(
    snapshot.heatmapDrawnBounds.maxX - snapshot.heatmapDrawnBounds.minX,
  ).toBeGreaterThan(300);
  expect(snapshot.heatmapMinimumCellWidthPx).toBeGreaterThanOrEqual(7.99);
  expect(snapshot.heatmapMinimumCellHeightPx).toBeGreaterThanOrEqual(7.99);
  expect(snapshot.effectiveTimeSliceMs).toBe(15000);
  expect(snapshot.heatmapMaximumCellWidthPx).toBeGreaterThan(
    snapshot.heatmapMinimumCellWidthPx,
  );

  await page.evaluate(() => {
    const panel = document.createElement("section");
    panel.className = "flow-settings";
    panel.innerHTML =
      '<h3>Heatmap</h3><label class="field-row"><span>Colour map</span><select><option>Legacy</option></select></label><label class="field-row"><span>Vertical smoothing</span><select><option>Legacy</option></select></label><label class="field-row"><span>Manual price-bin size</span><input value="1"></label><h3>Volume bubbles</h3>';
    document.body.append(panel);
  });

  const controls = page.getByTestId("heatmap-display-settings");
  await expect(controls).toBeVisible();
  await expect(
    page.locator("label.field-row", { hasText: "Colour map" }),
  ).toBeHidden();

  await page.getByLabel("Heatmap colour palette").selectOption("thermal");
  await page.getByLabel("Band height").fill("12");
  await page.getByLabel("Minimum slice width").fill("10");
  await page
    .getByLabel("Heatmap time-slice aggregation")
    .selectOption("30000");
  await page.getByLabel("Heatmap detection range").selectOption("1000");

  await expect
    .poll(async () => (await read()).heatmapMinimumCellHeightPx ?? 0)
    .toBeGreaterThanOrEqual(11.99);
  await expect
    .poll(async () => (await read()).heatmapMinimumCellWidthPx ?? 0)
    .toBeGreaterThanOrEqual(9.99);
  await expect
    .poll(async () => (await read()).effectiveTimeSliceMs ?? 0)
    .toBe(30000);

  const stored = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem("dizytrades:heatmap-display:v1") || "{}",
    ),
  );
  expect(stored.palette).toBe("thermal");
  expect(stored.minimumPricePixels).toBe(12);
  expect(stored.minimumTimePixels).toBe(10);
  expect(stored.timeSliceMs).toBe(30000);
  expect(stored.detectionRangeBps).toBe(1000);

  snapshot = await read();
  expect(snapshot.lastRendererError).toBeNull();
  expect(errors).toEqual([]);
});
