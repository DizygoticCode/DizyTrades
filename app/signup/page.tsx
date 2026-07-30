import { redirect } from "next/navigation";
import { currentUser } from "../lib/auth";
import SignupForm from "./signup-form";

export const dynamic = "force-dynamic";
export default async function SignupPage() {
  if (await currentUser()) redirect("/");
  return <main className="login-shell"><SignupForm enabled={process.env.PUBLIC_SIGNUP_ENABLED !== "false"} /></main>;
}
