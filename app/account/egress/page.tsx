import { redirect } from "next/navigation";

export default function LegacyRenderEgressPage() {
  redirect("/account/write-credential");
}
