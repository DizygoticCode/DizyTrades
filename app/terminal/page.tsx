import { requireUser } from "../lib/auth";
import { DizyBrainRouteLauncher } from "../dizybrain-route-launcher";
import { DizyBrainShell } from "../dizybrain-shell";
import { FirstRunOnboarding } from "../first-run-onboarding";
import { WorkspaceLayouts } from "../workspace-layouts";
import { WorkspaceStatePolish } from "../workspace-state-polish";
import { TerminalClientShell } from "../terminal-client-shell";

export const dynamic = "force-dynamic";

export default async function TerminalPage() {
  const user = await requireUser();
  return (
    <DizyBrainShell>
      <DizyBrainRouteLauncher />
      <FirstRunOnboarding userId={user.id} userName={user.name} />
      <WorkspaceLayouts readOnly={user.role === "viewer"} />
      <WorkspaceStatePolish workspace="terminal" />
      <TerminalClientShell user={user} />
    </DizyBrainShell>
  );
}
