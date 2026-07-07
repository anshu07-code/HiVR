import {
  Code, Terminal, Brain, Palette, Cloud, Smartphone, Shield,
  Pen, Megaphone, Video, Mic, Briefcase, BarChart3, Camera,
  TrendingUp, Bug, Music, Globe, Layout, FileText, BookOpen,
  ShoppingCart, CreditCard, Monitor, Headphones, Search, Star,
  MessageSquare, Zap, Users, Wrench, Cog, Box, Eye, Lock,
  Database, Network, Rocket, Heart, Sun, Calendar, Building,
  MapPin, Compass, Fingerprint, Image, Bot, Layers, Workflow,
  GitBranch, GraduationCap, Languages, Mail, Send, Share2,
  Link2, Calculator, Phone, Target, type LucideIcon,
} from "lucide-react";

const K: Record<string, LucideIcon[]> = {
  api:[Code,GitBranch,Network,Terminal], integration:[GitBranch,Code,Network,Workflow],
  bug:[Bug,Search,Wrench,Shield], landing:[Layout,Palette,Monitor,Globe],
  speed:[Zap,TrendingUp,BarChart3,Cog], optimization:[Zap,TrendingUp,BarChart3,Cog],
  maintenance:[Wrench,Cog,Monitor], code:[Code,Terminal,FileText,GitBranch],
  review:[Search,Eye,Star,Code], script:[Terminal,Code,Workflow,Zap],
  automation:[Workflow,Terminal,Cog,Zap], browser:[Globe,Monitor,Smartphone,Box],
  extension:[Box,Globe,Code,Smartphone], scraping:[Search,Globe,Database,Workflow],
  frontend:[Layout,Palette,Smartphone,Code], backend:[Code,Database,Terminal,Network],
  fullstack:[Code,Database,Layout,Terminal], wordpress:[Globe,Layout,Pen,ShoppingCart],
  shopify:[ShoppingCart,Globe,Layout,CreditCard], mobile:[Smartphone,Monitor,Code,Layout],
  app:[Smartphone,Monitor,Layout,Workflow], desktop:[Monitor,Code,Layout,Terminal],
  cyber:[Shield,Lock,Search,Network], security:[Shield,Lock,Search,Bug],
  cloud:[Cloud,Network,Database,Globe], computing:[Cloud,Network,Terminal,Cog],
  devops:[Terminal,Cloud,Workflow,Cog], database:[Database,Code,BarChart3,Search],
  erp:[Database,BarChart3,Workflow,Cog], crm:[Users,MessageSquare,BarChart3,ShoppingCart],
  ai:[Bot,Brain,Code,Workflow], powered:[Bot,Zap,Cog,Workflow],
  logo:[Palette,Pen,Layout,Star], card:[CreditCard,Layout,Palette,Pen], cards:[CreditCard,Layout,Palette,Pen],
  business:[Briefcase,Building,BarChart3,Users],
  social:[Users,MessageSquare,Megaphone,Camera], media:[Megaphone,MessageSquare,Camera,Users],
  presentation:[Layout,Monitor,BarChart3,FileText],   illustration:[Pen,Palette,Layers,Eye],
  resume:[FileText,Pen,BookOpen,Layout], book:[BookOpen,Pen,FileText,Layout],
  cover:[BookOpen,Layout,Image,Palette], nft:[Image,Palette,Box,ShoppingCart],
  art:[Palette,Pen,Image,Layers], image:[Image,Camera,Palette,Layers],
  editing:[Pen,Image,Layers,Wrench], retouching:[Camera,Image,Palette,Wrench],
  thumbnail:[Image,Monitor,Video,Layout], banner:[Image,Layout,Megaphone,Palette],
  flyer:[FileText,Layout,Palette,Megaphone], brochure:[BookOpen,Layout,FileText,Image],
  invitation:[FileText,Pen,Layout,Heart], shirt:[Palette,Pen,Layers,ShoppingCart],
  brand:[Palette,Pen,Layers,Star], identity:[Palette,Fingerprint,Layers,Star],
  ui:[Layout,Monitor,Smartphone,Palette], ux:[Palette,Layout,Monitor,Smartphone],
  packaging:[Box,Palette,Layout,ShoppingCart], modeling:[Box,Layers,Cog,Terminal],
  seo:[Search,Globe,BarChart3,TrendingUp], audit:[Search,BarChart3,FileText,Eye],
  keyword:[Search,BarChart3,TrendingUp,Globe], research:[Search,BarChart3,FileText,Globe],
  marketing:[Megaphone,TrendingUp,BarChart3,Users], ads:[Megaphone,TrendingUp,BarChart3],
  google:[Search,Globe,BarChart3,Megaphone], facebook:[Users,Megaphone,BarChart3,MessageSquare],
  email:[Mail,MessageSquare,Send,Users], influencer:[Users,Star,Megaphone,Camera],
  affiliate:[Link2,Users,ShoppingCart,Globe], strategy:[BarChart3,TrendingUp,Workflow],
  blog:[BookOpen,Pen,FileText,Globe], article:[FileText,Pen,BookOpen,Code],
  technical:[Code,FileText,BookOpen,Terminal], writing:[Pen,FileText,BookOpen,Code],
  linkedin:[Users,Briefcase,FileText,Share2], profile:[Users,FileText,Camera,Star],
  proofreading:[Search,FileText,Pen,BookOpen], translation:[Globe,Languages,BookOpen,MessageSquare],
  transcription:[FileText,Headphones,Pen,MessageSquare], copywriting:[Pen,Megaphone,FileText,MessageSquare],
  ghostwriting:[Pen,BookOpen,FileText,Users], ebook:[BookOpen,FileText,Monitor,Pen],
  documentation:[FileText,BookOpen,Code,Pen],
  video:[Video,Camera,Monitor], motion:[Video,Layers,Zap,Eye],
  shorts:[Video,Smartphone,Camera,Zap], reels:[Video,Smartphone,Camera],
  intro:[Video,Layout,Zap], outro:[Video,Layout,Box],
  ugc:[Camera,Video,Users,Star], subtitle:[FileText,Video,MessageSquare,Pen],
  caption:[FileText,Video,MessageSquare,Pen], color:[Palette,Video,Image,Zap],
  correction:[Wrench,Video,Image,Palette], voice:[Headphones,Mic,Music,Video],
  whiteboard:[Pen,Video,Layout,Monitor], animation:[Video,Layers,Palette],
  channel:[Monitor,Video,Users,Megaphone], course:[BookOpen,Video,Monitor,GraduationCap],
  production:[Video,Music,Cog],
  prompt:[MessageSquare,Bot,Code,Workflow], generation:[Zap,Cog,Bot,Brain],
  consulting:[Briefcase,Users,BarChart3,MessageSquare], setup:[Cog,Wrench,Workflow,Terminal],
  chatbot:[MessageSquare,Bot,Brain,Workflow], machine:[Brain,Cog,Database,BarChart3],
  learning:[Brain,BarChart3,Database,TrendingUp], agents:[Bot,Cog,Workflow,MessageSquare],
  custom:[Cog,Wrench,Code,Box], retrieval:[Search,Database,Network,Bot],
  assistant:[Users,Headphones,MessageSquare,Calendar], virtual:[Monitor,Headphones,Calendar,MessageSquare],
  customer:[Users,MessageSquare,Headphones,Heart], support:[Headphones,MessageSquare,Users],
  lead:[Users,TrendingUp,BarChart3], spreadsheet:[FileText,BarChart3,Database],
  cleanup:[Wrench,Database,FileText], hr:[Users,Briefcase,FileText,Calendar],
  operations:[Cog,Workflow,BarChart3,Briefcase], startup:[Rocket,TrendingUp,Users,Briefcase],
  bookkeeping:[FileText,CreditCard,BarChart3,Calculator], budgeting:[CreditCard,BarChart3,TrendingUp,Calculator],
  investment:[TrendingUp,BarChart3,Briefcase], tax:[FileText,CreditCard,Shield,Calculator],
  payroll:[Users,CreditCard,Calculator,FileText], financial:[BarChart3,TrendingUp,CreditCard,Calculator],
  cfo:[Briefcase,BarChart3,TrendingUp,CreditCard], fundraising:[CreditCard,Users,TrendingUp],
  visualization:[BarChart3,TrendingUp,Monitor,Database], dashboard:[Monitor,BarChart3,Layout,TrendingUp],
  excel:[FileText,BarChart3,Calculator,Database], bi:[BarChart3,Monitor,Database,TrendingUp],
  deep:[Brain,Database,BarChart3,Cog], natural:[MessageSquare,Globe,Bot,Brain],
  computer:[Monitor,Code,Image,Brain], vision:[Eye,Camera,Image,Brain],
  warehouse:[Database,Cloud,Box,Network], mlops:[Cog,Terminal,Workflow,Cloud],
  photo:[Camera,Image,Palette,Layers], photography:[Camera,Image,Palette,Sun],
  estate:[Building,MapPin,Camera,Image], event:[Calendar,Camera,Image,Users],
  commercial:[Briefcase,Camera,Image,Building],
  lessons:[BookOpen,GraduationCap,Pen,MessageSquare], tutoring:[GraduationCap,BookOpen,Users,MessageSquare],
  travel:[Globe,MapPin,Compass,Sun], advice:[MessageSquare,Users,BookOpen,Star],
  interview:[Users,Briefcase,MessageSquare,FileText],
  appointment:[Calendar,Users,Phone,MessageSquare], funnel:[TrendingUp,BarChart3,Zap],
  sales:[TrendingUp,CreditCard,Briefcase],
  manual:[Wrench,Search,Bug], testing:[Bug,Search,Shield],
  performance:[Zap,BarChart3,TrendingUp],
  music:[Music,Headphones,Mic], audio:[Headphones,Music,Mic],
  songwriting:[Music,Pen,Mic,Star], audiobook:[BookOpen,Headphones,Mic,FileText],
  podcast:[Mic,Headphones,Music,MessageSquare], mixing:[Music,Headphones,Cog,Zap],
  mastering:[Music,Headphones,Star,Zap], sound:[Headphones,Music,Mic],
  jingles:[Music,Mic,Star,Music],
};

function keywords(n: string): string[] {
  return n.toLowerCase().split(/[\s-]+/);
}

export function getSubcategoryIcons(name: string): LucideIcon[] {
  const w = keywords(name);
  const r: LucideIcon[] = [];
  const s = new Set<string>();
  for (const kw of w) {
    const icons = K[kw];
    if (icons) for (const icon of icons) {
      const k = icon.displayName ?? icon.name ?? String(icon);
      if (!s.has(k)) { s.add(k); r.push(icon); if (r.length >= 6) return r; }
    }
  }
  for (const f of [Code, Wrench, Cog, Box]) {
    const k = f.displayName ?? f.name ?? String(f);
    if (!s.has(k)) { s.add(k); r.push(f); if (r.length >= 4) break; }
  }
  return r.slice(0, 6);
}
