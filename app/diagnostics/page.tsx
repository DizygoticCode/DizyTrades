import { redirect } from "next/navigation";
import { requireUser } from "../lib/auth";
import { canAccessOperations } from "../lib/operations-access";
import DiagnosticsClient from "./diagnostics-client";

export const dynamic = "force-dynamic";

export default async function DiagnosticsPage() {
  const user = await requireUser();
  if (!canAccessOperations(user.role)) redirect("/terminal");
  return <DiagnosticsClient userName={user.name} />;
}
