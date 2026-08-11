import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "../../lib/auth";
import { getAccountProfile } from "../../lib/auth-db";
import ProfileForm from "./profile-form";
import "./profile.css";

export const metadata: Metadata = {
  title: "My Profile | DizyTrades",
  description: "Manage your personal DizyTrades display profile and account recovery options.",
};

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireUser();
  if (user.role === "viewer") redirect("/terminal");
  return <main className="profile-page-shell"><ProfileForm initial={getAccountProfile(user)} /></main>;
}
