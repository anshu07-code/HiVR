"use client";

/**
 * VoiceSearch — a single-line search input with a built-in search
 * submit button, an optional voice-mic toggle, and a clear button.
 *
 * Design:
 *  - Renders as a plain `<div>` (NOT a `<form>`) so it composes
 *    cleanly with the parent form in the page. The parent form
 *    provides the action/method; we just put a `<button
 *    type="submit" form="<parentFormId>">` inside this component
 *    to trigger the parent submission from the icon button.
 *  - Layout: [🔍 input  ✕ (clear)  🎤 (mic)  ⏎ (search submit)]
 *
 * The parent form is identified by the `parentFormId` prop. If it's
 * omitted, the search icon falls back to a non-submit button (no-op)
 * so the component can also be used standalone.
 */

import * as React from "react";
import { Mic, MicOff, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

type SpeechRecognitionResultAlt = { transcript: string; confidence: number };
type SpeechRecognitionResult = {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionResultAlt;
};
type SpeechRecognitionEventLike = {
  results: { length: number; [index: number]: SpeechRecognitionResult };
  resultIndex: number;
};
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  onstart?: (() => void) | null;
};

type WindowWithSpeech = Window & {
  SpeechRecognition?: { new (): SpeechRecognitionLike };
  webkitSpeechRecognition?: { new (): SpeechRecognitionLike };
};

export type VoiceSearchProps = {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  className?: string;
  /** ID of the parent <form>. The search-icon button submits it. */
  parentFormId?: string;
  onChange?: (value: string) => void;
};

export function VoiceSearch({
  name,
  defaultValue = "",
  placeholder = "Search…",
  className,
  parentFormId,
  onChange,
}: VoiceSearchProps) {
  const [value, setValue] = React.useState(defaultValue);
  const [listening, setListening] = React.useState(false);
  const [interim, setInterim] = React.useState("");
  const [supported, setSupported] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const recRef = React.useRef<SpeechRecognitionLike | null>(null);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as WindowWithSpeech;
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    setSupported(!!Ctor);
  }, []);

  const start = React.useCallback(() => {
    setError(null);
    if (typeof window === "undefined") return;
    const w = window as WindowWithSpeech;
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    try {
      const rec = new Ctor();
      rec.lang = "en-IN";
      rec.continuous = false;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.onresult = (e) => {
        let final = "";
        let pending = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          const t = r[0]?.transcript ?? "";
          if (r.isFinal) final += t;
          else pending += t;
        }
        if (final) {
          setValue((prev) => {
            const sep = prev && !/\s$/.test(prev) ? " " : "";
            return (prev + sep + final).trim();
          });
          setInterim("");
        } else {
          setInterim(pending);
        }
      };
      rec.onerror = (e) => {
        setError(e?.error ?? "speech error");
        setListening(false);
      };
      rec.onend = () => {
        setListening(false);
        setInterim("");
      };
      rec.onstart = () => setListening(true);
      rec.start();
      recRef.current = rec;
      setListening(true);
    } catch (e: any) {
      setError(e?.message ?? "Failed to start");
      setListening(false);
    }
  }, []);

  const stop = React.useCallback(() => {
    try { recRef.current?.stop(); } catch { /* noop */ }
    setListening(false);
  }, []);

  const handleToggle = () => {
    if (listening) stop();
    else start();
  };

  // Enter in the input → submit the parent form via the hidden submit
  // button. Works because the input is a child of the parent <form>
  // (via `form="..."` on the search button). Pressing Enter natively
  // submits the form, so this is mostly a safety net.
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && parentFormId) {
      e.preventDefault();
      const form = document.getElementById(parentFormId) as HTMLFormElement | null;
      form?.requestSubmit();
    }
  };

  const display = listening && interim ? `${value}${value && !/\s$/.test(value) ? " " : ""}${interim}` : value;

  return (
    <div className={cn("relative flex w-full items-center", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        name={name}
        value={display}
        onChange={(e) => {
          setValue(e.target.value);
          onChange?.(e.target.value);
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn(
          "h-10 w-full rounded-md border border-input bg-background pl-9 text-sm",
          // Reserve enough right padding for all the right-side
          // controls (from right→left): search submit (28px) +
          // mic when supported (28px) + clear X when value (24px)
          // + 6px gaps between them.
          value && supported ? "pr-28"
          : value            ? "pr-24"
          : supported        ? "pr-16"
          : "pr-12",
          "ring-offset-background placeholder:text-muted-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          listening && "border-primary/60 ring-1 ring-primary/30",
        )}
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            setValue("");
            onChange?.("");
            const url = new URL(window.location.href);
            url.searchParams.delete("q");
            window.location.href = url.toString();
          }}
          aria-label="Clear search"
          className="absolute right-[5.5rem] top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      {supported && (
        <button
          type="button"
          onClick={handleToggle}
          aria-label={listening ? "Stop listening" : "Start voice search"}
          title={listening ? "Stop" : "Search by voice"}
          className={cn(
            "absolute right-10 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md transition-colors",
            listening
              ? "bg-rose-500/15 text-rose-600 hover:bg-rose-500/25"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          {listening ? (
            <span className="relative inline-flex">
              <MicOff className="h-4 w-4" />
              <span className="absolute -inset-1 animate-ping rounded-full bg-rose-500/30" />
            </span>
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </button>
      )}
      {/* Search submit — INSIDE the bar (the user requested this).
          Submits the parent form via the `form="..."` attribute,
          which works even though the button lives outside the form. */}
      <button
        type="submit"
        form={parentFormId}
        aria-label="Search"
        title="Search"
        className="absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
      >
        <Search className="h-3.5 w-3.5" />
      </button>
      {listening && (
        <span className="pointer-events-none absolute -bottom-5 left-0 text-[10px] font-medium uppercase tracking-wider text-rose-600">
          <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500 align-middle" />
          listening…
        </span>
      )}
      {error && (
        <span className="pointer-events-none absolute -bottom-5 left-0 text-[10px] text-destructive">
          {error === "not-allowed" ? "Mic blocked — allow access in your browser" : `Mic error: ${error}`}
        </span>
      )}
    </div>
  );
}
