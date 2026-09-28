import assert from "node:assert/strict";
import test from "node:test";
import manifest from "../app/manifest.ts";

test("home-screen metadata is scoped to the existing HTTPS server app", () => {
  const metadata = manifest();
  assert.equal(metadata.id, "/");
  assert.equal(metadata.start_url, "/");
  assert.equal(metadata.scope, "/");
  assert.equal(metadata.display, "standalone");
  assert.equal(metadata.theme_color, "#080a10");
  assert.equal(metadata.background_color, "#080a10");
  assert.deepEqual(metadata.icons, [
    { src: "/icon-192.png", type: "image/png", sizes: "192x192", purpose: "any" },
    { src: "/icon-512.png", type: "image/png", sizes: "512x512", purpose: "any" },
    { src: "/icon-maskable-512.png", type: "image/png", sizes: "512x512", purpose: "maskable" },
    { src: "/brand/dizy-mark.svg", type: "image/svg+xml", sizes: "any", purpose: "any" },
  ]);
  assert.match(metadata.description, /Live exchange execution remains disabled/);
  assert.equal("related_applications" in metadata, false);
});
