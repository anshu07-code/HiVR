"use client";

/**
 * ThemeCycleButton — a single icon button that cycles through
 * `light → dark → eye-shield → light` on each click. Replaces the
 * previous 3-button segmented switcher.
 *
 * Performance:
 *  - No `framer-motion` (saved ~50KB gzipped from the bundle).
 *  - Icon transitions with a 200ms CSS fade/rotate animation.
 *  - Cycle order is persisted in localStorage so the user's choice
 *    survives reloads (handled by the ThemeProvider).
 */

import * as React from "react";
import { Sun, Moon, Eye } from "lucide-react";
import { useTheme, type ThemeMode } from "./provider";
import { cn } from "@/lib/utils";

const ORDER: ThemeMode[] = ["light", "dark", "eye_shield"];

const META: Record<ThemeMode, { label: string; Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }> }> = {
  light:      { label: "Light",      Icon: Sun },
  dark:       { label: "Dark",       Icon: Moon },
  eye_shield: { label: "Eye-shield", Icon: Eye },
};

export function ThemeCycleButton({ className }: { className?: string }) {
  const { mode, setMode } = useTheme();

  function cycle() {
    const i = ORDER.indexOf(mode);
    const next = ORDER[(i + 1) % ORDER.length];
    setMode(next);
  }

  const { label, Icon } = META[mode];

  return (
    <button
      type="button"
      data-tour="theme-switcher"
      onClick={cycle}
      aria-label={`Theme: ${label}. Click to switch.`}
      title={`Theme: ${label} (click to cycle)`}
      className={cn(
        "relative grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        className
      )}
    >
      {/* Cross-fade between icons. Keyed by mode so React re-mounts
          the icon and the CSS animation re-fires on each switch. */}
      <Icon
        key={mode}
        className="h-4 w-4 transition-transform duration-200 ease-out"
        style={{ animation: "fade-in 0.2s ease-out" }}
      />
    </button>
  );
}

/**
 * Backwards-compat export. The old segmented 3-button switcher
 * (with framer-motion) was renamed; this re-exports the new cycle
 * button under the same name so any leftover imports keep working.
 */
export const ThemeSwitcher = ThemeCycleButton;
