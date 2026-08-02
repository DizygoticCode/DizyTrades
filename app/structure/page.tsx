import { requireUser } from "../lib/auth";
import StructureClient from "./structure-client";

export const dynamic = "force-dynamic";

export default async function StructurePage() {
  const user = await requireUser();
  return <StructureClient readOnly={user.role === "viewer"} userName={user.name}/>;
}
