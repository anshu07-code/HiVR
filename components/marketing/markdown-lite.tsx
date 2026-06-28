// Minimal markdown-to-React renderer for legal pages.
// Avoids pulling in a heavy markdown library for a few hundred lines of text.

import * as React from "react";

function renderLine(line: string, key: number) {
  // Headings
  const h = line.match(/^(#{1,6})\s+(.*)$/);
  if (h) {
    const level = h[1].length;
    const text = h[2];
    const cls = ["text-2xl font-display font-semibold mt-6 mb-2", "text-xl font-display font-semibold mt-5 mb-2", "text-lg font-semibold mt-4 mb-2", "text-base font-semibold mt-3 mb-1", "text-sm font-semibold mt-2", "text-xs font-semibold mt-2"][level - 1];
    return React.createElement(`h${level}`, { key, className: cls.join(" ") }, text);
  }
  // Bullets
  if (line.startsWith("- ")) {
    return React.createElement("li", { key, className: "ml-6 list-disc" }, renderInline(line.slice(2)));
  }
  // Numbered
  const ol = line.match(/^(\d+)\.\s+(.*)$/);
  if (ol) {
    return React.createElement("li", { key, className: "ml-6 list-decimal" }, renderInline(ol[2]));
  }
  // Empty
  if (!line.trim()) return React.createElement("br", { key });
  // Paragraph
  return React.createElement("p", { key, className: "my-2 text-sm leading-relaxed" }, renderInline(line));
}

function renderInline(text: string): React.ReactNode[] {
  // Very small parser: **bold**, *italic*, `code`, [text](url)
  const parts: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < text.length) {
    const bold = text.slice(i).match(/^\*\*(.+?)\*\*/);
    const italic = text.slice(i).match(/^\*(.+?)\*/);
    const code = text.slice(i).match(/^`(.+?)`/);
    const link = text.slice(i).match(/^\[(.+?)\]\((.+?)\)/);
    if (bold) { parts.push(React.createElement("strong", { key: key++ }, bold[1])); i += bold[0].length; continue; }
    if (italic) { parts.push(React.createElement("em", { key: key++ }, italic[1])); i += italic[0].length; continue; }
    if (code) { parts.push(React.createElement("code", { key: key++, className: "rounded bg-muted px-1.5 py-0.5 text-xs" }, code[1])); i += code[0].length; continue; }
    if (link) { parts.push(React.createElement("a", { key: key++, href: link[2], className: "text-primary underline" }, link[1])); i += link[0].length; continue; }
    // accumulate plain text up to the next marker
    let j = i + 1;
    while (j < text.length && !/^[*[`]/.test(text.slice(j))) j++;
    parts.push(text.slice(i, j));
    i = j;
  }
  return parts;
}

export function MarkdownLite({ source }: { source: string }) {
  return (
    <div className="prose-sm max-w-none">
      {source.split("\n").map(renderLine)}
    </div>
  );
}
