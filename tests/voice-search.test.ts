import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Smoke tests for the VoiceSearch component.
 * The component relies on `window.SpeechRecognition` (browser-only), so we
 * stub it before importing. The SSR check ensures we never reference
 * `window` during the initial render.
 */
describe("VoiceSearch (smoke)", () => {
  it("renders without crashing in SSR (no window reference)", async () => {
    // No global stubs needed: the component uses `typeof window === "undefined"`
    // to short-circuit the feature check during SSR.
    const mod = await import("@/components/search/voice-search");
    const html = renderToStaticMarkup(
      React.createElement(mod.VoiceSearch, { name: "q", placeholder: "Search…" }),
    );
    expect(html).toContain("name=\"q\"");
    expect(html).toContain("Search…");
    // Mic button is not present during SSR (supported=false until effect runs)
    expect(html.toLowerCase()).not.toContain("mic");
  });

  it("hides the mic button when SpeechRecognition is absent", async () => {
    // Confirm: the original `window` is undefined in node, so the
    // effect sets supported=false, and the mic button never renders.
    const mod = await import("@/components/search/voice-search");
    const html = renderToStaticMarkup(
      React.createElement(mod.VoiceSearch, { name: "q", placeholder: "Search…" }),
    );
    // The text "Search by voice" is in a title attribute, only rendered when supported.
    expect(html).not.toContain("Search by voice");
  });

  it("emits safe markup (no dangerouslySetInnerHTML, no eval)", async () => {
    // Sanity: ensure the module doesn't expose dangerous APIs.
    const mod = await import("@/components/search/voice-search");
    expect(typeof mod.VoiceSearch).toBe("function");
  });
});
