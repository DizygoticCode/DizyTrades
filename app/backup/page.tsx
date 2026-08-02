import { redirect } from "next/navigation";
import { requireUser } from "../lib/auth";
import BackupClient from "./backup-client";

export const dynamic = "force-dynamic";

export default async function BackupPage() {
  const user = await requireUser();
  // Backup export and restore are owner-only operations; viewers return to the terminal.
  if (user.role === "viewer") redirect("/terminal");
  return <BackupClient userName={user.name} />;
}
