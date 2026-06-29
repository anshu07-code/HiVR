"use client";

import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PublicNavbarMobileTrigger() {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="sm:hidden"
      aria-label="Open menu"
      onClick={() => {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("hivr:open-mobile-menu"));
        }
      }}
    >
      <Menu className="h-5 w-5" />
    </Button>
  );
}
