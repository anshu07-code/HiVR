import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Lightweight checkbox that mirrors the shadcn/ui API: a Checkbox component
 * that takes `checked` and `onCheckedChange`. Wraps a styled native input so
 * we don't need @radix-ui/react-checkbox.
 */
export const Checkbox = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & {
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
  }
>(({ className, checked, onCheckedChange, onChange, ...props }, ref) => {
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={!!checked}
      onChange={(e) => {
        onChange?.(e);
        onCheckedChange?.(e.target.checked);
      }}
      className={cn(
        "peer h-4 w-4 shrink-0 rounded-sm border border-input bg-background",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "checked:bg-primary checked:text-primary-foreground checked:border-primary",
        "appearance-none cursor-pointer",
        // Checkmark drawn with a CSS pseudo-element when checked
        "checked:bg-[image:var(--check)] checked:bg-no-repeat checked:bg-center",
        "[--check:url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22 fill=%22white%22><path d=%22M13.5 4.5 6 12 2.5 8.5l1-1L6 10l6.5-6.5z%22/></svg>')]",
        className,
      )}
      {...props}
    />
  );
});
Checkbox.displayName = "Checkbox";
