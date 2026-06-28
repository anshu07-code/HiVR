"use client";

/**
 * FindPeopleSearchForm — the top search bar on the Find People page.
 *
 * Two reasons this lives in a Client Component:
 *  1. It uses `useRouter().push()` for the submit so the page
 *     navigates CLIENT-SIDE (no full reload). Full reloads re-run
 *     the anti-FOUC script and flash the light theme for a frame
 *     before the saved preference is reapplied.
 *  2. It needs to render the search submit icon INSIDE the
 *     VoiceSearch input, which requires passing `parentFormId` to
 *     the nested <VoiceSearch>.
 *
 * Preserves all other active filters as URL search params so the
 * search combines cleanly with the existing chip-based filters.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { VoiceSearch } from "@/components/search/voice-search";

type Props = {
  q: string;
  tab: string;
  skillFilter: string;
  tierFilter: string;
  availFilter: string;
  minRating: string;
};

export function FindPeopleSearchForm({
  q, tab, skillFilter, tierFilter, availFilter, minRating,
}: Props) {
  const router = useRouter();
  const formId = "find-people-search";

  function submitSearch(nextQ: string) {
    const params = new URLSearchParams();
    if (nextQ) params.set("q", nextQ);
    if (tab && tab !== "all") params.set("tab", tab);
    if (skillFilter) params.set("skill", skillFilter);
    if (tierFilter) params.set("tier", tierFilter);
    if (availFilter) params.set("avail", availFilter);
    if (minRating) params.set("min_rating", minRating);
    const qs = params.toString();
    router.push(qs ? `/find-people?${qs}` : "/find-people");
  }

  return (
    <form
      id={formId}
      action="/find-people"
      method="get"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const v = (fd.get("q") as string | null) ?? "";
        submitSearch(v);
      }}
      className="w-full md:max-w-md"
    >
      {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
      {skillFilter && <input type="hidden" name="skill" value={skillFilter} />}
      {tierFilter && <input type="hidden" name="tier" value={tierFilter} />}
      {availFilter && <input type="hidden" name="avail" value={availFilter} />}
      {minRating && <input type="hidden" name="min_rating" value={minRating} />}
      <VoiceSearch
        name="q"
        defaultValue={q}
        placeholder="Search by name, headline, or skill…"
        parentFormId={formId}
      />
    </form>
  );
}
