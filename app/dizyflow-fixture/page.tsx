import { notFound } from "next/navigation";
import { DizyFlowFixtureClient } from "./visual-client";

const visualFixtureEnabled =
  process.env.NODE_ENV === "development" ||
  process.env.DIZYFLOW_VISUAL_FIXTURE_ENABLED === "true";

export default function DizyFlowFixturePage() {
  if (!visualFixtureEnabled) notFound();
  return <DizyFlowFixtureClient />;
}
