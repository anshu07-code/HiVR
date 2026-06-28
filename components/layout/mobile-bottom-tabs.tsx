"use client";

import * as React from "react";
import Link from "next/link";
import { Home, ListChecks, Plus, MessageSquare, User, Menu, LifeBuoy } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

const TABS = [
  { href: "/dashboard",        label: "Home",     Icon: Home },
  { href: "/browse",           label: "Browse",   Icon: ListChecks },
  { href: "/dashboard/post",   label: "Post",     Icon: Plus, primary: true },
  { href: "/support",           label: "Support",  Icon: LifeBuoy },
  { href: "/dashboard/settings", label: "Profile", Icon: User },
];

export function MobileBottomTabs() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/90 backdrop-blur md:hidden">
      <ul className="flex h-16 items-stretch justify-around">
        {TABS.map(({ href, label, Icon, primary }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={cn(
                  "relative flex h-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium",
                  primary ? "text-primary" : active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <motion.span
                  whileTap={{ y: -3, scale: 1.08 }}
                  transition={{ type: "spring", stiffness: 480, damping: 18 }}
                  className={cn(
                    "grid h-9 w-9 place-items-center rounded-full",
                    primary ? "bg-primary text-primary-foreground shadow-md" : "",
                  )}
                >
                  <Icon className="h-5 w-5" />
                </motion.span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
