import type { AcademyLesson } from "./academy-extension";

export const pendingOrderAcademyLessons: AcademyLesson[] = [
  {
    slug: "pending-order-execution",
    title: "Pending orders: timing, priority and deterministic fills",
    group: "Professional Practice",
    summary: "Choose and review pending-order behaviour without confusing an order-book snapshot with guaranteed execution.",
    diagram: "flow",
    sections: [
      {
        heading: "Start with the execution objective",
        paragraphs: [
          "A pending order is an instruction with conditions, not a completed trade. Choose the order type from the execution objective: wait for price, demand immediate liquidity, avoid taking liquidity, or activate only after a defined trigger.",
        ],
        bullets: [
          "GTC keeps the unfilled remainder working until it fills or is cancelled.",
          "IOC fills immediately against available eligible liquidity and cancels the remainder.",
          "FOK requires the complete quantity immediately or cancels without a partial fill.",
          "Post-only or limit-maker rejects an order that would immediately remove liquidity.",
        ],
      },
      {
        heading: "Conditional and adaptive orders",
        paragraphs: [
          "Trigger-market and trigger-limit orders remain armed until their configured price source reaches the trigger. A trailing stop moves its activation boundary only in the favourable direction. A chase-limit order follows the same-side best quote within a defined protection distance.",
        ],
        bullets: [
          "Activation and execution are separate lifecycle events.",
          "A triggered limit order can remain unfilled after activation.",
          "A trailing callback must be defined before the observation sequence begins.",
          "A chase order must cancel when its configured adverse-distance boundary is reached.",
        ],
      },
      {
        heading: "Exercise: explain the evidence",
        paragraphs: [
          "A buy limit joins the best bid, the displayed ask remains above it, and the next snapshot shows less size at the bid. Decide what can be recorded. The order may still be working; the snapshot alone does not prove that your quantity filled, where it sat in the queue, or why displayed size changed. A maker fill requires explicit observed execution evidence.",
        ],
        bullets: [
          "Record submitted, accepted, activated, working, partially filled, filled, cancelled, rejected and expired states as separate immutable events.",
          "Reject stale or non-monotonic observations instead of silently replaying them out of order.",
          "Preserve cancel-and-replace lineage rather than rewriting the original order.",
          "DizyPaper simulation never sends a private exchange request or live order.",
        ],
      },
    ],
    chartQuery: "paper orders execution",
  },
  {
    slug: "spot-order-reservations",
    title: "Spot accounting: reservations, refunds and releases",
    group: "Professional Practice",
    summary: "Trace every spot-order balance movement across available and reserved base and quote assets.",
    diagram: "risk",
    sections: [
      {
        heading: "Available is not the same as reserved",
        paragraphs: [
          "A resting spot order must reserve the asset it could spend. A buy limit reserves quote balance at the limit price; a sell limit reserves base quantity. Reserved funds remain part of the account but cannot fund another order until they are filled or released.",
        ],
        bullets: [
          "A buy reservation equals remaining quantity multiplied by the limit price.",
          "A sell reservation equals the remaining base quantity.",
          "Insufficient available funds reject the order without mutating balances.",
          "Every reservation and release belongs in the immutable account ledger.",
        ],
      },
      {
        heading: "Partial fills and price improvement",
        paragraphs: [
          "When a buy limit executes below its limit price, the account spends the actual execution cost and returns the price-improvement difference immediately. Only the unfilled remainder stays reserved at the original limit price. A sell credits the actual quote proceeds while reducing the reserved base quantity.",
        ],
        bullets: [
          "Partial fills change both the order lifecycle and the account ledger.",
          "IOC releases the exact unfilled remainder after immediate matching.",
          "FOK either books the complete fill atomically or releases the complete reservation.",
          "Manual cancellation releases the exact outstanding reservation.",
        ],
      },
      {
        heading: "Exercise: reconcile a replacement",
        paragraphs: [
          "A partially filled buy order is cancelled and replaced at a new price. Reconcile the sequence: retain the completed fill, release the original order's remaining quote reservation, submit a linked replacement, and reserve only the replacement's required quote balance. Replaying the immutable order and account events must produce the same final balances.",
        ],
        bullets: [
          "Never erase the original fill or cancellation.",
          "Never treat released funds as profit.",
          "Never infer fees, hidden liquidity or queue priority when the evidence does not provide them.",
          "Simulation accounting is not a connected MEXC account balance and cannot mutate one.",
        ],
      },
    ],
    chartQuery: "paper spot accounting",
  },
];
