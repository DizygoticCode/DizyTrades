import { requireUser } from "../lib/auth";
import TradingTerminal from "../trading-terminal";

export const dynamic = "force-dynamic";

export default async function TerminalPage() {
  const user = await requireUser();
  return <TradingTerminal user={user} />;
}
