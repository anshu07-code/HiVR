import {
  Code, Terminal, Brain, Table, Calculator, GraduationCap, Palette, Cloud,
  Smartphone, Shield, ListChecks, Pen, Inbox, Languages, Tag, Compass,
  Boxes, Megaphone, Video, Mic, Briefcase, BarChart3, Camera, TrendingUp,
  Bug, Music, type LucideProps,
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
  megaphone: Megaphone,
  video: Video,
  mic: Mic,
  briefcase: Briefcase,
  "bar-chart": BarChart3,
  camera: Camera,
  "trending-up": TrendingUp,
  bug: Bug,
  music: Music,
};

export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Boxes;
  return <Icon className={className} strokeWidth={1.75} />;
}
