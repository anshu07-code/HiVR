"use client";

import * as React from "react";
import Link from "next/link";
import { Home, ListChecks, Plus, LifeBuoy, Zap, Briefcase, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";


type Props = {
  mode?: string;
};

export function MobileBottomTabs({ mode = "buyer" }: Props) {
  const pathname = usePathname();
  const [middleToggle, setMiddleToggle] = React.useState<"post" | "contracts">(
    mode === "employee" ? "contracts" : mode === "both" ? "post" : "post"
  );

  React.useEffect(() => {
    setMiddleToggle(mode === "employee" ? "contracts" : "post");
  }, [mode]);

  const middleHref = middleToggle === "post" ? "/dashboard/post" : "/dashboard/contracts";
  const middleLabel = middleToggle === "post" ? "Post" : "Contracts";
  const middleIcon = middleToggle === "post" ? Plus : Briefcase;

  const TABS = [
    { href: "/",                  label: "Home",     Icon: Home },
    { href: "/browse",            label: "Browse",   Icon: ListChecks },
    { href: middleHref,           label: middleLabel, Icon: middleIcon, primary: true, middle: true },
    { href: "/support",           label: "Support",  Icon: LifeBuoy },
    { href: "/instant-hire",      label: "Instant",  Icon: Zap, premium: true },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/90 backdrop-blur md:hidden select-none" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <ul className="flex h-16 items-stretch justify-around">
        {TABS.map(({ href, label, Icon, primary, premium, middle }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href + "/"));
          return (
            <li key={href + label} className="flex-1">
              <Link
                href={href}
                onClick={middle && mode === "both" ? (e) => { e.preventDefault(); setMiddleToggle(v => v === "post" ? "contracts" : "post"); } : undefined}
                className={cn(
                  "relative flex h-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
                  primary ? "text-primary" : premium ? "text-orange-500" : active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="tab-indicator"
                    className="absolute -top-[1px] left-1/4 right-1/4 h-0.5 rounded-full bg-current"
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
                <motion.span
                  whileTap={{ y: -3, scale: 0.92 }}
                  transition={{ type: "spring", stiffness: 480, damping: 18 }}
                  className={cn(
                    "grid h-10 w-10 place-items-center rounded-xl relative transition-colors",
                    active && !primary && !premium && "bg-accent",
                    primary && "bg-primary text-primary-foreground shadow-md",
                    premium && "bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-md shadow-orange-500/20",
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {premium && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white text-[7px] font-bold text-orange-500 ring-1 ring-background">
                      <Sparkles className="h-2 w-2" />
                    </span>
                  )}
                </motion.span>
                <span className="flex items-center gap-0.5 leading-none">
                  {label}
                  {middle && mode === "both" && (
                    <Sparkles className="h-2 w-2 text-orange-400" />
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
