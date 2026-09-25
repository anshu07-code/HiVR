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
import { Loader2, Upload, X, Plus, GripVertical, ArrowLeft, Info } from "lucide-react";
import Link from "next/link";
import { cn, rupeesToPaise } from "@/lib/utils";

// Category vocab — same as create gig form
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

export default function EditGigPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const sb = createClient();
  const [gig, setGig] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [images, setImages] = React.useState<{ file?: File; url: string }[]>([]);
  const [pricingModel, setPricingModel] = React.useState<"fixed" | "package">("fixed");
  const [tags, setTags] = React.useState<string[]>([]);
  const [tagsInput, setTagsInput] = React.useState("");
  const [deliverables, setDeliverables] = React.useState<string[]>([""]);
  const [metadata, setMetadata] = React.useState<any>({});
  const [fieldValues, setFieldValues] = React.useState<Record<string, string[]>>({});

  React.useEffect(() => {
    (async () => {
      const { data } = await sb.from("gigs").select("*, skill_categories!inner(id, parent_category_id)").eq("id", params.id).single();
      if (data) {
        setGig(data);
        setPricingModel(data.pricing_model);
        setTags((data.tags ?? []) as string[]);
        setImages((data.images as string[] ?? []).map((url: string) => ({ url })));
        const meta = data.metadata || {};
        setMetadata(meta);
        // Pre-populate category-specific fields from metadata
        const parentSlug = meta.category_parent_slug;
        const vocab = parentSlug ? PARENT_VOCAB[parentSlug] : null;
        if (vocab) {
          const initial: Record<string, string[]> = {};
          for (const f of vocab.fields) {
            const val = meta[f.key];
            if (val) initial[f.key] = Array.isArray(val) ? val : [val];
          }
          setFieldValues(initial);
        }
      }
      if (data?.deliverables?.length) {
        setDeliverables(data.deliverables);
      }
      setLoading(false);
    })();
  }, [params.id]);

  const handleImageAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setImages((prev) => [...prev, ...files.map(f => ({ file: f, url: URL.createObjectURL(f) }))].slice(0, 8));
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    const form = new FormData(e.currentTarget);

    const filteredDeliverables = deliverables.filter(d => d.trim().length > 0);
    if (filteredDeliverables.length === 0) {
      alert("Please add at least one deliverable.");
      setSaving(false);
      return;
    }

    const finalUrls: string[] = [];
    for (const img of images) {
      if (img.file) {
        const ext = img.file.name.split(".").pop();
        const path = `${crypto.randomUUID()}.${ext}`;
        const { error } = await sb.storage.from("gig_images").upload(path, img.file);
        if (error) { console.error("upload error", error); continue; }
        const { data: urlData } = sb.storage.from("gig_images").getPublicUrl(path);
        finalUrls.push(urlData.publicUrl);
      } else {
        finalUrls.push(img.url);
      }
    }

    const updatedMetadata = { ...metadata };

    const parentSlug = updatedMetadata.category_parent_slug;
    const vocab = parentSlug ? PARENT_VOCAB[parentSlug] : null;
    if (vocab) {
      for (const f of vocab.fields) {
        if (fieldValues[f.key]?.length) updatedMetadata[f.key] = fieldValues[f.key];
      }
    }

    const payload: any = {
      title: form.get("title"),
      description: form.get("description"),
      pricing_model: pricingModel,
      images: finalUrls,
      deliverables: filteredDeliverables,
      tip: form.get("tip") || null,
      metadata: updatedMetadata,
      requirements: form.get("requirements") || null,
      tags: tags.length > 0 ? tags : null,
    };

    if (pricingModel === "fixed") {
      payload.price = rupeesToPaise(parseInt(form.get("price") as string));
      payload.delivery_days = parseInt(form.get("delivery_days") as string) || null;
      payload.package_basic_title = null;
      payload.package_standard_title = null;
      payload.package_premium_title = null;
    } else {
      ["basic", "standard", "premium"].forEach((tier) => {
        payload[`package_${tier}_title`] = form.get(`${tier}_title`);
        payload[`package_${tier}_description`] = form.get(`${tier}_description`);
        payload[`package_${tier}_price`] = rupeesToPaise(parseInt(form.get(`${tier}_price`) as string));
        payload[`package_${tier}_delivery`] = parseInt(form.get(`${tier}_delivery`) as string);
        payload[`package_${tier}_revisions`] = parseInt(form.get(`${tier}_revisions`) as string) || 0;
      });
      payload.price = null;
      payload.delivery_days = null;
    }

    const { error } = await sb.from("gigs").update(payload).eq("id", params.id);
    setSaving(false);
    if (error) { alert("Error: " + error.message); return; }
    router.push("/dashboard/gigs");
    router.refresh();
  };

  const addTag = () => {
    const trimmed = tagsInput.trim();
    if (trimmed && !tags.includes(trimmed)) { setTags((prev) => [...prev, trimmed]); setTagsInput(""); }
  };

  const addDeliverable = () => setDeliverables(prev => [...prev, ""]);
  const removeDeliverable = (i: number) => setDeliverables(prev => prev.filter((_, idx) => idx !== i));
  const updateDeliverable = (i: number, val: string) => setDeliverables(prev => prev.map((d, idx) => idx === i ? val : d));

  const parentVocab = metadata.category_parent_slug ? PARENT_VOCAB[metadata.category_parent_slug] : null;
  const categoryFields = parentVocab?.fields ?? [];

  if (loading) return <div className="flex items-center justify-center p-20"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!gig) return <div className="p-10 text-center text-muted-foreground">Gig not found</div>;

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <div className="mb-6 flex items-center gap-3">
        <Button asChild variant="ghost" size="sm"><Link href="/dashboard/gigs"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <div>
          <h1 className="font-display text-2xl font-bold">Edit Gig</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <Card>
          <CardContent className="space-y-4 p-6">
            <h2 className="font-semibold">Basic Info</h2>
            <div className="space-y-2">
              <Label htmlFor="title">Gig Title *</Label>
              <Input id="title" name="title" defaultValue={gig.title} required maxLength={80} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <Textarea id="description" name="description" rows={8} defaultValue={gig.description} required />
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
            <div className="space-y-2">
              {deliverables.map((d, i) => (
                <div key={i} className="flex items-start gap-2">
                  <GripVertical className="mt-2.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <Input value={d} onChange={(e) => updateDeliverable(i, e.target.value)}
                    placeholder="e.g., 5 custom logo concepts with unlimited revisions" className="flex-1" />
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

        {/* Tip */}
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="space-y-2">
              <Label htmlFor="tip">Expert Tip for Buyers</Label>
              <Textarea id="tip" name="tip" rows={2} defaultValue={gig.tip ?? ""}
                placeholder="e.g., When hiring for a logo, always ask for vector formats (AI, EPS, SVG)." className="text-sm" />
              <p className="text-xs text-muted-foreground">
                <Info className="inline h-3 w-3 mr-1" />
                This tip appears in the &quot;Tips from Top Freelancers&quot; section on the subcategory page.
              </p>
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

        <Card>
          <CardContent className="space-y-4 p-6">
            <h2 className="font-semibold">Gallery (up to 8 images)</h2>
            <div className="grid grid-cols-4 gap-2">
              {images.map((img, i) => (
                <div key={i} className="group relative aspect-square overflow-hidden rounded-lg bg-muted">
                  <img src={img.url} alt="" className="h-full w-full object-cover" />
                  <button type="button" onClick={() => removeImage(i)}
                    className="absolute right-1 top-1 hidden rounded-full bg-black/60 p-1 text-white group-hover:block">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {images.length < 8 && (
                <label className="flex aspect-square cursor-pointer items-center justify-center rounded-lg border border-dashed text-muted-foreground hover:border-primary/50 hover:text-primary">
                  <Upload className="h-5 w-5" />
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageAdd} />
                </label>
              )}
            </div>
          </CardContent>
        </Card>

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
                  <Input id="price" name="price" type="number" min="1" defaultValue={Math.round((gig.price ?? 0) / 100) || ""} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="delivery_days">Delivery (days)</Label>
                  <Input id="delivery_days" name="delivery_days" type="number" min="1" defaultValue={gig.delivery_days ?? ""} />
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {["basic", "standard", "premium"].map((tier) => (
                  <div key={tier} className="rounded-lg border p-4">
                    <h3 className="mb-3 text-sm font-semibold capitalize">{tier}</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2 sm:col-span-2">
                        <Label>Title *</Label>
                        <Input name={`${tier}_title`} defaultValue={gig[`package_${tier}_title`] ?? ""} required />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label>Description *</Label>
                        <Textarea name={`${tier}_description`} rows={2} defaultValue={gig[`package_${tier}_description`] ?? ""} required />
                      </div>
                      <div className="space-y-2">
                        <Label>Price (₹) *</Label>
                        <Input name={`${tier}_price`} type="number" min="1" defaultValue={Math.round((gig[`package_${tier}_price`] ?? 0) / 100) || ""} required />
                      </div>
                      <div className="space-y-2">
                        <Label>Delivery (days) *</Label>
                        <Input name={`${tier}_delivery`} type="number" min="1" defaultValue={gig[`package_${tier}_delivery`] ?? ""} required />
                      </div>
                      <div className="space-y-2">
                        <Label>Revisions</Label>
                        <Input name={`${tier}_revisions`} type="number" min="0" defaultValue={gig[`package_${tier}_revisions`] ?? 0} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-6">
            <h2 className="font-semibold">Requirements & Tags</h2>
            <div className="space-y-2">
              <Label htmlFor="requirements">What do you need from the buyer?</Label>
              <Textarea id="requirements" name="requirements" rows={3} defaultValue={gig.requirements ?? ""} />
            </div>
            <div className="space-y-2">
              <Label>Tags</Label>
              <div className="flex gap-2">
                <Input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="Add a tag" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }} />
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
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {saving ? "Saving..." : "Save Changes"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}
