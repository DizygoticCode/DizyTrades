import "server-only";

import {
  SYNTHETIC_PROVIDER_CONTRACT_VERSION,
  type ExecutionIntent,
  type SyntheticProviderResult,
  type SyntheticProviderScenario,
} from "../types";
import type { ExecutionPreview } from "./preview";

type ProviderRequest = Readonly<{
  intent: ExecutionIntent;
  preview: ExecutionPreview;
}>;

interface ExecutionProvider {
  readonly kind: "non-executing";
  evaluate(request: ProviderRequest): SyntheticProviderResult;
}

const reasonByScenario = Object.freeze({
  "would-accept": "none",
  "would-reject": "policy",
  "would-timeout": "timeout",
  "would-unknown": "indeterminate",
} satisfies Record<SyntheticProviderScenario, SyntheticProviderResult["reasonClass"]>);

/**
 * The sole production provider. It models lifecycle mechanics only: there is no
 * account credential, transport, exchange acknowledgement, order or fill.
 */
class NonExecutingProvider implements ExecutionProvider {
  readonly kind = "non-executing" as const;

  constructor(private readonly scenario: SyntheticProviderScenario) {}

  evaluate(request: ProviderRequest): SyntheticProviderResult {
    if (!request || !request.intent || !request.preview || request.preview.symbol !== request.intent.symbol) {
      throw new TypeError("Malformed synthetic provider input");
    }
    return Object.freeze({
      contractVersion: SYNTHETIC_PROVIDER_CONTRACT_VERSION,
      providerKind: this.kind,
      provenance: "deterministic-synthetic-fixture",
      outcome: this.scenario,
      executed: false,
      reasonClass: reasonByScenario[this.scenario],
    });
  }
}

export function evaluateSyntheticProvider(
  scenario: SyntheticProviderScenario,
  request: ProviderRequest,
): SyntheticProviderResult {
  return new NonExecutingProvider(scenario).evaluate(request);
}

export function isSyntheticProviderResult(value: unknown): value is SyntheticProviderResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<SyntheticProviderResult>;
  return result.contractVersion === SYNTHETIC_PROVIDER_CONTRACT_VERSION
    && result.providerKind === "non-executing"
    && result.provenance === "deterministic-synthetic-fixture"
    && result.executed === false
    && typeof result.outcome === "string"
    && result.outcome in reasonByScenario
    && result.reasonClass === reasonByScenario[result.outcome as SyntheticProviderScenario];
}
