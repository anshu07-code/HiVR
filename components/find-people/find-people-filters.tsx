"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { TierToggle } from "@/components/search/tier-toggle";
import { CategoryIcon } from "@/components/marketing/category-icon";
import { cn } from "@/lib/utils";
import { Search, ChevronDown, ChevronRight, ArrowLeft, Star, Zap } from "lucide-react";

type Cat = { id: string; slug: string; name: string; icon?: string; parent_category_id?: string | null };

type Props = {
  q: string;
  tab: string;
  skillFilter: string;
  tierFilter: string;
  availFilter: string;
  minRating: string;
  flatCategories: Cat[];
  parentCategories: Cat[];
  allCategories: Cat[];
};

const RATING_OPTIONS = [
  { value: "", label: "Any rating" },
  { value: "4.5", label: "4.5+ stars" },
  { value: "4", label: "4+ stars" },
  { value: "3.5", label: "3.5+ stars" },
];

const AVAIL_OPTIONS = [
  { value: "", label: "Any availability" },
  { value: "online", label: "Online" },
  { value: "offline", label: "Offline" },
  { value: "away", label: "Away" },
  { value: "busy", label: "Busy" },
];

function useClickOutside(ref: React.RefObject<HTMLElement | null>, handler: () => void) {
  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) handler();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [ref, handler]);
}

function Dropdown<T extends string>({
  label, value, options, onChange, icon: Icon,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  const selected = options.find(o => o.value === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-9 items-center gap-1.5 rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-accent"
      >
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        {selected?.label ?? label}
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-44 rounded-xl border bg-popover p-1.5 shadow-lg">
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors hover:bg-accent",
                value === o.value && "bg-accent font-semibold"
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function FindPeopleFilters({
  q, tab, skillFilter, tierFilter, availFilter, minRating, parentCategories, allCategories,
}: Props) {
  const router = useRouter();
  const [skill, setSkill] = React.useState(skillFilter);
  const [rating, setRating] = React.useState(minRating);
  const [avail, setAvail] = React.useState(availFilter);
  const [skillOpen, setSkillOpen] = React.useState(false);
  const [drillParent, setDrillParent] = React.useState<string | null>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => { setSkill(skillFilter); }, [skillFilter]);
  React.useEffect(() => { setRating(minRating); }, [minRating]);
  React.useEffect(() => { setAvail(availFilter); }, [availFilter]);

  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setSkillOpen(false);
        setDrillParent(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function pushParams(next: { skill?: string; min_rating?: string; avail?: string }) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (tab && tab !== "all") params.set("tab", tab);
    if (tierFilter) params.set("tier", tierFilter);
    if (next.skill !== undefined ? next.skill : skill) params.set("skill", next.skill !== undefined ? next.skill : skill);
    if (next.min_rating !== undefined ? next.min_rating : rating) params.set("min_rating", next.min_rating !== undefined ? next.min_rating : rating);
    if (next.avail !== undefined ? next.avail : avail) params.set("avail", next.avail !== undefined ? next.avail : avail);
    const qs = params.toString();
    router.push(qs ? `/find-people?${qs}` : "/find-people");
  }

  const selectedLabel = skill
    ? allCategories.find(c => c.slug === skill)?.name ?? skill
    : "All skills";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <TierToggle asUrlParams paramName="tier" showAll={true} />

      <span className="mx-1 h-4 w-px bg-border" />

      <div ref={dropdownRef} className="relative">
        <button
          type="button"
          onClick={() => setSkillOpen(!skillOpen)}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-accent"
        >
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          {selectedLabel}
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", skillOpen && "rotate-180")} />
        </button>
        {skillOpen && (
          <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-xl border bg-popover p-1.5 shadow-lg">
            <div className="max-h-72 overflow-y-auto scrollbar-hide">
              {!drillParent ? (
                <>
                  <button
                    type="button"
                    onClick={() => { setSkill(""); setSkillOpen(false); pushParams({ skill: "" }); }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors hover:bg-accent",
                      !skill && "bg-accent font-semibold"
                    )}
                  >
                    All skills
                  </button>
                  {parentCategories.map(parent => (
                    <button
                      key={parent.id}
                      type="button"
                      onClick={() => setDrillParent(parent.id)}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors hover:bg-accent"
                    >
                      <CategoryIcon name={parent.icon ?? ""} className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="flex-1">{parent.name}</span>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  ))}
                </>
              ) : (() => {
                const parent = parentCategories.find(p => p.id === drillParent);
                const kids = allCategories.filter(c => c.parent_category_id === drillParent);
                return (
                  <>
                    <button
                      type="button"
                      onClick={() => setDrillParent(null)}
                      className="flex w-full items-center gap-1.5 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors hover:bg-accent text-muted-foreground"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      {parent?.name ?? "Categories"}
                    </button>
                    <div className="mx-3 my-1 h-px bg-border" />
                    <button
                      type="button"
                      onClick={() => { setSkill(parent!.slug); setSkillOpen(false); pushParams({ skill: parent!.slug }); setDrillParent(null); }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors hover:bg-accent",
                        skill === parent?.slug && "bg-accent font-semibold"
                      )}
                    >
                      All {parent?.name}
                    </button>
                    {kids.map(k => (
                      <button
                        key={k.id}
                        type="button"
                        onClick={() => { setSkill(k.slug); setSkillOpen(false); pushParams({ skill: k.slug }); setDrillParent(null); }}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors hover:bg-accent",
                          skill === k.slug && "bg-accent font-semibold"
                        )}
                      >
                        {k.name}
                      </button>
                    ))}
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </div>

      <Dropdown
        label="Rating"
        value={rating}
        options={RATING_OPTIONS}
        onChange={(v) => { setRating(v); pushParams({ min_rating: v }); }}
        icon={Star}
      />

      <Dropdown
        label="Availability"
        value={avail}
        options={AVAIL_OPTIONS}
        onChange={(v) => { setAvail(v); pushParams({ avail: v }); }}
        icon={Zap}
      />
    </div>
  );
}
