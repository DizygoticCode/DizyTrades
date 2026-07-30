import type { Metadata } from "next";
import SchoolClient from "./school-client";
import { SCHOOL_DISPLAY_NAME } from "@/app/lib/branding";

export const metadata: Metadata = { title: `${SCHOOL_DISPLAY_NAME} — Learn trading concepts safely`, description: "A free learning centre for DizyCharts, DizySignals, market structure, risk and paper simulation." };
export default function SchoolPage() { return <SchoolClient/>; }
