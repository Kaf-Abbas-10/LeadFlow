import type { Metadata } from "next";
import { Runs } from "@/components/Runs";

export const metadata: Metadata = { title: "Research runs" };

export default function RunsPage() {
  return <Runs />;
}
