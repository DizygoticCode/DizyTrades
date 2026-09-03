import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DIZYQUANT_CAMPAIGN_RECORDER_STORE_DEFAULT_MAX_BYTES,
  DIZYQUANT_CAMPAIGN_RECORDER_STORE_MAX_CONFIGURABLE_BYTES,
  readDizyQuantCampaignRecorderState,
  resolveDizyQuantCampaignRecorderStoreMaxBytes,
} from "../app/lib/dizyquant/campaign-recorder-store.ts";

const maxDiskEnv = "DIZYQUANT_CAMPAIGN_RECORDER_MAX_DISK_MB";

test("campaign recorder store resolves a bounded configurable byte limit", () => {
  const previous = process.env[maxDiskEnv];
  try {
    delete process.env[maxDiskEnv];
    assert.equal(
      resolveDizyQuantCampaignRecorderStoreMaxBytes(),
      DIZYQUANT_CAMPAIGN_RECORDER_STORE_DEFAULT_MAX_BYTES,
    );

    process.env[maxDiskEnv] = "512";
    assert.equal(resolveDizyQuantCampaignRecorderStoreMaxBytes(), 512 * 1024 * 1024);

    process.env[maxDiskEnv] = "2048";
    assert.equal(
      resolveDizyQuantCampaignRecorderStoreMaxBytes(),
      DIZYQUANT_CAMPAIGN_RECORDER_STORE_MAX_CONFIGURABLE_BYTES,
    );

    process.env[maxDiskEnv] = "not-a-number";
    assert.equal(
      resolveDizyQuantCampaignRecorderStoreMaxBytes(),
      DIZYQUANT_CAMPAIGN_RECORDER_STORE_DEFAULT_MAX_BYTES,
    );
  } finally {
    if (previous === undefined) delete process.env[maxDiskEnv];
    else process.env[maxDiskEnv] = previous;
  }
});

test("campaign recorder store requires an explicit durable DATA_DIR", async () => {
  const previous = process.env.DATA_DIR;
  delete process.env.DATA_DIR;
  try {
    await assert.rejects(
      () => readDizyQuantCampaignRecorderState(),
      /explicit durable DATA_DIR/,
    );
  } finally {
    if (previous !== undefined) process.env.DATA_DIR = previous;
  }
});

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
