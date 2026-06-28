import Link from "next/link";
import { Logo } from "./logo";

const SECTIONS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Browse tasks",     href: "/browse" },
      { label: "Categories",       href: "/categories" },
      { label: "How it works",     href: "/how-it-works" },
      { label: "Pricing",          href: "/pricing" },
    ],
  },
  {
    title: "Trust & safety",
    links: [
      { label: "Trust & Safety",   href: "/trust" },
      { label: "How escrow works", href: "/trust/escrow" },
      { label: "Fee structure",    href: "/pricing#fees" },
      { label: "Help center",      href: "/support" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About",   href: "/about" },
      { label: "Careers", href: "/careers" },
      { label: "Blog",    href: "/blog" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms",            href: "/legal/terms" },
      { label: "Privacy",          href: "/legal/privacy" },
      { label: "Grievance Officer", href: "/legal/grievance" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t bg-card">
      <div className="container grid gap-8 py-12 md:grid-cols-5">
        <div className="md:col-span-1">
          <Logo />
          <p className="mt-3 text-sm text-muted-foreground">Small jobs, verified people.</p>
        </div>
        {SECTIONS.map(s => (
          <div key={s.title}>
            <h4 className="mb-3 text-sm font-semibold">{s.title}</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {s.links.map(l => (
                <li key={l.href}>
                  <Link href={l.href} className="transition-colors hover:text-foreground">{l.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t">
        <div className="container flex flex-col items-start justify-between gap-2 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} HiVR. All rights reserved.</p>
          <p>Grievance Officer: grievance@hivr.example · +91 00000 00000</p>
        </div>
      </div>
    </footer>
  );
}
