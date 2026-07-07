"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, X, Plus, GripVertical, Info, ChevronDown, Search, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "@/components/marketing/category-icon";

function makeSlug(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const PARENT_VOCAB: Record<string, {
  label: string;
  desc: string;
  fields: { key: string; label: string; options: string[]; multiple?: boolean }[];
}> = {
  "programming-tech": {
    label: "Tech & Programming", desc: "Software development, web, mobile, and tech services",
    fields: [
      { key: "programming_languages", label: "Programming Languages", multiple: true, options: ["JavaScript","TypeScript","Python","Java","C#","C++","Go","Rust","PHP","Ruby","Swift","Kotlin","Dart","Scala","R","Perl","Zig","Lua","Haskell","Elixir"] },
      { key: "frameworks", label: "Frameworks & Libraries", multiple: true, options: ["React","Next.js","Vue.js","Angular","Svelte","Node.js","Express","Django","Flask","FastAPI","Spring Boot","ASP.NET","Laravel","Symfony","Ruby on Rails","Flutter","React Native","TensorFlow","PyTorch","Tailwind CSS","Bootstrap","jQuery","GraphQL","Prisma","tRPC"] },
      { key: "databases", label: "Databases", multiple: true, options: ["PostgreSQL","MySQL","MongoDB","Redis","SQLite","Supabase","Firebase","DynamoDB","Elasticsearch","MariaDB","Cassandra","Neo4j"] },
      { key: "devops_tools", label: "DevOps & Cloud", multiple: true, options: ["Docker","Kubernetes","AWS","GCP","Azure","GitHub Actions","Terraform","Ansible","Nginx","Linux","CI/CD","Vercel","Netlify"] },
      { key: "expertise_level", label: "Expertise Level", multiple: false, options: ["Beginner","Intermediate","Advanced","Expert"] },
    ],
  },
  "graphic-design-creative": {
    label: "Design & Creative", desc: "Logo design, branding, UI/UX, and visual design",
    fields: [
      { key: "design_tools", label: "Design Tools", multiple: true, options: ["Figma","Adobe Photoshop","Adobe Illustrator","Adobe InDesign","Canva","Sketch","Affinity Designer","Procreate","CorelDRAW","GIMP","Blender","After Effects"] },
      { key: "design_style", label: "Design Style", multiple: true, options: ["Minimalist","Modern","Corporate","Flat Design","Material Design","Retro/Vintage","Hand-drawn","3D","Isometric","Typography-focused","Illustrative","Bold/Colorful"] },
      { key: "file_formats", label: "File Formats Delivered", multiple: true, options: ["AI","EPS","SVG","PDF","PNG","JPEG","PSD","FIG","SKETCH","TIFF","RAW","WEBP"] },
      { key: "industry", label: "Industry Focus", multiple: true, options: ["Tech/SaaS","E-commerce","Healthcare","Education","Real Estate","Food & Beverage","Fashion","Finance","Entertainment","Non-profit"] },
    ],
  },
  "writing-translation": {
    label: "Writing & Translation", desc: "Content writing, copywriting, editing, and translation",
    fields: [
      { key: "content_type", label: "Content Type", multiple: true, options: ["Blog Posts","Website Copy","SEO Articles","Press Releases","Product Descriptions","Email Newsletters","Social Media Posts","White Papers","Case Studies","Technical Writing","Script Writing","UX Writing"] },
      { key: "writing_style", label: "Writing Style", multiple: true, options: ["Formal/Business","Conversational","Academic","Creative","Technical","Journalistic","Persuasive","Storytelling","Minimalist","Descriptive"] },
      { key: "industry", label: "Industry Specialization", multiple: true, options: ["Technology","Healthcare","Finance","Legal","Marketing","Education","Travel & Hospitality","Fashion & Beauty","Food & Lifestyle","Real Estate"] },
      { key: "languages", label: "Languages", multiple: true, options: ["English","Hindi","Spanish","French","German","Arabic","Chinese","Japanese","Korean","Portuguese","Russian","Italian","Dutch"] },
    ],
  },
  "digital-marketing": {
    label: "Digital Marketing", desc: "SEO, social media, email marketing, and advertising",
    fields: [
      { key: "marketing_channels", label: "Marketing Channels", multiple: true, options: ["SEO","Google Ads","Social Media Marketing","Email Marketing","Content Marketing","Influencer Marketing","Affiliate Marketing","PPC","Video Marketing","Podcast Marketing"] },
      { key: "platforms", label: "Platforms", multiple: true, options: ["Google Analytics","Meta Ads","Google Ads Manager","HubSpot","Mailchimp","SEMrush","Ahrefs","Hootsuite","Buffer","Canva","WordPress","Shopify"] },
      { key: "target_audience", label: "Target Audience Type", multiple: true, options: ["B2B","B2C","Enterprise","SMB","Startups","E-commerce","SaaS","Local Business","Non-profit","Government"] },
      { key: "marketing_goal", label: "Primary Goal", multiple: false, options: ["Brand Awareness","Lead Generation","Sales Conversion","Customer Retention","Community Building","Traffic Growth","App Installs","Event Promotion"] },
    ],
  },
  "video-animation": {
    label: "Video & Animation", desc: "Video editing, motion graphics, and 3D animation",
    fields: [
      { key: "video_type", label: "Video Type", multiple: true, options: ["Explainer Video","Animation","Motion Graphics","Whiteboard Animation","3D Animation","2D Animation","Live Action","Product Demo","Tutorial","Social Media Video","Corporate Video","Music Video"] },
      { key: "video_software", label: "Software", multiple: true, options: ["After Effects","Premiere Pro","Blender","Cinema 4D","Maya","DaVinci Resolve","Final Cut Pro","3ds Max","Animate CC","Toon Boom","Unity","Unreal Engine"] },
      { key: "video_style", label: "Animation Style", multiple: true, options: ["Cartoonish","Realistic","Minimalist","Kinetic Typography","Stop Motion","Cel Animation","Motion Design","VFX","Mixed Media","Isometric"] },
      { key: "video_duration", label: "Typical Duration", multiple: false, options: ["Up to 30 sec","30-60 sec","1-3 min","3-5 min","5-10 min","10+ min"] },
    ],
  },
  "music-audio": {
    label: "Music & Audio", desc: "Audio production, mixing, voiceover, and sound design",
    fields: [
      { key: "audio_type", label: "Audio Type", multiple: true, options: ["Voiceover","Music Production","Mixing & Mastering","Sound Design","Podcast Editing","Audio Restoration","Jingle Production","Beat Making","Songwriting","Audio Branding"] },
      { key: "audio_software", label: "DAW / Software", multiple: true, options: ["Pro Tools","Ableton Live","Logic Pro","FL Studio","Cubase","Studio One","Reason","Audacity","Adobe Audition","GarageBand"] },
      { key: "genre", label: "Genre", multiple: true, options: ["Pop","Rock","Hip Hop","Electronic","Classical","Jazz","R&B","Country","Lo-fi","Ambient","Cinematic","World Music"] },
      { key: "voice_type", label: "Voice Type (Voiceover)", multiple: false, options: ["Male","Female","Neutral","Child","Character","Narration","Commercial","Audiobook","E-learning"] },
    ],
  },
  "business-consulting": {
    label: "Business & Consulting", desc: "Business plans, strategy, and management consulting",
    fields: [
      { key: "consulting_type", label: "Consulting Type", multiple: true, options: ["Business Planning","Market Research","Strategy Consulting","HR Consulting","Operations","Supply Chain","Change Management","Organizational Design","Process Improvement","Risk Management"] },
      { key: "industry", label: "Industry Focus", multiple: true, options: ["Technology","Healthcare","Finance","Manufacturing","Retail","Education","Real Estate","Energy","Hospitality","Non-profit"] },
      { key: "tools", label: "Tools & Frameworks", multiple: true, options: ["SWOT Analysis","Porter's Five Forces","Lean Six Sigma","Agile/Scrum","OKRs","Balanced Scorecard","Business Model Canvas","PESTLE Analysis","KPI Dashboards","Financial Modeling"] },
      { key: "business_size", label: "Client Size", multiple: false, options: ["Startup","SMB","Enterprise","Non-profit","Government"] },
    ],
  },
  "finance-accounting": {
    label: "Finance & Accounting", desc: "Bookkeeping, tax preparation, and financial analysis",
    fields: [
      { key: "service_type", label: "Service Type", multiple: true, options: ["Bookkeeping","Tax Preparation","Financial Planning","Auditing","Payroll","Budgeting","Forecasting","Valuation","CFO Services","Risk Assessment"] },
      { key: "accounting_software", label: "Software", multiple: true, options: ["QuickBooks","Xero","Sage","Tally","FreshBooks","Wave","Zoho Books","NetSuite","SAP","Excel"] },
      { key: "specialization", label: "Specialization", multiple: true, options: ["Corporate Tax","Personal Tax","GST/VAT","International Tax","Non-profit Accounting","Real Estate Accounting","Cryptocurrency Accounting","Transfer Pricing"] },
      { key: "standards", label: "Accounting Standards", multiple: true, options: ["GAAP","IFRS","Ind AS","SOX Compliance","FASB","IASB"] },
    ],
  },
  "data-science": {
    label: "Data & Analytics", desc: "Data analysis, machine learning, and data visualization",
    fields: [
      { key: "tools", label: "Tools & Technologies", multiple: true, options: ["Python","R","SQL","Excel","Tableau","Power BI","Jupyter","Pandas","NumPy","Scikit-learn","Spark","Hadoop","Airflow","dbt"] },
      { key: "analysis_type", label: "Analysis Type", multiple: true, options: ["Descriptive Analytics","Diagnostic Analytics","Predictive Analytics","Prescriptive Analytics","Data Mining","Statistical Analysis","A/B Testing","Cohort Analysis","Funnel Analysis","Time Series"] },
      { key: "visualization", label: "Visualization Tools", multiple: true, options: ["Tableau","Power BI","Looker","Metabase","Grafana","Plotly","Matplotlib","Seaborn","D3.js","Google Data Studio"] },
      { key: "databases_data", label: "Data Sources", multiple: true, options: ["PostgreSQL","MySQL","BigQuery","Snowflake","Redshift","MongoDB","CSV/Excel","APIs","Google Analytics","Flat Files"] },
    ],
  },
  "ai-ml": {
    label: "AI & Machine Learning", desc: "AI solutions, ML models, chatbots, and computer vision",
    fields: [
      { key: "ml_type", label: "ML / AI Type", multiple: true, options: ["Natural Language Processing","Computer Vision","Deep Learning","Reinforcement Learning","Generative AI","LLM Fine-tuning","Chatbots","Recommendation Systems","Predictive Modeling","Anomaly Detection"] },
      { key: "frameworks", label: "Frameworks", multiple: true, options: ["TensorFlow","PyTorch","Keras","scikit-learn","Hugging Face","LangChain","OpenAI API","Stable Diffusion","LlamaIndex","MLflow"] },
      { key: "deployment", label: "Deployment Platform", multiple: true, options: ["AWS SageMaker","Google AI Platform","Azure ML","Hugging Face Spaces","Replicate","RunPod","Local Server","Docker","Kubernetes"] },
      { key: "models", label: "Models Used", multiple: true, options: ["GPT-4","Claude","LLaMA","Mistral","Stable Diffusion","Whisper","BERT","T5","YOLO","ResNet","ViT","DALL-E"] },
    ],
  },
  "blockchain-web3": {
    label: "Blockchain & Web3", desc: "Smart contracts, dApps, NFTs, and DeFi development",
    fields: [
      { key: "blockchain_type", label: "Blockchain Platform", multiple: true, options: ["Ethereum","Solana","Polygon","Arbitrum","Optimism","Base","Avalanche","BNB Chain","Cosmos","Near","Polkadot","Bitcoin"] },
      { key: "smart_contract_lang", label: "Smart Contract Language", multiple: true, options: ["Solidity","Rust","Vyper","Move","Cairo","JavaScript","Python","Go"] },
      { key: "web3_tools", label: "Web3 Tools", multiple: true, options: ["Hardhat","Foundry","Truffle","Web3.js","Ethers.js","Wagmi","viem","The Graph","IPFS","Chainlink","Moralis","Alchemy"] },
      { key: "defi_type", label: "dApp Type", multiple: true, options: ["DeFi","NFT Marketplace","DAO","DEX","Lending Protocol","Gaming/GameFi","Identity/Verification","Supply Chain","Real Estate","Tokenization"] },
    ],
  },
  "cybersecurity": {
    label: "Cybersecurity", desc: "Security audits, penetration testing, and vulnerability assessment",
    fields: [
      { key: "security_type", label: "Security Service", multiple: true, options: ["Penetration Testing","Vulnerability Assessment","Security Audit","Compliance Audit","Incident Response","Threat Intelligence","SOC 2 Audit","Risk Assessment","Security Training","Red Teaming"] },
      { key: "tools", label: "Security Tools", multiple: true, options: ["Burp Suite","Metasploit","Nmap","Wireshark","Nessus","OpenVAS","Kali Linux","OWASP ZAP","John the Ripper","Hashcat","Splunk","Qualys"] },
      { key: "compliance", label: "Compliance Standards", multiple: true, options: ["SOC 2","ISO 27001","HIPAA","GDPR","PCI DSS","NIST","CIS Controls","FedRAMP","CCPA","SOX"] },
      { key: "specialization", label: "Specialization", multiple: true, options: ["Web Security","Network Security","Cloud Security","Application Security","Mobile Security","IoT Security","Blockchain Security","Zero Trust Architecture"] },
    ],
  },
  "legal": {
    label: "Legal Services", desc: "Contract review, legal research, and compliance documentation",
    fields: [
      { key: "practice_area", label: "Practice Area", multiple: true, options: ["Corporate Law","Contract Law","Intellectual Property","Employment Law","Real Estate Law","Tax Law","Immigration Law","Family Law","Criminal Law","Environmental Law"] },
      { key: "service_type", label: "Service Type", multiple: true, options: ["Contract Review","Legal Research","Document Drafting","Legal Advice","Compliance Review","Due Diligence","Litigation Support","Mediation","Arbitration"] },
      { key: "jurisdiction", label: "Jurisdiction", multiple: true, options: ["India","United States","United Kingdom","European Union","Canada","Australia","Singapore","UAE","International"] },
      { key: "document_type", label: "Document Type", multiple: true, options: ["NDA","Employment Contract","Terms of Service","Privacy Policy","Partnership Agreement","Lease Agreement","Service Agreement","License Agreement","M&A Documents"] },
    ],
  },
  "engineering-architecture": {
    label: "Engineering & Architecture", desc: "CAD design, structural engineering, and architectural planning",
    fields: [
      { key: "engineering_type", label: "Engineering Discipline", multiple: true, options: ["Structural Engineering","Civil Engineering","Mechanical Engineering","Electrical Engineering","Chemical Engineering","Industrial Engineering","Environmental Engineering","Aerospace Engineering"] },
      { key: "software", label: "Software", multiple: true, options: ["AutoCAD","Revit","SolidWorks","CATIA","ANSYS","MATLAB","ETABS","STAAD Pro","SketchUp","Rhino 3D","Blender","Fusion 360"] },
      { key: "project_type", label: "Project Type", multiple: true, options: ["Residential","Commercial","Industrial","Infrastructure","Interior Design","Urban Planning","Landscape Design","HVAC Design","Piping Design","Electrical Layout"] },
      { key: "deliverable_format", label: "Deliverable Format", multiple: true, options: ["DWG","DGN","RVT","PDF","3D Model","BIM Model","Structural Calculations","Bill of Materials","Shop Drawings","Rendering"] },
    ],
  },
  "photography": {
    label: "Photography", desc: "Photo editing, retouching, product photography, and event coverage",
    fields: [
      { key: "photography_type", label: "Photography Type", multiple: true, options: ["Product Photography","Portrait Photography","Event Photography","Real Estate Photography","Food Photography","Fashion Photography","Wedding Photography","Travel Photography","Aerial/Drone","Street Photography"] },
      { key: "editing_software", label: "Editing Software", multiple: true, options: ["Adobe Photoshop","Lightroom","Capture One","Luminar","Affinity Photo","DxO PhotoLab","GIMP","Darktable","ON1 Photo RAW"] },
      { key: "specialization", label: "Specialization", multiple: true, options: ["Photo Retouching","Color Grading","Background Removal","Object Removal","Photo Restoration","Compositing","Batch Editing","RAW Processing"] },
      { key: "equipment", label: "Equipment Used", multiple: true, options: ["DSLR","Mirrorless","Drone","Studio Lighting","Medium Format","Film Camera","360 Camera","Gimbal Stabilizer"] },
    ],
  },
};

export function GigForm() {
  const router = useRouter();
  const sb = createClient();
  const [categories, setCategories] = React.useState<any[]>([]);
  const [images, setImages] = React.useState<File[]>([]);
  const [imageUrls, setImageUrls] = React.useState<string[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [pricingModel, setPricingModel] = React.useState<"fixed" | "package">("fixed");
  const [tagsInput, setTagsInput] = React.useState("");
  const [tags, setTags] = React.useState<string[]>([]);
  const [deliverables, setDeliverables] = React.useState<string[]>([""]);
  const [selectedCategoryId, setSelectedCategoryId] = React.useState<string>("");
  const [parentSlug, setParentSlug] = React.useState<string>("");
  const [fieldValues, setFieldValues] = React.useState<Record<string, string[]>>({});
  const [catOpen, setCatOpen] = React.useState(false);
  const catRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const { data: skills } = await sb.from("employee_skills")
        .select("category_id")
        .eq("employee_id", user.id);
      const skillIds = skills?.map(s => s.category_id) ?? [];
      let query = sb.from("skill_categories")
        .select("id, slug, name, tier, icon, parent_category_id")
        .not("parent_category_id", "is", null)
        .eq("status", "active");
      if (skillIds.length > 0) query = query.in("id", skillIds);
      const { data } = await query.order("name");
      setCategories(data ?? []);
    })();
  }, []);

  const selectedSubcategory = React.useMemo(
    () => categories.find(c => c.id === selectedCategoryId),
    [selectedCategoryId, categories]
  );

  React.useEffect(() => {
    if (!selectedSubcategory?.parent_category_id) { setParentSlug(""); return; }
    (async () => {
      const { data } = await sb.from("skill_categories")
        .select("slug")
        .eq("id", selectedSubcategory.parent_category_id)
        .single();
      if (data) setParentSlug(data.slug);
    })();
  }, [selectedSubcategory?.parent_category_id]);

  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (catRef.current && !catRef.current.contains(e.target as Node)) setCatOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const parentVocab = parentSlug ? PARENT_VOCAB[parentSlug] : null;
  const categoryFields = parentVocab?.fields ?? [];

  const handleImageAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setImages((prev) => [...prev, ...files].slice(0, 8));
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setImageUrls((prev) => {
      const next = [...prev];
      next.splice(index, 1);
      return next;
    });
  };

  const uploadImages = async (): Promise<string[]> => {
    if (images.length === 0) return [];
    setUploading(true);
    const urls: string[] = [];
    for (const file of images) {
      const ext = file.name.split(".").pop();
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error } = await sb.storage.from("gig_images").upload(path, file);
      if (error) { console.error("upload error", error); continue; }
      const { data: urlData } = sb.storage.from("gig_images").getPublicUrl(path);
      urls.push(urlData.publicUrl);
    }
    setImageUrls(urls);
    setUploading(false);
    return urls;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);

    const form = new FormData(e.currentTarget);
    const title = form.get("title") as string;
    const description = form.get("description") as string;
    const price = parseInt(form.get("price") as string);
    const deliveryDays = parseInt(form.get("delivery_days") as string);
    const requirements = form.get("requirements") as string;
    const tip = form.get("tip") as string;

    const filteredDeliverables = deliverables.filter(d => d.trim().length > 0);
    if (filteredDeliverables.length === 0) {
      alert("Please add at least one deliverable.");
      setSaving(false);
      return;
    }
    if (!tip || tip.trim().length < 10) {
      alert("Please provide a tip (at least 10 characters) — it will appear in the expert tips section on the category page.");
      setSaving(false);
      return;
    }

    const slug = `${makeSlug(title)}-${Date.now().toString(36)}`;

    const { data: user } = await sb.auth.getUser();
    if (!user.user) { setSaving(false); return; }

    const urls = await uploadImages();

    const metadata: Record<string, any> = {};
    if (parentSlug) {
      metadata.category_parent_slug = parentSlug;
      // Include all category-specific field values
      for (const [key, vals] of Object.entries(fieldValues)) {
        if (vals.length > 0) metadata[key] = vals;
      }
    }

    // Safety check: ensure the selected category is active
    const { data: catCheck } = await sb.from("skill_categories").select("status").eq("id", selectedCategoryId).single();
    if (!catCheck || catCheck.status !== "active") { alert("This category is not yet open for gigs."); setSaving(false); return; }

    const payload: any = {
      employee_id: user.user.id,
      category_id: selectedCategoryId,
      title,
      slug,
      description,
      pricing_model: pricingModel,
      images: urls,
      deliverables: filteredDeliverables,
      tip,
      metadata: Object.keys(metadata).length > 0 ? metadata : null,
      requirements: requirements || null,
      tags: tags.length > 0 ? tags : null,
    };

    if (pricingModel === "fixed") {
      payload.price = price;
      payload.delivery_days = deliveryDays || null;
    } else {
      payload.package_basic_title = form.get("basic_title") as string;
      payload.package_basic_description = form.get("basic_description") as string;
      payload.package_basic_price = parseInt(form.get("basic_price") as string);
      payload.package_basic_delivery = parseInt(form.get("basic_delivery") as string);
      payload.package_basic_revisions = parseInt(form.get("basic_revisions") as string) || 0;
      payload.package_standard_title = form.get("standard_title") as string;
      payload.package_standard_description = form.get("standard_description") as string;
      payload.package_standard_price = parseInt(form.get("standard_price") as string);
      payload.package_standard_delivery = parseInt(form.get("standard_delivery") as string);
      payload.package_standard_revisions = parseInt(form.get("standard_revisions") as string) || 0;
      payload.package_premium_title = form.get("premium_title") as string;
      payload.package_premium_description = form.get("premium_description") as string;
      payload.package_premium_price = parseInt(form.get("premium_price") as string);
      payload.package_premium_delivery = parseInt(form.get("premium_delivery") as string);
      payload.package_premium_revisions = parseInt(form.get("premium_revisions") as string) || 0;
    }

    const { error } = await sb.from("gigs").insert(payload);
    setSaving(false);
    if (error) { alert("Error: " + error.message); return; }
    router.push("/dashboard/gigs");
    router.refresh();
  };

  const addTag = () => {
    const trimmed = tagsInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed]);
      setTagsInput("");
    }
  };

  const addDeliverable = () => setDeliverables(prev => [...prev, ""]);
  const removeDeliverable = (i: number) => setDeliverables(prev => prev.filter((_, idx) => idx !== i));
  const updateDeliverable = (i: number, val: string) => setDeliverables(prev => prev.map((d, idx) => idx === i ? val : d));

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <button type="button" onClick={() => router.back()}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold">Create a Gig</h1>
        <p className="mt-1 text-sm text-muted-foreground">Showcase your service to potential clients</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Basic Info */}
        <Card>
          <CardContent className="space-y-4 p-6">
            <h2 className="font-semibold">Basic Info</h2>

            <div className="space-y-2">
              <Label>Subcategory *</Label>
              <div ref={catRef} className="relative">
                <button type="button" onClick={() => setCatOpen(!catOpen)}
                  className="flex h-10 w-full items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm shadow-sm transition-colors hover:bg-accent">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <span className={cn("flex-1 text-left", !selectedCategoryId && "text-muted-foreground")}>
                    {selectedCategoryId ? categories.find(c => c.id === selectedCategoryId)?.name : "Select a subcategory"}
                  </span>
                  <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", catOpen && "rotate-180")} />
                </button>
                {catOpen && (
                  <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-xl border bg-popover p-1.5 shadow-lg">
                    <div className="max-h-60 overflow-y-auto scrollbar-hide">
                      {categories.map((c) => (
                        <button key={c.id} type="button"
                          onClick={() => { setSelectedCategoryId(c.id); setCatOpen(false); }}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                            selectedCategoryId === c.id && "bg-accent font-semibold"
                          )}>
                          {c.icon && <CategoryIcon name={c.icon} className="h-4 w-4 text-muted-foreground" />}
                          {c.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {parentVocab && (
                <p className="text-xs text-muted-foreground mt-1">
                  <Info className="inline h-3 w-3 mr-1" />
                  Category: <span className="font-medium">{parentVocab.label}</span> — {parentVocab.desc}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Gig Title *</Label>
              <Input id="title" name="title" placeholder="I will design a professional logo for your brand" required maxLength={80} />
              <p className="text-xs text-muted-foreground">Keep it clear and specific. Max 80 characters.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <Textarea id="description" name="description" rows={8}
                placeholder="Describe your service in detail — what you offer, your process, and what makes you stand out..." required />
            </div>
          </CardContent>
        </Card>

        {/* Deliverables */}
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">What You'll Deliver *</h2>
              <span className="text-xs text-muted-foreground">{deliverables.filter(d => d.trim()).length} items</span>
            </div>
            <p className="text-xs text-muted-foreground -mt-2">List exactly what the buyer will receive. Add clear, specific bullet points.</p>
            <div className="space-y-2">
              {deliverables.map((d, i) => (
                <div key={i} className="flex items-start gap-2">
                  <GripVertical className="mt-2.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <Input
                    value={d}
                    onChange={(e) => updateDeliverable(i, e.target.value)}
                    placeholder="e.g., 5 custom logo concepts with unlimited revisions"
                    className="flex-1"
                  />
                  {deliverables.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" className="mt-0.5 h-8 w-8 shrink-0" onClick={() => removeDeliverable(i)}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addDeliverable}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add deliverable
            </Button>
          </CardContent>
        </Card>

        {/* Tip — shown in expert tips on category page */}
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex items-start gap-2">
              <div className="flex-1 space-y-2">
                <Label htmlFor="tip">Expert Tip for Buyers *</Label>
                <Textarea id="tip" name="tip" rows={2}
                  placeholder="e.g., When hiring for a logo, always ask for vector formats (AI, EPS, SVG) so you can scale your logo without losing quality."
                  required className="text-sm" />
                <p className="text-xs text-muted-foreground">
                  <Info className="inline h-3 w-3 mr-1" />
                  This tip will appear in the &quot;Tips from Top Freelancers&quot; section on the subcategory page. Help buyers make informed decisions.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Category-specific fields */}
        {categoryFields.length > 0 && (
          <Card>
            <CardContent className="space-y-5 p-6">
              <h2 className="font-semibold">{parentVocab?.label} Details</h2>
              {categoryFields.map((field) => (
                <div key={field.key} className="space-y-2">
                  <Label>{field.label}</Label>
                  {field.multiple ? (
                    <div className="flex flex-wrap gap-1.5">
                      {field.options.map((opt) => {
                        const selected = (fieldValues[field.key] ?? []).includes(opt);
                        return (
                          <Badge key={opt} variant={selected ? "default" : "outline"}
                            className="cursor-pointer text-xs" onClick={() => {
                              const current = fieldValues[field.key] ?? [];
                              setFieldValues(prev => ({
                                ...prev,
                                [field.key]: current.includes(opt)
                                  ? current.filter(i => i !== opt)
                                  : [...current, opt],
                              }));
                            }}>
                            {opt}
                          </Badge>
                        );
                      })}
                    </div>
                  ) : (
                    <select value={(fieldValues[field.key] ?? [])[0] || ""}
                      onChange={(e) => setFieldValues(prev => ({ ...prev, [field.key]: e.target.value ? [e.target.value] : [] }))}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <option value="">Select {field.label}</option>
                      {field.options.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Gallery */}
        <Card>
          <CardContent className="space-y-4 p-6">
            <h2 className="font-semibold">Gallery (up to 8 files)</h2>
            <p className="text-xs text-muted-foreground -mt-2">Showcase your work with images and videos.</p>
            <div className="grid grid-cols-4 gap-2">
              {images.map((file, i) => (
                <div key={i} className="group relative flex items-center justify-center overflow-hidden rounded-lg bg-muted" style={{ aspectRatio: "auto", minHeight: 120 }}>
                  {file.type.startsWith("video/") ? (
                    <video src={URL.createObjectURL(file)} className="max-h-full max-w-full object-contain" />
                  ) : (
                    <img src={URL.createObjectURL(file)} alt="" className="max-h-full max-w-full object-contain" />
                  )}
                  <button type="button" onClick={() => removeImage(i)}
                    className="absolute right-1 top-1 hidden rounded-full bg-black/60 p-1 text-white group-hover:block">
                    <X className="h-3 w-3" />
                  </button>
                  {file.type.startsWith("video/") && (
                    <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">Video</span>
                  )}
                </div>
              ))}
              {images.length < 8 && (
                <label className="flex aspect-square cursor-pointer items-center justify-center rounded-lg border border-dashed text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary">
                  <Upload className="h-5 w-5" />
                  <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleImageAdd} />
                </label>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Pricing */}
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Pricing</h2>
              <div className="flex items-center gap-2 text-sm">
                <span className={cn(pricingModel === "fixed" ? "text-foreground font-medium" : "text-muted-foreground")}>Fixed</span>
                <Switch checked={pricingModel === "package"} onCheckedChange={(v) => setPricingModel(v ? "package" : "fixed")} />
                <span className={cn(pricingModel === "package" ? "text-foreground font-medium" : "text-muted-foreground")}>Packages</span>
              </div>
            </div>

            {pricingModel === "fixed" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="price">Price (₹) *</Label>
                  <Input id="price" name="price" type="number" min="1" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="delivery_days">Delivery (days)</Label>
                  <Input id="delivery_days" name="delivery_days" type="number" min="1" />
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {["basic", "standard", "premium"].map((tier) => (
                  <div key={tier} className="rounded-lg border p-4">
                    <h3 className="mb-3 text-sm font-semibold capitalize">{tier}</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2 sm:col-span-2">
                        <Label>{tier === "basic" ? "Basic" : tier === "standard" ? "Standard" : "Premium"} Title *</Label>
                        <Input name={`${tier}_title`} placeholder={tier === "basic" ? "Basic logo design" : tier === "standard" ? "Standard logo design" : "Premium logo design"} required />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label>Description *</Label>
                        <Textarea name={`${tier}_description`} rows={2} placeholder="What's included in this package" required />
                      </div>
                      <div className="space-y-2">
                        <Label>Price (₹) *</Label>
                        <Input name={`${tier}_price`} type="number" min="1" required />
                      </div>
                      <div className="space-y-2">
                        <Label>Delivery (days) *</Label>
                        <Input name={`${tier}_delivery`} type="number" min="1" required />
                      </div>
                      <div className="space-y-2">
                        <Label>Revisions</Label>
                        <Input name={`${tier}_revisions`} type="number" min="0" defaultValue="0" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Requirements & Tags */}
        <Card>
          <CardContent className="space-y-4 p-6">
            <h2 className="font-semibold">Requirements & Tags</h2>
            <div className="space-y-2">
              <Label htmlFor="requirements">What do you need from the buyer?</Label>
              <Textarea id="requirements" name="requirements" rows={3} placeholder="E.g., Provide your logo brief, brand colors, preferred style references..." />
            </div>
            <div className="space-y-2">
              <Label>Tags</Label>
              <div className="flex gap-2">
                <Input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="Add a tag and press +" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }} />
                <Button type="button" variant="outline" size="icon" onClick={addTag}><Plus className="h-4 w-4" /></Button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {tags.map((t) => (
                    <Badge key={t} variant="secondary" className="text-xs">
                      {t}
                      <button type="button" onClick={() => setTags((prev) => prev.filter((x) => x !== t))} className="ml-1 hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={saving || uploading}>
            {(saving || uploading) && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {saving ? "Creating..." : uploading ? "Uploading images..." : "Create Gig"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}
