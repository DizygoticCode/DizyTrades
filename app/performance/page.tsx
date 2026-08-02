import { requireUser } from "../lib/auth";
import PerformanceClient from "./performance-client";

export const dynamic = "force-dynamic";

export default async function PerformancePage() {
  const user = await requireUser();
  return <PerformanceClient userName={user.name}/>;
}
