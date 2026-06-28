"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CategoryIcon } from "@/components/marketing/category-icon";
import { cn } from "@/lib/utils";

type Group = {
  id: string;
  name: string;
  icon: string;
  tier: "micro_task" | "role_engagement";
  status: "active" | "coming_soon";
  wage_band_min_paise?: number | null;
  wage_band_max_paise?: number | null;
  options: Array<{
    id: string;
    name: string;
    description: string;
  }>;
};

type Props = {
  groups: Group[];
  value: string;
  onValueChange: (id: string) => void;
  placeholder?: string;
  triggerClassName?: string;
};

export function SearchableCategorySelect({
  groups,
  value,
  onValueChange,
  placeholder = "Choose a subcategory…",
  triggerClassName,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  // Find the currently selected option across all groups.
  const allOptions = groups.flatMap(g => g.options);
  const selected = allOptions.find(o => o.id === value);
  const selectedGroup = groups.find(g => g.options.some(o => o.id === value));

  // Filter groups + their options by the search query.
  const q = search.trim().toLowerCase();
  const filteredGroups = groups
    .map(g => ({
      ...g,
      options: g.options.filter(
        o =>
          !q ||
          o.name.toLowerCase().includes(q) ||
          (o.description || "").toLowerCase().includes(q),
      ),
    }))
    .filter(g => g.options.length > 0);

  return (
    <Popover open={open} onOpenChange={o => { setOpen(o); if (!o) setSearch(""); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-auto min-h-[2.75rem] w-full justify-between py-2 font-normal",
            !selected && "text-muted-foreground",
            triggerClassName,
          )}
        >
          {selected ? (
            <span className="flex flex-1 items-center gap-2 truncate text-left">
              <span className="truncate">{selected.name}</span>
              {selectedGroup && (
                <Badge variant={selectedGroup.tier === "role_engagement" ? "tierB" : "tierA"} className="ml-1 shrink-0 text-[9px]">
                  {selectedGroup.name}
                </Badge>
              )}
            </span>
          ) : (
            <span className="flex-1 text-left">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <div className="flex items-center border-b px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search subcategories…"
            className="flex h-10 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
            autoFocus
          />
        </div>
        <div className="max-h-72 overflow-y-auto p-1">
          {filteredGroups.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No subcategory matches "{search}".
            </div>
          )}
          {filteredGroups.map(group => (
            <div key={group.id} className="mb-1">
              <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-semibold uppercase text-muted-foreground">
                <CategoryIcon name={group.icon} className="h-3.5 w-3.5" />
                {group.name}
                <Badge variant={group.tier === "role_engagement" ? "tierB" : "tierA"} className="ml-auto text-[9px]">
                  {group.tier === "role_engagement" ? "Tier B" : "Tier A"}
                </Badge>
              </div>
              {group.options.map(opt => {
                const isSelected = value === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      onValueChange(opt.id);
                      setOpen(false);
                      setSearch("");
                    }}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors",
                      "hover:bg-accent hover:text-accent-foreground",
                      isSelected && "bg-accent/50",
                    )}
                  >
                    <Check className={cn("mt-0.5 h-4 w-4 shrink-0", isSelected ? "opacity-100 text-primary" : "opacity-0")} />
                    <span className="flex-1">
                      <span className="block font-medium">{opt.name}</span>
                      {opt.description && (
                        <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{opt.description}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
