import { readFile, writeFile } from "node:fs/promises";

const replaceOnce = (source, before, after, label) => {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`);
  return source.replace(before, after);
};

const ticketPath = "app/manual-paper-ticket.tsx";
let ticket = await readFile(ticketPath, "utf8");

ticket = replaceOnce(
  ticket,
  "maintenanceMarginRate:(account?.settings.maintenanceMarginPct??.5)/100,liquidationPenaltyRate:",
  "maintenanceMarginRate:contract?.maintenanceMarginRate??(account?.settings.maintenanceMarginPct??.5)/100,liquidationPenaltyRate:",
  "contract maintenance-margin preview",
);

ticket = replaceOnce(
  ticket,
  "        !publicPrice ||\n        invalidAmount\n      )",
  "        !publicPrice ||\n        !contract ||\n        invalidAmount\n      )",
  "quick-submit contract guard",
);

ticket = replaceOnce(
  ticket,
  "      publicPrice,\n      invalidAmount,",
  "      publicPrice,\n      contract,\n      invalidAmount,",
  "submit callback dependency",
);

await writeFile(ticketPath, ticket);

const testPath = "tests/mexc-contract-metadata.test.mjs";
let tests = await readFile(testPath, "utf8");
tests = replaceOnce(
  tests,
  'import assert from "node:assert/strict";\n',
  'import assert from "node:assert/strict";\nimport {readFileSync} from "node:fs";\n',
  "source-test import",
);
tests += '\ntest("Manual Paper ticket requires contract rules and previews the contract maintenance rate",()=>{const source=readFileSync(new URL("../app/manual-paper-ticket.tsx",import.meta.url),"utf8");assert.match(source,/!publicPrice \\|\\|\\s*!contract \\|\\|\\s*invalidAmount/);assert.match(source,/maintenanceMarginRate:contract\\?\\.maintenanceMarginRate\\?\\?/)});\n';
await writeFile(testPath, tests);
