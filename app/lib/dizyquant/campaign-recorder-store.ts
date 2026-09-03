import "server-only";

import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  emptyDizyQuantCampaignRecorderRunnerState,
  parseDizyQuantCampaignRecorderRunnerState,
  type DizyQuantCampaignRecorderRunnerState,
} from "./campaign-recorder-runner.ts";

export const DIZYQUANT_CAMPAIGN_RECORDER_STORE_VERSION = 1 as const;
const MIB = 1024 * 1024;
export const DIZYQUANT_CAMPAIGN_RECORDER_STORE_DEFAULT_MAX_BYTES = 128 * MIB;
export const DIZYQUANT_CAMPAIGN_RECORDER_STORE_MAX_CONFIGURABLE_BYTES = 1024 * MIB;
export const DIZYQUANT_CAMPAIGN_RECORDER_STORE_MAX_BYTES =
  DIZYQUANT_CAMPAIGN_RECORDER_STORE_DEFAULT_MAX_BYTES;

export function resolveDizyQuantCampaignRecorderStoreMaxBytes() {
  const raw = process.env.DIZYQUANT_CAMPAIGN_RECORDER_MAX_DISK_MB?.trim();
  if (!raw) return DIZYQUANT_CAMPAIGN_RECORDER_STORE_DEFAULT_MAX_BYTES;

  const configuredMb = Number(raw);
  if (!Number.isSafeInteger(configuredMb) || configuredMb <= 0) {
    return DIZYQUANT_CAMPAIGN_RECORDER_STORE_DEFAULT_MAX_BYTES;
  }

  return Math.min(
    configuredMb * MIB,
    DIZYQUANT_CAMPAIGN_RECORDER_STORE_MAX_CONFIGURABLE_BYTES,
  );
}

function dataRoot() {
  const value = process.env.DATA_DIR?.trim();
  if (!value) {
    throw new Error("DizyQuant campaign collection requires an explicit durable DATA_DIR");
  }
  return value;
}
const directory = () => join(dataRoot(), "dizyquant", "campaign");
const target = () => join(directory(), "representative-v1.json");
let queue: Promise<unknown> = Promise.resolve();

function serial<T>(operation: () => Promise<T>) {
  const result = queue.then(operation, operation);
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export async function readDizyQuantCampaignRecorderState(): Promise<DizyQuantCampaignRecorderRunnerState> {
  try {
    const info = await stat(target());
    if (info.size > resolveDizyQuantCampaignRecorderStoreMaxBytes()) {
      throw new Error("Stored DizyQuant campaign recorder state exceeds its byte limit");
    }
    const raw = await readFile(target(), "utf8");
    return parseDizyQuantCampaignRecorderRunnerState(JSON.parse(raw));
  } catch (reason) {
    if ((reason as NodeJS.ErrnoException).code === "ENOENT") {
      return emptyDizyQuantCampaignRecorderRunnerState();
    }
    throw reason;
  }
}

export async function writeDizyQuantCampaignRecorderState(
  state: DizyQuantCampaignRecorderRunnerState,
) {
  const validated = parseDizyQuantCampaignRecorderRunnerState(state);
  return serial(async () => {
    await mkdir(directory(), { recursive: true });
    const encoded = `${JSON.stringify(validated, null, 2)}\n`;
    if (Buffer.byteLength(encoded) > resolveDizyQuantCampaignRecorderStoreMaxBytes()) {
      throw new Error("DizyQuant campaign recorder state exceeds its byte limit");
    }
    const destination = target();
    const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`;
    try {
      await writeFile(temporary, encoded, { encoding: "utf8", mode: 0o600, flag: "wx" });
      await rename(temporary, destination);
    } catch (reason) {
      await unlink(temporary).catch(() => undefined);
      throw reason;
    }
    return validated;
  });
}
