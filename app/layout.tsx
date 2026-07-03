import { type Metadata } from "next";
import { Space_Grotesk, Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/provider";
import { AssistantLauncher } from "@/components/assistant/launcher";
import { TourRoot } from "@/components/onboarding/tour-root";
import { LiveNotificationPopup } from "@/components/notifications/live-popup";
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
  verification: {
    google: "xr2URc_6KHtS9HnRobUX_Ma9IPOPAGVpPKosVRghSAE",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={cn(sans.variable, display.variable)}>
      <head>
        {/* Anti-FOUC theme bootstrap */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k="hivr-theme";var m=localStorage.getItem(k);if(m==="dark"){document.documentElement.classList.add("dark");}else if(m==="eye_shield"){document.documentElement.classList.add("eye-shield");}}catch(e){}})();`,
          }}
        />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#18181b" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="HiVR" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="application-name" content="HiVR" />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <ThemeProvider>
          <div className="mobile-page-enter">
            {children}
          </div>
          <AssistantLauncher />
          <TourRoot />
          <LiveNotificationPopup />
        </ThemeProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `if("serviceWorker" in navigator){window.addEventListener("load",function(){navigator.serviceWorker.register("/sw.js").catch(function(e){console.warn("SW registration failed:",e)})})}`,
          }}
        />
      </body>
    </html>
  );
}
