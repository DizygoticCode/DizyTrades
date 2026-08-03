import { requireUser } from "../lib/auth";
import { DizyBrainShell } from "../dizybrain-shell";
import { DizyBrainTopbarLink } from "../dizybrain-topbar-link";
import { FirstRunOnboarding } from "../first-run-onboarding";
import TradingTerminal from "../trading-terminal";

export const dynamic = "force-dynamic";

export default async function TerminalPage() {
  const user = await requireUser();
  return (
    <DizyBrainShell>
      <DizyBrainTopbarLink />
      <FirstRunOnboarding userId={user.id} userName={user.name} />
      <TradingTerminal user={user} />
    </DizyBrainShell>
  );
}
