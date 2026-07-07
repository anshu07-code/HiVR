"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { CategoryStickyNav } from "./category-sticky-nav";

export function CategoryStickyNavWrapper() {
  const [data, setData] = React.useState<{
    activeParents: { id: string; slug: string; name: string; icon: string; tier: string }[];
    childrenByParent: Record<string, { id: string; slug: string; name: string }[]>;
  }>({ activeParents: [], childrenByParent: {} });

  React.useEffect(() => {
    (async () => {
      const sb = createClient();
      const { data: raw } = await sb
        .from("skill_categories")
        .select("id, slug, name, icon, tier, status, parent_category_id")
        .order("sort_order");
      const categories = (raw ?? []) as any[];

      const parents = categories.filter((c: any) => !c.parent_category_id && c.status === "active");
      const childrenByParent: Record<string, { id: string; slug: string; name: string }[]> = {};
      for (const p of parents) {
        childrenByParent[p.id] = categories
          .filter((c: any) => c.parent_category_id === p.id && c.status === "active")
          .map((c: any) => ({ id: c.id, slug: c.slug, name: c.name }));
      }

      setData({
        activeParents: parents.map((p: any) => ({ id: p.id, slug: p.slug, name: p.name, icon: p.icon, tier: p.tier })),
        childrenByParent,
      });
    })();
  }, []);

  return <CategoryStickyNav activeParents={data.activeParents} childrenByParent={data.childrenByParent} />;
}
