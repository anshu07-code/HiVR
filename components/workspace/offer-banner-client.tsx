"use client";

/**
 * OfferBannerClient — a thin client-side wrapper that defers loading
 * the (heavy) OfferBanner component until after first paint. Without
 * this, every public page would block initial render on the
 * OfferBanner's 3 Supabase queries + 3 realtime subscriptions.
 *
 * `ssr: false` on `next/dynamic` is only allowed in Client Components,
 * so we wrap the lazy import here and re-export it as a regular
 * component that the Server Component can render.
 */

import dynamic from "next/dynamic";

export const OfferBannerClient = dynamic(
  () => import("@/components/workspace/offer-banner").then((m) => m.OfferBanner),
  { ssr: false, loading: () => null },
);
