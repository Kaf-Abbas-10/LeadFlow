import type { Metadata } from "next";
import { Bricolage_Grotesque, Manrope } from "next/font/google";
import { LeadFlowProvider } from "@/components/LeadFlowProvider";
import { Shell } from "@/components/Shell";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", weight: ["500", "600", "700", "800"] });
const body = Manrope({ subsets: ["latin"], variable: "--font-manrope" });

export const metadata: Metadata = {
  title: { default: "LeadFlow", template: "%s · LeadFlow" },
  description: "Research companies, score their fit and review AI-drafted outreach before anything goes out.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <LeadFlowProvider>
          <Shell>{children}</Shell>
        </LeadFlowProvider>
      </body>
    </html>
  );
}
