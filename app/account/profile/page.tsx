import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "../../lib/auth";
import { getAccountProfile } from "../../lib/auth-db";
import ProfileForm from "./profile-form";
import MfaPanel from "./mfa-panel";
import CredentialProvisioningPanel from "./credential-provisioning-panel";
import { credentialStatus } from "../../lib/credential-provisioning";
import "./profile.css";

export const metadata: Metadata = {
  title: "My Profile | DizyTrades",
  description: "Manage your personal DizyTrades display profile and account recovery options.",
};

export const dynamic = "force-dynamic";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ custody?: string }> }) {
  const user = await requireUser();
  if (user.role === "viewer") redirect("/terminal");
  const enabled = process.env.CREDENTIAL_PROVISIONING_ENABLED === "true" && process.env.CREDENTIAL_CUSTODY_ENABLED === "true";
  const outcome = (await searchParams).custody;
  const outcomeText = outcome === "provisioned" ? "Encrypted credentials configured." : outcome === "revoked" ? "Credentials revoked." : outcome === "failed" ? "The credential ceremony could not be completed." : undefined;
  const credential = enabled && user.id === "rob" ? credentialStatus(user.id, "owner-primary") : null;
  return <main className="profile-page-shell"><ProfileForm initial={getAccountProfile(user)} /><MfaPanel />{user.id === "rob" && user.role === "owner" && <CredentialProvisioningPanel enabled={enabled} credential={credential} outcome={outcomeText} />}</main>;
}
