import { type Metadata } from "next";
import { Space_Grotesk, Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/provider";
import { AssistantLauncher } from "@/components/assistant/launcher";
import { cn } from "@/lib/utils";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display", display: "swap", weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  title: "HiVR — small jobs, verified people",
  description: "Hire skilled people for small jobs, by the hour, day, task, or month. Identity-verified, escrow-protected, AI-assisted.",
  applicationName: "HiVR",
  authors: [{ name: "HiVR" }],
  keywords: ["micro-tasks", "freelance", "India", "verified", "escrow"],
  openGraph: {
    title: "HiVR — small jobs, verified people",
    description: "Hire skilled people for small jobs, by the hour, day, task, or month.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={cn(sans.variable, display.variable)}>
      <head>
        {/* Anti-FOUC theme bootstrap.
            Runs synchronously before <body> renders so the
            `.dark` / `.eye-shield` class is on <html> by the time
            the first paint happens. Without this, every refresh
            shows the light theme for a fraction of a second before
            React hydrates and applies the saved preference. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k="hivr-theme";var m=localStorage.getItem(k);if(m==="dark"){document.documentElement.classList.add("dark");}else if(m==="eye_shield"){document.documentElement.classList.add("eye-shield");}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <ThemeProvider>
          {children}
          <AssistantLauncher />
        </ThemeProvider>
      </body>
    </html>
  );
}
