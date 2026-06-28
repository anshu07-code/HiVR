import {
  Code, Terminal, Brain, Table, Calculator, GraduationCap, Palette, Cloud,
  Smartphone, Shield, ListChecks, Pen, Inbox, Languages, Tag, Compass,
  Boxes, type LucideProps,
} from "lucide-react";

const ICONS: Record<string, React.ComponentType<LucideProps>> = {
  code: Code,
  terminal: Terminal,
  brain: Brain,
  table: Table,
  calculator: Calculator,
  "graduation-cap": GraduationCap,
  palette: Palette,
  cloud: Cloud,
  smartphone: Smartphone,
  shield: Shield,
  "list-checks": ListChecks,
  pen: Pen,
  inbox: Inbox,
  languages: Languages,
  tag: Tag,
  compass: Compass,
  boxes: Boxes,
};

export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Boxes;
  return <Icon className={className} strokeWidth={1.75} />;
}
