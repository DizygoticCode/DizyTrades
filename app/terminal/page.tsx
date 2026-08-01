import { requireUser } from "../lib/auth";
import { DizyBrainShell } from "../dizybrain-shell";
import TradingTerminal from "../trading-terminal";

export const dynamic = "force-dynamic";

export default async function TerminalPage() {
  const user = await requireUser();
  return (
    <DizyBrainShell>
      <TradingTerminal user={user} />
    </DizyBrainShell>
  );
}
