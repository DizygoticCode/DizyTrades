import { requireUser } from "../lib/auth";
import GuidedTradeReviewDock from "./guided-trade-review-dock";
import JournalClient from "./journal-client";

export const dynamic = "force-dynamic";

export default async function JournalPage() {
  const user = await requireUser();
  const readOnly = user.role === "viewer";
  return (
    <>
      <JournalClient readOnly={readOnly} userName={user.name} />
      <GuidedTradeReviewDock readOnly={readOnly} />
    </>
  );
}
