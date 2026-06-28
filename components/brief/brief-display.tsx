import { CheckCircle2, FileText, Link2 } from "lucide-react";
import type { BriefValue } from "./brief-builder";

export function BriefDisplay({ brief }: { brief: BriefValue | null | undefined }) {
  if (!brief) {
    return <p className="text-sm text-muted-foreground">No brief provided.</p>;
  }
  const items = brief.checklist_items ?? [];
  const notes = brief.notes ?? "";
  const sampleUrl = brief.sample_url;

  if (items.length === 0 && !notes && !sampleUrl) {
    return <p className="text-sm text-muted-foreground">No brief provided.</p>;
  }

  return (
    <div className="space-y-4">
      {items.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Deliverables
          </p>
          <ol className="space-y-1.5">
            {items.map((c, i) => (
              <li key={c.key ?? i} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                <span>{c.text}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {notes && (
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
            <FileText className="h-3 w-3" />Notes
          </p>
          <p className="whitespace-pre-wrap text-sm">{notes}</p>
        </div>
      )}
      {sampleUrl && (
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
            <Link2 className="h-3 w-3" />Sample / reference
          </p>
          <a href={sampleUrl} target="_blank" rel="noreferrer" className="break-all text-sm text-primary hover:underline">
            {sampleUrl}
          </a>
        </div>
      )}
    </div>
  );
}
