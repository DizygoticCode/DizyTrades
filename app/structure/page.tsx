import { requireUser } from "../lib/auth";
import { WorkspaceStatePolish } from "../workspace-state-polish";
import StructureClient from "./structure-client";

export const dynamic = "force-dynamic";

export default async function StructurePage() {
  const user = await requireUser();
  return (
    <>
      <WorkspaceStatePolish workspace="structure" />
      <StructureClient readOnly={user.role === "viewer"} userName={user.name}/>
    </>
  );
}
