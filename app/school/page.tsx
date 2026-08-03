import type { Metadata } from "next";
import { SCHOOL_DISPLAY_NAME } from "@/app/lib/branding";
import AcademyRecentTracker from "./academy-recent-tracker";
import SchoolClient from "./school-client";

export const metadata: Metadata = {
  title: `${SCHOOL_DISPLAY_NAME} — Learn the complete DizyTrades workflow`,
  description: "DizyAcademy teaches charting, signals, order flow, Scanner, Structure, Paper, Replay, Guided Review, Performance, operations and recovery.",
};

export default function SchoolPage() {
  return (
    <>
      <AcademyRecentTracker />
      <SchoolClient />
    </>
  );
}
