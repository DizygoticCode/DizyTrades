import { redirect } from "next/navigation";
import { requireUser } from "../lib/auth";
import BackupClient from "./backup-client";

export const dynamic = "force-dynamic";

export default async function BackupPage() {
  const user = await requireUser();
  if (user.role === "viewer") redirect("/terminal");
  return <BackupClient userName={user.name} />;
}
