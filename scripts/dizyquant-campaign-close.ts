import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  canonicalDizyQuantCampaignClosureJson,
  closeDizyQuantCampaign,
} from "../app/lib/dizyquant/campaign-closure.ts";
import { parseDizyQuantCampaignStudyExport } from "../app/lib/dizyquant/campaign-study-export.ts";

function usage() {
  console.error(
    "Usage: npm run dizyquant:close -- <study-export.json> [closure-report.json]",
  );
}

const [, , inputArgument, outputArgument] = process.argv;
if (!inputArgument) {
  usage();
  process.exitCode = 64;
} else {
  try {
    const inputPath = resolve(inputArgument);
    const raw = await readFile(inputPath, "utf8");
    const study = parseDizyQuantCampaignStudyExport(JSON.parse(raw));
    const result = closeDizyQuantCampaign(study);
    const encoded = `${canonicalDizyQuantCampaignClosureJson(result)}\n`;
    if (outputArgument) {
      await writeFile(resolve(outputArgument), encoded, "utf8");
    } else {
      process.stdout.write(encoded);
    }
    if (result.status === "awaiting-coverage") process.exitCode = 2;
  } catch (reason) {
    console.error(reason instanceof Error ? reason.message : "DizyQuant campaign closure failed");
    process.exitCode = 1;
  }
}
