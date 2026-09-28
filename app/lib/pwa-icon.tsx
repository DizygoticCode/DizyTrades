import { ImageResponse } from "next/og";

// Identical mark geometry/gradients to public/brand/dizy-mark.svg.
// The background and safe-area padding are deliberately opaque for Android.
const markSvg = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 128 128\"><defs><linearGradient id=\"dizyStroke\" x1=\"18\" y1=\"20\" x2=\"110\" y2=\"108\" gradientUnits=\"userSpaceOnUse\"><stop stop-color=\"#9A83FF\"/><stop offset=\"1\" stop-color=\"#57A5FF\"/></linearGradient><linearGradient id=\"dizyBars\" x1=\"44\" y1=\"88\" x2=\"89\" y2=\"35\" gradientUnits=\"userSpaceOnUse\"><stop stop-color=\"#2EE6A6\"/><stop offset=\"1\" stop-color=\"#71FFD0\"/></linearGradient></defs><path d=\"M27 20h35c28 0 48 18 48 44s-20 44-48 44H27V20Z\" fill=\"none\" stroke=\"url(#dizyStroke)\" stroke-width=\"11\" stroke-linejoin=\"round\"/><path d=\"M43 87V68\" stroke=\"url(#dizyBars)\" stroke-width=\"10\" stroke-linecap=\"round\"/><path d=\"M64 87V53\" stroke=\"url(#dizyBars)\" stroke-width=\"10\" stroke-linecap=\"round\"/><path d=\"M85 87V38\" stroke=\"url(#dizyBars)\" stroke-width=\"10\" stroke-linecap=\"round\"/><circle cx=\"43\" cy=\"59\" r=\"5\" fill=\"#9A83FF\"/><circle cx=\"64\" cy=\"44\" r=\"5\" fill=\"#9A83FF\"/><circle cx=\"85\" cy=\"29\" r=\"5\" fill=\"#9A83FF\"/></svg>";

export function pwaIcon(size: 180 | 192 | 512, { maskable = false } = {}) {
  const markSize = Math.round(size * (maskable ? 0.65 : 0.9));
  const markData = "data:image/svg+xml;base64," + Buffer.from(markSvg).toString("base64");
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", backgroundColor: "#080a10" }}>
      <img src={markData} alt="" width={markSize} height={markSize} />
    </div>,
    { width: size, height: size },
  );
}
