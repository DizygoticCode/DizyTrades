import "server-only";

import {
  SYNTHETIC_RECONCILIATION_CONTRACT_VERSION,
  type SyntheticObservation,
  type SyntheticProviderResult,
  type SyntheticProviderScenario,
  type SyntheticReconciliationResolution,
  type SyntheticReconciliationResult,
} from "../types";

const observations = new Set<SyntheticObservation>([
  "would-observe-accepted", "would-observe-rejected", "would-observe-missing",
]);

const classifications = Object.freeze({
  "would-accept": Object.freeze({
    "would-observe-accepted": ["matched-accepted", "terminal"],
    "would-observe-rejected": ["conflict", "conflict"],
    "would-observe-missing": ["conflict", "conflict"],
  }),
  "would-reject": Object.freeze({
    "would-observe-accepted": ["conflict", "conflict"],
    "would-observe-rejected": ["matched-rejected", "terminal"],
    "would-observe-missing": ["conflict", "conflict"],
  }),
  "would-timeout": Object.freeze({
    "would-observe-accepted": ["recovered-accepted", "terminal"],
    "would-observe-rejected": ["recovered-rejected", "terminal"],
    "would-observe-missing": ["unresolved-timeout", "unresolved"],
  }),
  "would-unknown": Object.freeze({
    "would-observe-accepted": ["recovered-accepted", "terminal"],
    "would-observe-rejected": ["recovered-rejected", "terminal"],
    "would-observe-missing": ["unresolved-unknown", "unresolved"],
  }),
} satisfies Record<SyntheticProviderScenario, Record<SyntheticObservation,
  readonly [SyntheticReconciliationResolution, SyntheticReconciliationResult["certainty"]]>>);

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key));

export function isSyntheticObservation(value: unknown): value is SyntheticObservation {
  return typeof value === "string" && observations.has(value as SyntheticObservation);
}

export function reconcileSyntheticProviderResult(
  providerResult: SyntheticProviderResult,
  observation: unknown,
): SyntheticReconciliationResult {
  if (!isSyntheticObservation(observation) || providerResult.reconciliation !== undefined) {
    throw new TypeError("Invalid bounded synthetic reconciliation input");
  }
  const [resolution, certainty] = classifications[providerResult.outcome][observation];
  return Object.freeze({
    contractVersion: SYNTHETIC_RECONCILIATION_CONTRACT_VERSION,
    provenance: "deterministic-synthetic-fixture",
    initialProviderOutcome: providerResult.outcome,
    observedOutcome: observation,
    resolution,
    certainty,
    executed: false,
  });
}

export function isSyntheticReconciliationResult(value: unknown): value is SyntheticReconciliationResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  if (!hasExactKeys(result, ["contractVersion", "provenance", "initialProviderOutcome",
    "observedOutcome", "resolution", "certainty", "executed"])) return false;
  if (result.contractVersion !== SYNTHETIC_RECONCILIATION_CONTRACT_VERSION
    || result.provenance !== "deterministic-synthetic-fixture"
    || result.executed !== false || !isSyntheticObservation(result.observedOutcome)
    || typeof result.initialProviderOutcome !== "string"
    || !(result.initialProviderOutcome in classifications)) return false;
  const expected = classifications[result.initialProviderOutcome as SyntheticProviderScenario][result.observedOutcome];
  return result.resolution === expected[0] && result.certainty === expected[1];
}
