import { requireUser } from "../lib/auth";
import { WorkspaceStatePolish } from "../workspace-state-polish";
import ScannerClient from "./scanner-client";

export const dynamic = "force-dynamic";

export default async function ScannerPage() {
  const user = await requireUser();
  return (
    <>
      <WorkspaceStatePolish workspace="scanner" />
      <ScannerClient readOnly={user.role === "viewer"} userName={user.name}/>
    </>
  );
}
