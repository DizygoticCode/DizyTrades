import type { Metadata } from "next";
import SchoolClient from "./school-client";
import { SCHOOL_DISPLAY_NAME } from "@/app/lib/branding";

export const metadata: Metadata = {
  title: `${SCHOOL_DISPLAY_NAME} — Learn the complete DizyTrades workflow`,
  description: "DizyAcademy teaches charting, signals, order flow, Scanner, Structure, Paper, Replay, Guided Review, Performance, operations and recovery.",
};

export default function SchoolPage() {
  return <SchoolClient />;
}
