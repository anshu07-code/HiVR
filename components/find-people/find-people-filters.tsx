"use client";

/**
 * FindPeopleFilters — the chip-style filter bar on the Find People page.
 *
 * Lives in a Client Component because it needs onChange handlers to
 * auto-submit the form when the user changes a dropdown. The page
 * itself stays a Server Component (so the initial results are SSR'd);
 * only this small island is interactive.
 *
 * All other filter inputs (the search box, the TierToggle, the
 * `min_rating`, `avail`, and `skill` selects) live inside the same
 * `<form>` so changing any one of them submits the form to the
 * server with all current params preserved.
 *
 * Uses client-side router.push() instead of a full form submit, so
 * the theme class is preserved (no full reload = no FOUC flash).
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { TierToggle } from "@/components/search/tier-toggle";

type Cat = { id: string; slug: string; name: string };

type Props = {
  q: string;
  tab: string;
  skillFilter: string;
  tierFilter: string;
  availFilter: string;
  minRating: string;
  flatCategories: Cat[];
};

export function FindPeopleFilters({
  q, tab, skillFilter, tierFilter, availFilter, minRating, flatCategories,
}: Props) {
  const router = useRouter();
  // Hold the current values in state so we can read them at submit
  // time. TierToggle updates the URL via router.push directly, so
  // we also refresh our local copy.
  const [skill, setSkill] = React.useState(skillFilter);
  const [rating, setRating] = React.useState(minRating);
  const [avail, setAvail] = React.useState(availFilter);

  React.useEffect(() => { setSkill(skillFilter); }, [skillFilter]);
  React.useEffect(() => { setRating(minRating); }, [minRating]);
  React.useEffect(() => { setAvail(availFilter); }, [availFilter]);

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

  return (
    <div className="flex flex-wrap items-center gap-2">
      <TierToggle asUrlParams paramName="tier" showAll={true} />

      <span className="mx-1 h-4 w-px bg-border" />

      <select
        name="skill"
        value={skill}
        aria-label="Filter by skill"
        onChange={(e) => {
          const v = e.target.value;
          setSkill(v);
          pushParams({ skill: v });
        }}
        className="h-9 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">All skills</option>
        {flatCategories.map(c => (
          <option key={c.slug} value={c.slug}>{c.name}</option>
        ))}
      </select>

      <select
        name="min_rating"
        value={rating}
        aria-label="Minimum rating"
        onChange={(e) => {
          const v = e.target.value;
          setRating(v);
          pushParams({ min_rating: v });
        }}
        className="h-9 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">Any rating</option>
        <option value="4.5">4.5+ stars</option>
        <option value="4">4+ stars</option>
        <option value="3.5">3.5+ stars</option>
      </select>

      <select
        name="avail"
        value={avail}
        aria-label="Availability"
        onChange={(e) => {
          const v = e.target.value;
          setAvail(v);
          pushParams({ avail: v });
        }}
        className="h-9 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">Any availability</option>
        <option value="1">Available now</option>
      </select>
    </div>
  );
}
