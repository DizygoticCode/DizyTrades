import { requireUser } from "../lib/auth";
import ScannerClient from "./scanner-client";

export const dynamic = "force-dynamic";

export default async function ScannerPage() {
  const user = await requireUser();
  return <ScannerClient readOnly={user.role === "viewer"} userName={user.name}/>;
}
