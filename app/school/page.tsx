import type { Metadata } from "next";
import SchoolClient from "./school-client";

export const metadata: Metadata = { title: "DizySchool — Learn trading concepts safely", description: "A free learning centre for DizyCharts, DizySignals, market structure, risk and paper simulation." };
export default function SchoolPage() { return <SchoolClient/>; }
