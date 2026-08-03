import { requireUser } from "../lib/auth";
import GuidedReviewDock from "./guided-review-dock";
import JournalClient from "./journal-client";
import JournalRecentTracker from "./journal-recent-tracker";

export const dynamic = "force-dynamic";

export default async function JournalPage() {
  const user = await requireUser();
  const readOnly = user.role === "viewer";
  return (
    <>
      <JournalRecentTracker />
      <JournalClient readOnly={readOnly} userName={user.name} />
      <GuidedReviewDock readOnly={readOnly} />
    </>
  );
}
