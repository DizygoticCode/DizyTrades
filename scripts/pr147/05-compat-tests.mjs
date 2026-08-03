import { readFile, writeFile } from "node:fs/promises";

const replaceOnce = (source, search, replacement, label) => {
  const count = source.split(search).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, found ${count}`);
  return source.replace(search, replacement);
};

{
  const path = "tests/manual-paper-depth-auto-risk-route.test.mjs";
  let source = await readFile(path, "utf8");
  source = replaceOnce(
    source,
    'assert.match(roadmap,/Current slice: reduce-only semantics/)',
    'assert.match(roadmap,/Current slice: maintenance tiers and bankruptcy-price audit/)',
    "automatic-risk roadmap handoff",
  );
  await writeFile(path, source);
}

{
  const path = "tests/manual-paper-depth-exit-route.test.mjs";
  let source = await readFile(path, "utf8");
  source = replaceOnce(
    source,
    'closeManualPosition(user.id,symbol,String(body.idempotencyKey),risk.price,depth,contract)',
    'closeManualPosition(user.id,symbol,String(body.idempotencyKey),risk.price,depth,contract,reduceOnlyTarget(body))',
    "close route contract",
  );
  source = replaceOnce(
    source,
    'partialCloseManualPosition(user.id,symbol,String(body.idempotencyKey),risk.price,body,depth,contract)',
    'partialCloseManualPosition(user.id,symbol,String(body.idempotencyKey),risk.price,body,depth,contract,reduceOnlyTarget(body))',
    "partial-close route contract",
  );
  source = replaceOnce(
    source,
    'assert.match(source,/Fresh public DizyFlow depth is unavailable for this market action/)',
    'assert.match(source,/Fresh public DizyFlow depth is unavailable for this market action/);assert.match(source,/function reduceOnlyTarget\(body:Record<string,unknown>\)/)',
    "close route target parser contract",
  );
  await writeFile(path, source);
}

{
  const path = "tests/manual-paper-depth-reverse-flatten-route.test.mjs";
  let source = await readFile(path, "utf8");
  source = replaceOnce(
    source,
    'reverseManualPosition(user.id,symbol,String(body.idempotencyKey),risk.price,depth,contract)',
    'reverseManualPosition(user.id,symbol,String(body.idempotencyKey),risk.price,depth,contract,reduceOnlyTarget(body))',
    "reverse route contract",
  );
  source = replaceOnce(
    source,
    'assert.ok(source.includes("latestPublicContractMetadata(symbol),requiredDepth(symbol)"))',
    'assert.ok(source.includes("latestPublicContractMetadata(symbol),requiredDepth(symbol)"));assert.ok(source.includes("reduceOnlyTarget(body)"))',
    "reverse target contract",
  );
  await writeFile(path, source);
}
