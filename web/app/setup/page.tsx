import type { Metadata } from "next";
import { Setup } from "@/components/Setup";

export const metadata: Metadata = { title: "Connections" };

export default function SetupPage() {
  return <Setup />;
}
