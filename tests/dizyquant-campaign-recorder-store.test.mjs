import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readDizyQuantCampaignRecorderState } from "../app/lib/dizyquant/campaign-recorder-store.ts";

test("campaign recorder store never converts corrupt persisted research into an empty campaign", async () => {
  const root = await mkdtemp(join(tmpdir(), "dizyquant-corrupt-campaign-"));
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = root;
  try {
    const directory = join(root, "dizyquant", "campaign");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "representative-v1.json"), "{not-valid-json", "utf8");
    await assert.rejects(
      () => readDizyQuantCampaignRecorderState(),
      /Unexpected token|JSON|position/i,
    );
  } finally {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});
