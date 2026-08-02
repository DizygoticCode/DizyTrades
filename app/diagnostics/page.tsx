import { redirect } from "next/navigation";
import { requireUser } from "../lib/auth";
import DiagnosticsClient from "./diagnostics-client";

export const dynamic = "force-dynamic";

export default async function DiagnosticsPage() {
  const user = await requireUser();
  if (user.role !== "owner" && user.role !== "admin") redirect("/terminal");
  return <DiagnosticsClient userName={user.name} />;
}
