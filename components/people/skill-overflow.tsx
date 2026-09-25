"use client";

import * as React from "react";

export function SkillOverflow({
  skills,
  userId,
}: {
  skills: { id: string; name: string; slug: string; is_primary: boolean; verification_status: string }[];
  userId: string;
}) {
  const [showAll, setShowAll] = React.useState(false);

  return (
    <>
      {skills.map((s) => (
        showAll ? (
          <a
            key={s.id}
            href={`/categories/${s.slug}?employee=${userId}`}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors hover:border-primary/50 hover:bg-primary/5 ${s.verification_status === "verified" || s.verification_status === "experienced" || s.verification_status === "top_rated" ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700" : "bg-muted/30"}`}
          >
            {s.name}
            {s.is_primary && <span className="h-2.5 w-2.5 text-amber-500">★</span>}
          </a>
        ) : null
      ))}
      <button
        onClick={() => setShowAll(!showAll)}
        className="inline-flex items-center rounded-full border border-dashed px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors cursor-pointer"
      >
        {showAll ? "Show less" : `+${skills.length} more`}
      </button>
    </>
  );
}

export function TechList({ techs }: { techs: string[] }) {
  const [showAll, setShowAll] = React.useState(false);
  const displayed = showAll ? techs : techs.slice(0, 8);
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Technologies</p>
      <div className="flex flex-wrap gap-1.5">
        {displayed.map((t: string, i: number) => (
          <span
            key={i}
            className="inline-flex cursor-default items-center gap-1 rounded-full border border-dashed bg-muted/20 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
          >
            {t}
          </span>
        ))}
        {techs.length > 8 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="inline-flex cursor-pointer items-center rounded-full border border-dashed px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
          >
            {showAll ? "Show less" : `+${techs.length - 8} more`}
          </button>
        )}
      </div>
    </div>
  );
}

export function ContractSkills({ contracts }: { contracts: { category?: { name: string; status: string } | null }[] }) {
  const [showAll, setShowAll] = React.useState(false);
  const names = React.useMemo(() => {
    return [...new Set(contracts.map((c) => c.category).filter((cat): cat is { name: string; status: string } => cat != null && cat.status === "active").map((c) => c.name))] as string[];
  }, [contracts]);
  const displayed = showAll ? names : names.slice(0, 4);
  return (
    <div className="flex flex-wrap gap-1">
      {displayed.map((name) => (
        <span key={name} className="rounded-full border bg-muted/30 px-1.5 py-0.5 text-[9px] font-medium">{name}</span>
      ))}
      {names.length > 4 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="cursor-pointer rounded-full border border-dashed px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
        >
          {showAll ? "Show less" : `+${names.length - 4} more`}
        </button>
      )}
    </div>
  );
}
