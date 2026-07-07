"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ShareButton } from "@/app/(public)/browse/[id]/share-button";
import { formatPaise } from "@/lib/utils";
import { EditGigDialog } from "@/components/gigs/edit-gig-dialog";
import {
  Star, Clock, CheckCircle, MessageSquare,
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Heart, Flag, Briefcase, MapPin, Shield, Award,
  Loader2, X, Send, User, Search, ArrowUpDown, ThumbsUp, Edit3, Trash2,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

type GigData = {
  id: string;
  employee_id: string;
  category_id: string;
  title: string;
  slug: string;
  description: string;
  pricing_model: "fixed" | "package";
  price: number | null;
  delivery_days: number | null;
  package_basic_title: string | null;
  package_basic_description: string | null;
  package_basic_price: number | null;
  package_basic_delivery: number | null;
  package_basic_revisions: number | null;
  package_standard_title: string | null;
  package_standard_description: string | null;
  package_standard_price: number | null;
  package_standard_delivery: number | null;
  package_standard_revisions: number | null;
  package_premium_title: string | null;
  package_premium_description: string | null;
  package_premium_price: number | null;
  package_premium_delivery: number | null;
  package_premium_revisions: number | null;
  images: string[];
  deliverables: string[];
  tip: string | null;
  requirements: string | null;
  faq: { question: string; answer: string }[];
  tags: string[];
  metadata: any;
  status: string;
  created_at: string;
};

type Review = {
  id: string;
  gig_id: string | null;
  rating: number;
  comment: string | null;
  communication_rating: number | null;
  quality_rating: number | null;
  value_rating: number | null;
  worksample_url: string | null;
  reviewer_id: string;
  created_at: string;
  reviewer: { full_name: string; avatar_url: string | null; location?: string | null };
  contract_id: string;
  contract_price?: number;
  contract_delivery?: number;
};

export default function GigDetailPage() {
  const params = useParams();
  const router = useRouter();
  const sb = createClient();
  const [gig, setGig] = React.useState<GigData | null>(null);
  const [cat, setCat] = React.useState<any>(null);
  const [employee, setEmployee] = React.useState<any>(null);
  const [currentUser, setCurrentUser] = React.useState<any>(null);
  const [userMode, setUserMode] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [selectedImage, setSelectedImage] = React.useState(0);
  const [expandedFaq, setExpandedFaq] = React.useState<number | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [selectedPackage, setSelectedPackage] = React.useState(1);
  const [contactOpen, setContactOpen] = React.useState(false);
  const [contactMsg, setContactMsg] = React.useState("");
  const [contactSending, setContactSending] = React.useState(false);
  const [hireOpen, setHireOpen] = React.useState(false);
  const [hireSending, setHireSending] = React.useState(false);
  const [hireError, setHireError] = React.useState("");
  const [hireAction, setHireAction] = React.useState<"confirm" | "propose" | "direct" | "negotiate" | "success" | "error">("confirm");
  const [hireRequirements, setHireRequirements] = React.useState("");
  const [proposedPrice, setProposedPrice] = React.useState<number>(0);
  const [proposedDays, setProposedDays] = React.useState<string>("");
  const [negotiationResult, setNegotiationResult] = React.useState<any>(null);
  const [toastMsg, setToastMsg] = React.useState<string | null>(null);
  const [otherGigs, setOtherGigs] = React.useState<any[]>([]);
  const [similarGigs, setSimilarGigs] = React.useState<any[]>([]);
  const [reviews, setReviews] = React.useState<Review[]>([]);
  const [filterRating, setFilterRating] = React.useState<number | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [sortBy, setSortBy] = React.useState<"recent" | "highest" | "lowest">("recent");
  const [onlyWithFiles, setOnlyWithFiles] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [reportOpen, setReportOpen] = React.useState(false);
  const [reportReason, setReportReason] = React.useState("");
  const [reportDesc, setReportDesc] = React.useState("");
  const [reportSending, setReportSending] = React.useState(false);
  const [reportDone, setReportDone] = React.useState(false);
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const [reviewRating, setReviewRating] = React.useState(0);
  const [reviewComment, setReviewComment] = React.useState("");
  const [reviewSending, setReviewSending] = React.useState(false);
  const [completedContract, setCompletedContract] = React.useState<any>(null);
  const [contractCount, setContractCount] = React.useState(0);
  const [savedCount, setSavedCount] = React.useState(0);
  const [showPill, setShowPill] = React.useState(false);
  const pillObserver = React.useRef<IntersectionObserver | null>(null);

  const sentinelCallbackRef = React.useCallback((node: HTMLDivElement | null) => {
    if (pillObserver.current) {
      pillObserver.current.disconnect();
      pillObserver.current = null;
    }
    if (!node) return;
    setShowPill(false);
    pillObserver.current = new IntersectionObserver(
      ([entry]) => setShowPill(!entry.isIntersecting),
      { threshold: 0, rootMargin: "0px 0px -50px 0px" }
    );
    pillObserver.current.observe(node);
  }, []);

  React.useEffect(() => {
    const slug = params.slug as string;
    const savedKey = `gig_saved_${slug}`;
    setSaved(localStorage.getItem(savedKey) === "true");
  }, [params.slug]);

  React.useEffect(() => {
    (async () => {
      const slug = params.slug as string;
      const { data: gRaw } = await sb
        .from("gigs")
        .select("*")
        .eq("slug", slug)
        .eq("status", "active")
        .single();
      if (!gRaw) { setLoading(false); return; }
      const g = gRaw as any;
      setGig(g as GigData);
      setSavedCount(g.saved_count ?? 0);

      // Fallback: if saved_count column missing or 0, try counting from gig_likes
      if (g.saved_count === undefined || g.saved_count === 0) {
        try {
          const { count: likeCount } = await sb.from("gig_likes")
            .select("id", { count: "exact", head: true })
            .eq("gig_id", g.id) as any;
          if (likeCount !== null) setSavedCount(likeCount);
        } catch {}
      }

      const { data: { user } } = await sb.auth.getUser();
      if (user) {
        const { data: uRaw } = await sb.from("users").select("id, full_name, avatar_url, current_mode, roles").eq("id", user.id).single();
        const u = uRaw as any;
        setCurrentUser(u);
        setUserMode(u?.current_mode || "employee");

        // Check if user has saved this gig
        try {
          const { data: like } = await sb.from("gig_likes")
            .select("id")
            .eq("gig_id", g.id)
            .eq("user_id", user.id)
            .maybeSingle();
          if (like) setSaved(true);
        } catch (_) { /* gig_likes table may not exist yet */ }

        // Check if user has a completed contract for this gig (via gig_id)
        try {
          const { data: contracts } = await sb
            .from("contracts")
            .select("id")
            .eq("gig_id", g.id)
            .eq("buyer_id", user.id)
            .eq("status", "approved")
            .maybeSingle();
          if (contracts) {
            setCompletedContract(contracts);
            const { data: existingReview } = await sb
              .from("reviews")
              .select("id")
              .eq("contract_id", contracts.id)
              .maybeSingle();
            if (!existingReview) setReviewOpen(true);
          }
        } catch (_) { /* gig_id column may not exist yet */ }
      }

      const [catRes, empRes] = await Promise.all([
        sb.from("skill_categories")
          .select("slug, name, parent_category_id, parent:parent_category_id(slug, name)")
          .eq("id", g.category_id).single(),
        sb.from("users")
          .select("id, full_name, avatar_url, last_active, profile:employee_profiles(avg_rating, total_reviews, overall_trust_tier, headline, location, response_time_avg_minutes, completion_rate, languages, availability_status, bio, availability_hours)")
          .eq("id", g.employee_id).single(),
      ]) as [{ data: any; error: any }, { data: any; error: any }];
      if (catRes.data) setCat(catRes.data);
      if (empRes.data) setEmployee(empRes.data);

      // Other gigs by same employee
      const { data: others } = await sb
        .from("gigs")
        .select("id, title, slug, images, price, delivery_days, pricing_model, package_basic_price")
        .eq("employee_id", g.employee_id)
        .neq("id", g.id)
        .eq("status", "active")
        .limit(4);
      setOtherGigs(others ?? []);

      // Similar gigs (same category)
      const { data: sims } = await sb
        .from("gigs")
        .select("id, title, slug, images, price, delivery_days, pricing_model, package_basic_price, employee_id, employee:users(full_name, avatar_url, last_active)")
        .eq("category_id", g.category_id)
        .neq("id", g.id)
        .eq("status", "active")
        .limit(4);
      setSimilarGigs(sims ?? []);

      // Reviews for this gig (by gig_id, fallback to employee if column missing)
      try {
        const { data: revs } = await sb
          .from("reviews")
          .select("id, gig_id, rating, comment, communication_rating, quality_rating, value_rating, worksample_url, reviewer_id, created_at, contract_id")
          .eq("gig_id", g.id)
          .order("created_at", { ascending: false })
          .limit(50) as any;
        const rawRevs = (revs ?? []) as any[];
        if (rawRevs.length > 0) {
          const reviewerIds = [...new Set(rawRevs.map((r: any) => r.reviewer_id))];
          const contractIds = [...new Set(rawRevs.map((r: any) => r.contract_id))];
          const [reviewersRes, contractsRes] = await Promise.all([
            sb.from("users").select("id, full_name, avatar_url, last_active").in("id", reviewerIds),
            sb.from("contracts").select("id, agreed_price").in("id", contractIds),
          ]);
          const reviewerMap = new Map((reviewersRes.data ?? []).map((u: any) => [u.id, u]));
          const contractMap = new Map((contractsRes.data ?? []).map((c: any) => [c.id, c]));
          setReviews(rawRevs.map((r: any) => ({
            ...r,
            reviewer: reviewerMap.get(r.reviewer_id) || { full_name: "Anonymous", avatar_url: null },
            contract_price: contractMap.get(r.contract_id)?.agreed_price,
          })));
        }
      } catch (_) {
        // gig_id column may not exist yet — fallback to employee reviews
        const { data: revs } = await sb
          .from("reviews")
          .select("id, rating, comment, communication_rating, quality_rating, value_rating, worksample_url, reviewer_id, created_at, contract_id")
          .eq("reviewee_id", g.employee_id)
          .order("created_at", { ascending: false })
          .limit(50) as any;
        const rawRevs = (revs ?? []) as any[];
        if (rawRevs.length > 0) {
          const reviewerIds = [...new Set(rawRevs.map((r: any) => r.reviewer_id))];
          const contractIds = [...new Set(rawRevs.map((r: any) => r.contract_id))];
          const [reviewersRes, contractsRes] = await Promise.all([
            sb.from("users").select("id, full_name, avatar_url, last_active").in("id", reviewerIds),
            sb.from("contracts").select("id, agreed_price").in("id", contractIds),
          ]);
          const reviewerMap = new Map((reviewersRes.data ?? []).map((u: any) => [u.id, u]));
          const contractMap = new Map((contractsRes.data ?? []).map((c: any) => [c.id, c]));
          setReviews(rawRevs.map((r: any) => ({
            ...r,
            gig_id: null,
            reviewer: reviewerMap.get(r.reviewer_id) || { full_name: "Anonymous", avatar_url: null },
            contract_price: contractMap.get(r.contract_id)?.agreed_price,
          })));
        }
      }

      // Count of contracts for this gig
      try {
        const { count } = await sb
          .from("contracts")
          .select("id", { count: "exact", head: true })
          .eq("gig_id", g.id);
        setContractCount(count ?? 0);
      } catch (_) { /* gig_id column may not exist yet */ }

      setLoading(false);
    })();
  }, [params.slug]);

  // Live availability_status subscription
  React.useEffect(() => {
    if (!gig?.employee_id) return;
    const sb = createClient();
    const channel = sb
      .channel("gig-employee-status")
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "employee_profiles", filter: `user_id=eq.${gig.employee_id}` },
        (payload) => {
          const updated = payload.new as any;
          setEmployee((prev: any) => {
            if (!prev) return prev;
            return {
              ...prev,
              profile: {
                ...prev.profile,
                availability_status: updated.availability_status,
              },
            };
          });
        })
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [gig?.employee_id]);

  // Live saved_count subscription
  React.useEffect(() => {
    if (!gig?.id) return;
    const sb = createClient();
    const channel = sb
      .channel("gig-saved-count")
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "gigs", filter: `id=eq.${gig.id}` },
        (payload) => {
          const updated = payload.new as any;
          if (typeof updated.saved_count === "number") {
            setSavedCount(updated.saved_count);
          }
        })
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [gig?.id]);

  const handleSave = async () => {
    const slug = params.slug as string;
    const savedKey = `gig_saved_${slug}`;
    const newVal = !saved;
    setSaved(newVal);
    setSavedCount(prev => newVal ? prev + 1 : Math.max(0, prev - 1));
    localStorage.setItem(savedKey, String(newVal));
    if (gig) {
      try {
        const res = await fetch("/api/gigs/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gig_id: gig.id, save: newVal }),
        });
        if (res.ok) {
          const data = await res.json();
          setSavedCount(data.saved_count);
        }
      } catch {}
    }
  };

  const sendMessage = async () => {
    if (!contactMsg.trim() || !currentUser || !employee) return;
    setContactSending(true);
    try {
      await sb.from("direct_messages").insert({
        sender_id: currentUser.id,
        receiver_id: employee.id,
        body: contactMsg.trim(),
      } as any);
      await sb.rpc("create_notification", {
        p_user_id: employee.id,
        p_type: "new_message",
        p_title: "New message from " + (currentUser.full_name || "a buyer"),
        p_body: contactMsg.trim().slice(0, 120),
        p_link: "/dashboard/messages",
      } as any);
      setContactMsg("");
      setContactOpen(false);
    } catch (err: any) {
      alert("Failed to send: " + (err.message || "unknown error"));
    }
    setContactSending(false);
  };

  const handleReport = async () => {
    if (!reportReason.trim() || !gig) return;
    setReportSending(true);
    try {
      const res = await fetch("/api/gigs/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gig_id: gig.id,
          reason: reportReason,
          description: reportDesc,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to submit report");
      }
      setReportDone(true);
    } catch (err: any) {
      alert("Error: " + err.message);
    }
    setReportSending(false);
  };

  const handleReviewSubmit = async () => {
    if (!reviewRating || !completedContract || !currentUser || !gig || !employee) return;
    setReviewSending(true);
    try {
      const { error } = await sb.from("reviews").insert({
        contract_id: completedContract.id,
        gig_id: gig.id,
        reviewer_id: currentUser.id,
        reviewee_id: employee.id,
        rating: reviewRating,
        comment: reviewComment.trim() || null,
        communication_rating: reviewRating,
        quality_rating: reviewRating,
        value_rating: reviewRating,
      } as any);
      if (error) throw error;
    } catch (err: any) {
      // Retry without gig_id (column may not exist yet)
      const { error } = await sb.from("reviews").insert({
        contract_id: completedContract.id,
        reviewer_id: currentUser.id,
        reviewee_id: employee.id,
        rating: reviewRating,
        comment: reviewComment.trim() || null,
        communication_rating: reviewRating,
        quality_rating: reviewRating,
        value_rating: reviewRating,
      } as any);
      if (error) { alert("Error: " + error.message); setReviewSending(false); return; }
    }
    setReviewSending(false);
    setReviewOpen(false);
    // Reload reviews
    try {
      const { data: revs } = await sb
        .from("reviews")
        .select("id, gig_id, rating, comment, communication_rating, quality_rating, value_rating, worksample_url, reviewer_id, created_at, contract_id")
        .eq("gig_id", gig.id)
        .order("created_at", { ascending: false })
        .limit(50) as any;
      const rawRevs = (revs ?? []) as any[];
      if (rawRevs.length > 0) {
        const reviewerIds = [...new Set(rawRevs.map((r: any) => r.reviewer_id))];
        const contractIds = [...new Set(rawRevs.map((r: any) => r.contract_id))];
        const [reviewersRes, contractsRes] = await Promise.all([
          sb.from("users").select("id, full_name, avatar_url, last_active").in("id", reviewerIds),
          sb.from("contracts").select("id, agreed_price").in("id", contractIds),
        ]);
        const reviewerMap = new Map((reviewersRes.data ?? []).map((u: any) => [u.id, u]));
        const contractMap = new Map((contractsRes.data ?? []).map((c: any) => [c.id, c]));
        setReviews(rawRevs.map((r: any) => ({
          ...r,
          reviewer: reviewerMap.get(r.reviewer_id) || { full_name: "Anonymous", avatar_url: null },
          contract_price: contractMap.get(r.contract_id)?.agreed_price,
        })));
      }
    } catch (_) {
      // fallback: reload page
      window.location.reload();
    }
  };

  const handleDeleteGig = async () => {
    if (!gig) return;
    if (!confirm("Delete this gig? This action cannot be undone.")) return;
    try {
      const res = await fetch(`/api/gigs/${gig.id}`, { method: "DELETE" });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed to delete"); }
      router.push("/dashboard/gigs");
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  const handleHire = async (action: "direct" | "negotiate") => {
    if (!currentUser || !gig || !employee) return;

    setHireSending(true);
    setHireError("");

    const basePrice = gig.pricing_model === "package"
      ? (selectedPackage === 0 ? gig.package_basic_price : selectedPackage === 1 ? gig.package_standard_price : gig.package_premium_price)
      : gig.price;
    const price = action === "negotiate" && proposedPrice > 0 ? proposedPrice : basePrice;

    if (action === "negotiate" && (price > basePrice || price < Math.round(basePrice * 0.8))) {
      setHireError(`Price must be between ${formatPaise(Math.round(basePrice * 0.8))} and ${formatPaise(basePrice)}`);
      setHireSending(false);
      return;
    }

    try {
      const res = await fetch("/api/gigs/negotiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gig_id: gig.id,
          employee_id: employee.id,
          action,
          proposed_price: price,
          requirements: hireRequirements,
          expected_days: proposedDays ? Number(proposedDays) : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `Failed to ${action === "direct" ? "send offer" : "start negotiation"}`);
      }
      const data = await res.json();
      setNegotiationResult(data);
      setHireAction("success");
      if (action === "direct") {
        setToastMsg(`Offer sent to ${employee?.full_name?.split(" ")[0] || "the freelancer"}! They'll review it on Job Offers.`);
      } else {
        setToastMsg("Negotiation started! Check Job Offers for updates.");
      }
    } catch (err: any) {
      setHireError(err.message);
      setHireAction("error");
    }
    setHireSending(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[80vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Loading gig...</p>
      </div>
    </div>
  );
  if (!gig) return (
    <div className="flex items-center justify-center min-h-[80vh]">
      <div className="text-center">
        <Briefcase className="mx-auto h-12 w-12 text-muted-foreground/40" />
        <p className="mt-3 text-muted-foreground">Gig not found</p>
        <Button asChild variant="outline" className="mt-4"><Link href="/">Go home</Link></Button>
      </div>
    </div>
  );

  const images = (gig.images ?? []) as string[];
  const tags = (gig.tags ?? []) as string[];
  const deliverables = (gig.deliverables ?? []) as string[];
  const isPackage = gig.pricing_model === "package";
  const faqs = (gig.faq ?? []) as { question: string; answer: string }[];
  const packages = isPackage ? ["basic", "standard", "premium"] : [];
  const isBuyer = userMode === "buyer";
  const responseTime = employee?.profile?.response_time_avg_minutes
    ? `${Math.round(employee.profile.response_time_avg_minutes)} min`
    : "~1 hr";

  const getPackagePrice = (idx: number) => {
    const tier = packages[idx];
    return gig[`package_${tier}_price` as keyof GigData] as number | null;
  };

  // Review distribution
  const ratingCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  reviews.forEach(r => { if (r.rating >= 1 && r.rating <= 5) ratingCounts[r.rating as keyof typeof ratingCounts]++; });
  const totalReviews = reviews.length;
  const avgRating = totalReviews > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / totalReviews : 0;

  // Average sub-ratings
  const commAvg = totalReviews > 0 ? reviews.reduce((s, r) => s + (r.communication_rating ?? r.rating), 0) / totalReviews : 0;
  const qualAvg = totalReviews > 0 ? reviews.reduce((s, r) => s + (r.quality_rating ?? r.rating), 0) / totalReviews : 0;
  const valAvg = totalReviews > 0 ? reviews.reduce((s, r) => s + (r.value_rating ?? r.rating), 0) / totalReviews : 0;

  const filteredReviews = reviews.filter(r => {
    if (filterRating !== null) {
      if (filterRating === 0) { if (r.rating >= 3) return false; }
      else if (r.rating !== filterRating) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!(r.comment ?? "").toLowerCase().includes(q) && !(r.reviewer?.full_name ?? "").toLowerCase().includes(q)) return false;
    }
    if (onlyWithFiles && !r.worksample_url) return false;
    return true;
  });
  filteredReviews.sort((a, b) => {
    if (sortBy === "highest") return b.rating - a.rating;
    if (sortBy === "lowest") return a.rating - b.rating;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <div className="min-h-screen bg-background">
      {/* BREADCRUMB */}
      <div className="border-b bg-card/30">
        <div className="container flex items-center gap-2 py-2.5 text-[13px] text-muted-foreground overflow-x-auto whitespace-nowrap">
          <Link href="/categories" className="hover:text-foreground transition-colors shrink-0">Categories</Link>
          <ChevronRight className="h-3 w-3 shrink-0" />
          {cat?.parent && (
            <>
              <Link href={`/categories/${cat.parent.slug}`} className="hover:text-foreground transition-colors capitalize shrink-0">{cat.parent.name}</Link>
              <ChevronRight className="h-3 w-3 shrink-0" />
            </>
          )}
          {cat && (
            <>
              <Link href={`/categories/${cat.slug}`} className="hover:text-foreground transition-colors shrink-0">{cat.name}</Link>
              <ChevronRight className="h-3 w-3 shrink-0" />
            </>
          )}
          <span className="text-foreground truncate max-w-[300px]">{gig.title}</span>
        </div>
      </div>



      <div className="container py-6 md:py-8">
        <div className="grid gap-8 xl:grid-cols-3">

          {/* LEFT COLUMN */}
          <div className="xl:col-span-2 space-y-8">

            {/* Title + Seller info */}
            <div>
              <h1 className="font-display text-2xl font-bold leading-tight md:text-3xl">{gig.title}</h1>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                {employee && (
                  <Link href={`/people/${employee.id}`} className="flex items-center gap-2 group">
                    <div className="h-9 w-9 overflow-hidden rounded-full bg-muted ring-2 ring-border group-hover:ring-primary/40 transition-all">
                      {employee.avatar_url ? (
                        <img src={`${employee.avatar_url}?v=${employee.last_active ?? ''}`} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center bg-primary/10 text-sm font-medium text-primary">
                          {employee.full_name?.charAt(0)?.toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div>
                      <span className="text-sm font-semibold group-hover:text-primary transition-colors">{employee.full_name}</span>
                      <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                        {employee.profile?.overall_trust_tier === "top_rated" && (
                          <span className="flex items-center gap-0.5 text-yellow-600 dark:text-yellow-400"><Award className="h-3 w-3" />Top Rated</span>
                        )}
                        {employee.profile?.overall_trust_tier === "verified" && (
                          <span className="flex items-center gap-0.5 text-blue-500"><Shield className="h-3 w-3" />Verified</span>
                        )}
                      </div>
                    </div>
                  </Link>
                )}

                {totalReviews > 0 && (
                  <div className="flex items-center gap-1.5">
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star key={s} className={cn("h-3.5 w-3.5", s <= Math.round(avgRating) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/20")} />
                      ))}
                    </div>
                    <span className="text-sm font-semibold">{avgRating.toFixed(1)}</span>
                    <span className="text-xs text-muted-foreground">({totalReviews})</span>
                  </div>
                )}

                {cat && (
                  <Badge variant="secondary" className="text-[11px] gap-1">
                    <Briefcase className="h-3 w-3" />{cat.name}
                  </Badge>
                )}

              </div>
            </div>

            {/* Image Gallery */}
            {images.length > 0 && (
              <div className="space-y-2">
                <div className="relative flex items-center justify-center overflow-hidden rounded-xl bg-muted group aspect-video">
                  <img src={images[selectedImage]} alt="" className="h-full w-full object-contain p-2 transition-transform duration-300" />
                  {images.length > 1 && (
                    <>
                      <button onClick={() => setSelectedImage((p) => (p - 1 + images.length) % images.length)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 grid h-10 w-10 place-items-center rounded-full bg-white/90 text-foreground shadow-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-white backdrop-blur-sm">
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      <button onClick={() => setSelectedImage((p) => (p + 1) % images.length)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 grid h-10 w-10 place-items-center rounded-full bg-white/90 text-foreground shadow-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-white backdrop-blur-sm">
                        <ChevronRight className="h-5 w-5" />
                      </button>
                      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                        {images.map((_, i) => (
                          <button key={i} onClick={() => setSelectedImage(i)}
                            className={cn("h-2 w-2 rounded-full transition-all", i === selectedImage ? "bg-white w-4" : "bg-white/50 hover:bg-white/80")} />
                        ))}
                      </div>
                    </>
                  )}
                </div>
                {images.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {images.map((src, i) => (
                      <button key={i} onClick={() => setSelectedImage(i)}
                        className={cn("shrink-0 overflow-hidden rounded-lg border-2 transition-all",
                          i === selectedImage ? "border-primary ring-1 ring-primary/30" : "border-transparent opacity-60 hover:opacity-100")}>
                        <img src={src} alt="" className="h-14 w-20 object-cover bg-muted/50" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Description */}
            <div>
              <h2 className="font-display text-xl font-semibold mb-3">About this gig</h2>
              <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {gig.description}
              </div>
            </div>

            {/* Category-specific fields from metadata */}
            {gig.metadata && Object.keys(gig.metadata).filter(k => !["category_parent_slug"].includes(k)).length > 0 && (
              <div>
                <h2 className="font-display text-xl font-semibold mb-3">Expertise & technologies</h2>
                <div className="space-y-3">
                  {Object.entries(gig.metadata).map(([key, vals]) => {
                    if (key === "category_parent_slug" || !Array.isArray(vals) || vals.length === 0) return null;
                    const label = key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
                    return (
                      <div key={key}>
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">{label}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {(vals as string[]).map((v: string) => (
                            <Badge key={v} variant="outline" className="text-xs px-2.5 py-1 border-muted-foreground/20 bg-muted/30">{v}</Badge>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tags fallback (if metadata not present) */}
            {(!gig.metadata || Object.keys(gig.metadata).filter(k => k !== "category_parent_slug").length === 0) && tags.length > 0 && (
              <div>
                <h2 className="font-display text-xl font-semibold mb-3">Expertise & technologies</h2>
                <div className="flex flex-wrap gap-2">
                  {tags.map((t: string) => (
                    <Badge key={t} variant="outline" className="text-xs px-3 py-1.5 border-muted-foreground/20 bg-muted/30">{t}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Requirements */}
            {gig.requirements && (
              <div>
                <h2 className="font-display text-xl font-semibold mb-3">What you need to provide</h2>
                <div className="rounded-lg border bg-card/50 p-4 text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                  {gig.requirements}
                </div>
              </div>
            )}

            {/* About the seller */}
            <div ref={sentinelCallbackRef} />
            {employee && (
              <div className="rounded-xl border bg-gradient-to-br from-card to-muted/30 p-6">
                <h2 className="font-display text-xl font-semibold mb-4">About the seller</h2>
                <div className="flex items-start gap-4">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-muted ring-2 ring-border">
                    {employee.avatar_url ? (
                      <img src={`${employee.avatar_url}?v=${employee.last_active ?? ''}`} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-primary/10 text-xl font-medium text-primary">
                        {employee.full_name?.charAt(0)?.toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2 flex-1">
                    <div>
                      <p className="font-semibold text-base">{employee.full_name}</p>
                      {employee.profile?.headline && (
                        <p className="text-sm text-muted-foreground">{employee.profile.headline}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                      {employee.profile?.avg_rating ? (
                        <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />{Number(employee.profile.avg_rating).toFixed(1)} ({employee.profile.total_reviews || 0})</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">No reviews yet</span>
                      )}
                      {employee.profile?.location && (
                        <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{employee.profile.location}</span>
                      )}
                      {employee.profile?.languages && employee.profile.languages.length > 0 && (
                        <span className="flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" />{employee.profile.languages.join(", ")}</span>
                      )}
                      {employee.profile?.availability_hours && (
                        <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{employee.profile.availability_hours} hrs/week</span>
                      )}
                      <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />Avg. response: {responseTime}</span>
                    </div>
                    {employee.profile?.bio && (
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{employee.profile.bio}</p>
                    )}
                    <Button variant="outline" size="sm" asChild className="mt-1">
                      <Link href={`/people/${employee.id}`}><User className="mr-1.5 h-3.5 w-3.5" />View full profile</Link>
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* FAQ */}
            {faqs.length > 0 && (
              <div>
                <h2 className="font-display text-xl font-semibold mb-3">Frequently asked questions</h2>
                <div className="space-y-2">
                  {faqs.map((faq: any, i: number) => (
                    <div key={i} className="rounded-lg border overflow-hidden transition-all">
                      <button onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                        className="flex w-full items-center justify-between px-4 py-3.5 text-left text-sm font-medium hover:bg-muted/30 transition-colors">
                        <span>{faq.question}</span>
                        {expandedFaq === i ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
                      </button>
                      {expandedFaq === i && (
                        <div className="px-4 pb-3.5 text-sm text-muted-foreground leading-relaxed border-t pt-3">{faq.answer}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reviews with Rating Breakdown — Fiverr-style */}
            <div>
              <h2 className="font-display text-xl font-semibold mb-5">
                {totalReviews > 0 ? `${totalReviews} reviews for this Gig` : "Reviews"}
              </h2>

              {totalReviews > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-8 mb-6">
                  {/* Left: Overall rating + breakdown */}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-4xl font-bold">{avgRating.toFixed(1)}</span>
                      <div>
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star key={s} className={cn("h-4 w-4", s <= Math.round(avgRating) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/20")} />
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Star distribution bars */}
                    <div className="mt-4 space-y-1.5">
                      {[5, 4, 3, 0].map((r) => {
                        const count = r === 0 ? ratingCounts[1] + ratingCounts[2] : ratingCounts[r as keyof typeof ratingCounts];
                        const pct = totalReviews > 0 ? Math.round((count / totalReviews) * 100) : 0;
                        const label = r === 5 ? "5 Stars" : r === 4 ? "4 Stars" : r === 3 ? "3 Stars" : "<3 Stars";
                        return (
                          <button key={r} onClick={() => setFilterRating(filterRating === r ? null : r)}
                            className={cn(
                              "flex items-center gap-2 w-full group text-xs",
                              filterRating === r ? "font-semibold" : ""
                            )}>
                            <span className="w-14 text-right shrink-0 text-muted-foreground group-hover:text-foreground transition-colors">{label}</span>
                            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                              <div className={cn("h-full rounded-full transition-all", filterRating === r ? "bg-foreground" : "bg-yellow-400")} style={{ width: `${pct}%` }} />
                            </div>
                            <span className="w-6 text-left shrink-0 text-muted-foreground">({count})</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Sub-ratings */}
                    <div className="mt-5 space-y-2 border-t pt-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Rating Breakdown</p>
                      {[
                        { label: "Seller communication level", val: commAvg },
                        { label: "Quality of delivery", val: qualAvg },
                        { label: "Value of delivery", val: valAvg },
                      ].map((item) => (
                        <div key={item.label} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{item.label}</span>
                          <span className="font-semibold flex items-center gap-1">
                            {item.val.toFixed(1)}
                            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right: Search + Sort + Reviews */}
                  <div>
                    {/* Search + Sort bar */}
                    <div className="flex items-center gap-2 mb-4">
                      <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search reviews"
                          className="w-full h-9 rounded-md border border-input bg-background pl-8 pr-3 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                      </div>
                      <div className="relative">
                        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}
                          className="h-9 rounded-md border border-input bg-background pl-2.5 pr-7 text-xs appearance-none ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <option value="recent">Most Recent</option>
                          <option value="highest">Highest Rated</option>
                          <option value="lowest">Lowest Rated</option>
                        </select>
                        <ArrowUpDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none text-muted-foreground" />
                      </div>
                    </div>

                    {/* Only show reviews with files */}
                    <label className="flex items-center gap-2 mb-4 cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors">
                      <input type="checkbox" checked={onlyWithFiles} onChange={(e) => setOnlyWithFiles(e.target.checked)}
                        className="rounded border-muted-foreground/30" />
                      Only show reviews with files ({reviews.filter(r => r.worksample_url).length})
                    </label>

                    {/* Reviews list */}
                    {filteredReviews.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-8 text-center">
                        <MessageSquare className="mx-auto h-8 w-8 text-muted-foreground/30" />
                        <p className="mt-2 text-sm text-muted-foreground">No reviews match your filters</p>
                      </div>
                    ) : (
                      <div className="space-y-5">
                        {filteredReviews.map((rev) => (
                          <div key={rev.id} className="border-b pb-5 last:border-0">
                            {/* Reviewer header */}
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-2.5">
                                <div className="h-9 w-9 overflow-hidden rounded-full bg-muted shrink-0">
                                  {rev.reviewer?.avatar_url ? (
                                    <img src={`${rev.reviewer.avatar_url}?v=${(rev.reviewer as any)?.last_active ?? ''}`} alt="" className="h-full w-full object-cover" />
                                  ) : (
                                    <div className="flex h-full items-center justify-center bg-primary/10 text-xs font-medium text-primary">
                                      {rev.reviewer?.full_name?.charAt(0)?.toUpperCase() || "?"}
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-sm font-semibold">{rev.reviewer?.full_name || "Anonymous"}</span>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 font-medium border border-emerald-200 dark:border-emerald-800/30">Repeat Client</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                                    <div className="flex items-center gap-0.5">
                                      {[1, 2, 3, 4, 5].map((s) => (
                                        <Star key={s} className={cn("h-3 w-3", s <= rev.rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/20")} />
                                      ))}
                                    </div>
                                    <span>{new Date(rev.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Review text */}
                            {rev.comment && (
                              <p className="text-sm text-muted-foreground leading-relaxed mb-2">{rev.comment}</p>
                            )}

                            {/* Price + Duration */}
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-2">
                              <span className="font-medium text-foreground">{formatPaise(rev.contract_price)}</span>
                              <span className="text-muted-foreground/40">·</span>
                              <span>{rev.contract_delivery ? `${rev.contract_delivery} day${rev.contract_delivery > 1 ? "s" : ""}` : "Duration"}</span>
                            </div>

                            {/* Worksample image */}
                            {rev.worksample_url && (
                              <div className="mb-2">
                                <img src={rev.worksample_url} alt="Work sample" className="rounded-lg border max-h-40 object-cover" />
                              </div>
                            )}

                            {/* Helpful */}
                            <button className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                              <ThumbsUp className="h-3.5 w-3.5" />
                              Helpful?
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {totalReviews === 0 && (
                <div className="rounded-lg border border-dashed p-8 text-center">
                  <MessageSquare className="mx-auto h-8 w-8 text-muted-foreground/30" />
                  <p className="mt-2 text-sm text-muted-foreground">No reviews yet for this gig</p>
                  {contractCount > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">{contractCount} purchase{contractCount > 1 ? "s" : ""}</p>
                  )}
                </div>
              )}

              {currentUser && totalReviews === 0 && (
                <p className="mt-3 text-xs text-muted-foreground text-center">Only buyers who completed a contract for this gig can leave a review.</p>
              )}
            </div>

            <div className="xl:hidden h-4" />
          </div>

          {/* RIGHT COLUMN — Sticky Sidebar */}
          <div className="xl:col-span-1">
            <div className="xl:sticky xl:top-24 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto xl:scrollbar-hide space-y-4">

              {/* Action buttons */}
              <div className="flex items-center gap-3">
                <button onClick={handleSave} className={cn("flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg hover:bg-muted transition-colors", saved && "text-red-500")}>
                  <Heart className={cn("h-4 w-4", saved && "fill-red-500")} />
                  <span className="text-muted-foreground">{savedCount}</span>
                </button>
                <ShareButton url={`/gigs/${gig.slug}`} title={gig.title} />
                <button onClick={() => { setReportOpen(true); setReportDone(false); setReportReason(""); setReportDesc(""); }}
                  className="flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg hover:bg-muted transition-colors text-muted-foreground">
                  <Flag className="h-3.5 w-3.5" />Report
                </button>
                {currentUser?.id === gig.employee_id && (
                  <>
                    <button onClick={() => setEditOpen(true)}
                      className="flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg hover:bg-muted transition-colors text-amber-600">
                      <Edit3 className="h-3.5 w-3.5" />Edit
                    </button>
                    <button onClick={handleDeleteGig}
                      className="flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg hover:bg-muted transition-colors text-red-500">
                      <Trash2 className="h-3.5 w-3.5" />Delete
                    </button>
                  </>
                )}
              </div>

              {/* Pricing Card */}
              <Card className="overflow-hidden border shadow-sm">
                <CardContent className="p-0">
                  {isPackage ? (
                    <div className="divide-y">
                      {packages.map((tier, idx) => {
                        const title = gig[`package_${tier}_title` as keyof GigData] as string | null;
                        const price = gig[`package_${tier}_price` as keyof GigData] as number | null;
                        const delivery = gig[`package_${tier}_delivery` as keyof GigData] as number | null;
                        const desc = gig[`package_${tier}_description` as keyof GigData] as string | null;
                        const revisions = gig[`package_${tier}_revisions` as keyof GigData] as number | null;
                        if (!title) return null;
                        return (
                          <div key={tier} onClick={() => setSelectedPackage(idx)}
                            className={cn("p-4 transition-all cursor-pointer border-l-2",
                              selectedPackage === idx ? "bg-primary/5 border-l-primary" : "border-l-transparent hover:bg-muted/20")}>
                            <div className="flex items-center justify-between mb-1">
                              <span className={cn("text-sm font-semibold capitalize", selectedPackage === idx && "text-primary")}>{title}</span>
                              <span className="text-base font-bold">{formatPaise(price)}</span>
                            </div>
                            {desc && <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>}
                            <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{delivery} days</span>
                              {Number(revisions) > 0 && (
                                <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3" />{String(revisions)} revision{Number(revisions) !== 1 ? "s" : ""}</span>
                              )}
                            </div>
                            {selectedPackage === idx && deliverables.length > 0 && (
                              <div className="mt-3 border-t border-border/50 pt-3">
                                <p className="text-xs font-medium text-foreground mb-2">What you'll get</p>
                                <ul className="space-y-1.5">
                                  {deliverables.map((d, i) => (
                                    <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                                      <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                                      <span>{d}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-5 text-center">
                      <p className="text-xs text-muted-foreground">Starting at</p>
                      <p className="text-3xl font-bold mt-1">{formatPaise(gig.price)}</p>
                      {gig.delivery_days && (
                        <p className="mt-1.5 text-xs text-muted-foreground flex items-center justify-center gap-1">
                          <Clock className="h-3.5 w-3.5" />{gig.delivery_days} day delivery
                        </p>
                      )}
                      {deliverables.length > 0 && (
                        <div className="mt-4 border-t border-border/50 pt-4 text-left">
                          <p className="text-xs font-medium text-foreground mb-2">What you'll get</p>
                          <ul className="space-y-1.5">
                            {deliverables.map((d, i) => (
                              <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                                <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                                <span>{d}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {currentUser ? (
                <Button className="w-full" size="lg" onClick={() => setContactOpen(true)}>
                  <MessageSquare className="mr-2 h-4 w-4" />Contact Me
                </Button>
              ) : (
                <Button asChild className="w-full" size="lg">
                  <Link href="/auth/signup">
                    Join HiVR
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              )}
              <div className="flex items-center justify-between text-[11px] text-muted-foreground -mt-1 px-1">
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Avg. response: {responseTime}</span>
                {contractCount > 0 && (
                  <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" />{contractCount} purchase{contractCount > 1 ? "s" : ""}</span>
                )}
              </div>

              {/* Hire (buyer mode only) */}
              {isBuyer && (
                <Button size="lg" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg"
                  onClick={() => { setHireOpen(true); setHireRequirements(""); setHireAction("confirm"); setHireError(""); }}>
                  <Briefcase className="mr-2 h-4 w-4" />Hire now
                </Button>
              )}

            </div>
          </div>
        </div>

        {/* More from this employee */}
        {otherGigs.length > 0 && (
          <div className="mt-8">
            <h2 className="font-display text-xl font-semibold mb-4">More from {employee?.full_name || "this seller"}</h2>
            <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
              {otherGigs.map((og: any) => {
                const img = (og.images ?? [])[0];
                const price = og.pricing_model === "package" ? og.package_basic_price : og.price;
                return (
                  <Link key={og.id} href={`/gigs/${og.slug}`} className="group block">
                    <div className="aspect-[4/3] overflow-hidden rounded-lg bg-muted mb-2">
                      {img ? <img src={img} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" /> : (
                        <div className="flex h-full items-center justify-center text-muted-foreground/20"><Briefcase className="h-8 w-8" /></div>
                      )}
                    </div>
                    <p className="text-xs font-medium line-clamp-2 leading-snug group-hover:text-primary transition-colors">{og.title}</p>
                    <p className="text-xs font-semibold mt-1">From {formatPaise(price)}</p>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Similar gigs */}
        {similarGigs.length > 0 && (
          <div className="mt-8">
            <h2 className="font-display text-xl font-semibold mb-4">Similar services</h2>
            <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
              {similarGigs.map((sg: any) => {
                const img = (sg.images ?? [])[0];
                const price = sg.pricing_model === "package" ? sg.package_basic_price : sg.price;
                return (
                  <Link key={sg.id} href={`/gigs/${sg.slug}`} className="group block">
                    <div className="aspect-[4/3] overflow-hidden rounded-lg bg-muted mb-2">
                      {img ? <img src={img} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" /> : (
                        <div className="flex h-full items-center justify-center text-muted-foreground/20"><Briefcase className="h-8 w-8" /></div>
                      )}
                    </div>
                    <p className="text-xs font-medium line-clamp-2 leading-snug group-hover:text-primary transition-colors">{sg.title}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <div className="h-4 w-4 overflow-hidden rounded-full bg-muted">
                        {sg.employee?.avatar_url ? <img src={`${sg.employee.avatar_url}?v=${sg.employee?.last_active ?? ''}`} alt="" className="h-full w-full object-cover" /> : (
                          <div className="flex h-full items-center justify-center bg-primary/10 text-[8px] font-medium text-primary">{sg.employee?.full_name?.charAt(0) || "?"}</div>
                        )}
                      </div>
                      <span className="text-[11px] text-muted-foreground truncate">{sg.employee?.full_name}</span>
                    </div>
                    <p className="text-xs font-semibold mt-1">From {formatPaise(price)}</p>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* CONTACT MODAL */}
      {contactOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setContactOpen(false)}>
          <div className="w-full sm:max-w-lg bg-background rounded-t-2xl sm:rounded-2xl shadow-2xl border animate-in slide-in-from-bottom-4 fade-in duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 overflow-hidden rounded-full bg-muted ring-1 ring-border">
                  {employee?.avatar_url ? <img src={`${employee.avatar_url}?v=${employee?.last_active ?? ''}`} alt="" className="h-full w-full object-cover" /> : (
                    <div className="flex h-full items-center justify-center bg-primary/10 text-xs font-medium text-primary">{employee?.full_name?.charAt(0)?.toUpperCase()}</div>
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold">Message {employee?.full_name}</p>
                  <p className="text-[11px] text-muted-foreground"><Clock className="inline h-3 w-3 mr-0.5" />Typically responds in {responseTime}</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setContactOpen(false)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="p-4">
              <div className="rounded-lg bg-muted/30 p-3 mb-3 text-xs text-muted-foreground border">
                <p className="font-medium text-foreground mb-1">About {gig.title}</p>
                <p className="line-clamp-2">{gig.description}</p>
              </div>
              <div className="flex gap-2">
                <Textarea value={contactMsg} onChange={(e) => setContactMsg(e.target.value)}
                  placeholder="Write your message..." rows={3} className="resize-none text-sm"
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 p-4 pt-0 border-t">
              <Button variant="outline" size="sm" onClick={() => setContactOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={sendMessage} disabled={!contactMsg.trim() || contactSending}>
                {contactSending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                Send
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* REPORT MODAL */}
      {reportOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setReportOpen(false)}>
          <div className="w-full sm:max-w-lg bg-background rounded-t-2xl sm:rounded-2xl shadow-2xl border animate-in slide-in-from-bottom-4 fade-in duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-display text-lg font-semibold flex items-center gap-2">
                <Flag className="h-4 w-4" />Report this gig
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setReportOpen(false)}><X className="h-4 w-4" /></Button>
            </div>
            {reportDone ? (
              <div className="p-8 text-center space-y-3">
                <div className="mx-auto h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                  <CheckCircle className="h-7 w-7 text-emerald-600" />
                </div>
                <h3 className="font-display text-base font-semibold">Report submitted</h3>
                <p className="text-sm text-muted-foreground">Thank you for helping us keep the marketplace safe. Our team will review this gig.</p>
                <Button variant="outline" size="sm" onClick={() => setReportOpen(false)}>Close</Button>
              </div>
            ) : (
              <div className="p-4 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Reason *</label>
                  <select value={reportReason} onChange={(e) => setReportReason(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <option value="">Select a reason</option>
                    <option value="spam">Spam or misleading</option>
                    <option value="offensive">Offensive or inappropriate</option>
                    <option value="scam">Scam or fraud</option>
                    <option value="duplicate">Duplicate gig</option>
                    <option value="wrong_category">Wrong category</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Description</label>
                  <Textarea value={reportDesc} onChange={(e) => setReportDesc(e.target.value)}
                    placeholder="Provide additional details..." rows={3} className="text-sm" />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setReportOpen(false)}>Cancel</Button>
                  <Button className="flex-1" onClick={handleReport} disabled={!reportReason || reportSending}>
                    {reportSending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Flag className="h-4 w-4 mr-1" />}
                    {reportSending ? "Submitting..." : "Submit Report"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* REVIEW MODAL */}
      {reviewOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setReviewOpen(false)}>
          <div className="w-full sm:max-w-lg bg-background rounded-t-2xl sm:rounded-2xl shadow-2xl border animate-in slide-in-from-bottom-4 fade-in duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-display text-lg font-semibold">Review this gig</h2>
              <Button variant="ghost" size="sm" onClick={() => setReviewOpen(false)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-sm text-muted-foreground">How was your experience with this gig?</p>

              <div className="space-y-2">
                <label className="text-sm font-medium">Rating *</label>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button key={s} type="button" onClick={() => setReviewRating(s)}>
                      <Star className={cn("h-8 w-8 transition-all", s <= reviewRating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/20 hover:text-yellow-400/50")} />
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Comment</label>
                <Textarea value={reviewComment} onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="Share your experience..." rows={3} className="text-sm" />
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setReviewOpen(false)}>Skip</Button>
                <Button className="flex-1" onClick={handleReviewSubmit} disabled={!reviewRating || reviewSending}>
                  {reviewSending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                  {reviewSending ? "Submitting..." : "Submit Review"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HIRE MODAL */}
      {hireOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setHireOpen(false)}>
          <div className="w-full sm:max-w-lg bg-background rounded-t-2xl sm:rounded-2xl shadow-2xl border animate-in slide-in-from-bottom-4 fade-in duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h2 className="font-display text-lg font-semibold">Hire {employee?.full_name?.split(" ")[0]}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{gig.title}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setHireOpen(false)}><X className="h-4 w-4" /></Button>
            </div>

            {hireAction === "confirm" && (
              <>
                <div className="p-4 space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">What do you need done?</label>
                    <Textarea
                      value={hireRequirements}
                      onChange={(e) => setHireRequirements(e.target.value)}
                      placeholder="Describe your project requirements in detail — scope, deliverables, timeline, any specific instructions..."
                      rows={4}
                      className="text-sm resize-none"
                    />
                    <p className="text-xs text-muted-foreground">Be specific so the freelancer knows exactly what you need.</p>
                  </div>

                  <div className="rounded-lg border bg-card/50 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground">Service price</span>
                      <span className="text-lg font-bold">{formatPaise(isPackage ? getPackagePrice(selectedPackage) : gig.price)}</span>
                    </div>
                    <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30 p-2.5 flex items-start gap-2">
                      <Shield className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-amber-700 dark:text-amber-300">Payment held in escrow — released only when you approve the work.</p>
                    </div>
                  </div>

                  {hireError && (
                    <div className="rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 p-3 text-xs text-red-600">{hireError}</div>
                  )}

                  <div className="space-y-2">
                    <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" size="lg"
                      onClick={() => handleHire("direct")} disabled={hireSending}>
                      {hireSending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Briefcase className="h-4 w-4 mr-2" />}
                      Hire Directly — {formatPaise(isPackage ? getPackagePrice(selectedPackage) : gig.price)}
                    </Button>
                    <Button variant="outline" className="w-full" size="lg"
                      onClick={() => {
                        const p = Number(isPackage ? getPackagePrice(selectedPackage) : gig.price);
                        setProposedPrice(p);
                        setHireAction("propose");
                      }} disabled={hireSending}>
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Start Negotiation
                    </Button>
                  </div>
                  <p className="text-center text-[11px] text-muted-foreground">The freelancer will review your request and respond.</p>
                </div>
              </>
            )}

            {hireAction === "propose" && (
              <div className="p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" className="h-7 px-1" onClick={() => setHireAction("confirm")}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm font-medium">Propose your terms</span>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">What do you need done?</label>
                  <Textarea
                    value={hireRequirements}
                    onChange={(e) => setHireRequirements(e.target.value)}
                    placeholder="Describe your project requirements in detail..."
                    rows={3}
                    className="text-sm resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">Your proposed price (₹)</label>
                    <Input
                      type="number"
                      min={1}
                      value={proposedPrice}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const val = Number(e.target.value);
                        const listed = Number(isPackage ? getPackagePrice(selectedPackage) : gig.price);
                        const minVal = Math.round(listed * 0.8);
                        setProposedPrice(Math.min(val, listed));
                      }}
                      onWheel={(e) => (e.target as HTMLInputElement).blur()}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Listed: {formatPaise(isPackage ? getPackagePrice(selectedPackage) : gig.price)} · Range: {formatPaise(Math.round((isPackage ? Number(getPackagePrice(selectedPackage)) : Number(gig.price)) * 0.8))} – {formatPaise(isPackage ? getPackagePrice(selectedPackage) : gig.price)}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">Expected delivery (days)</label>
                    <Input
                      type="number"
                      min={1}
                      placeholder="e.g. 7"
                      value={proposedDays}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProposedDays(e.target.value)}
                      onWheel={(e) => (e.target as HTMLInputElement).blur()}
                    />
                  </div>
                </div>

                {hireError && (
                  <div className="rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 p-3 text-xs text-red-600">{hireError}</div>
                )}

                <Button className="w-full" size="lg"
                  onClick={() => handleHire("negotiate")} disabled={hireSending}>
                  {hireSending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                  Send Negotiation Offer — {formatPaise(proposedPrice)}
                </Button>
              </div>
            )}

            {hireAction === "success" && (
              <div className="p-8 text-center space-y-3">
                <div className="mx-auto h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                  <CheckCircle className="h-8 w-8 text-emerald-600" />
                </div>
                <h3 className="font-display text-lg font-semibold">{negotiationResult?.action === "direct" ? "Offer sent!" : "Negotiation started!"}</h3>
                <p className="text-sm text-muted-foreground">{toastMsg || "Check your dashboard for updates."}</p>
                <div className="flex items-center justify-center gap-2 pt-1">
                  <Button asChild size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    <Link href="/dashboard/job-offers">Go to Job Offers</Link>
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setHireOpen(false)}>Close</Button>
                </div>
              </div>
            )}

            {hireAction === "error" && (
              <div className="p-8 text-center space-y-3">
                <div className="mx-auto h-16 w-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <X className="h-8 w-8 text-red-600" />
                </div>
                <h3 className="font-display text-lg font-semibold">Something went wrong</h3>
                <p className="text-sm text-muted-foreground">{hireError || "Please try again later."}</p>
                <Button onClick={() => setHireAction("confirm")} variant="outline">Try again</Button>
              </div>
             )}
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATION */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-[100] animate-in slide-in-from-bottom-4 fade-in duration-300">
          <div className="flex items-center gap-3 rounded-xl border bg-emerald-50 dark:bg-emerald-950/30 shadow-2xl px-5 py-3.5 backdrop-blur-md">
            <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0" />
            <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">{toastMsg}</p>
            <button onClick={() => setToastMsg(null)} className="ml-2 text-emerald-500 hover:text-emerald-700"><X className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      {/* STICKY PILL CAPSULE — visible only when About the seller scrolls past */}
      {showPill && (
        <div className="fixed bottom-4 left-4 right-4 md:left-6 md:right-auto z-[90] md:max-w-sm animate-in slide-in-from-bottom-4 fade-in duration-300">
          <div className="flex items-center gap-3 rounded-full border bg-background/95 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.12)] px-3 py-2">
            {/* Avatar + Name + Status */}
            {employee && (
              <Link href={`/people/${employee.id}`} className="flex items-center gap-2 shrink-0 group">
                <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-muted ring-2 ring-border group-hover:ring-primary/40 transition-all">
                  {employee.avatar_url ? (
                    <img src={`${employee.avatar_url}?v=${employee.last_active ?? ''}`} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-primary/10 text-xs font-medium text-primary">
                      {employee.full_name?.charAt(0)?.toUpperCase()}
                    </div>
                  )}
                  <span className={cn(
                    "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background",
                    employee.profile?.availability_status === "online" ? "bg-emerald-500" :
                    employee.profile?.availability_status === "offline" ? "bg-gray-500" :
                    employee.profile?.availability_status === "away" ? "bg-red-500" :
                    employee.profile?.availability_status === "busy" ? "bg-yellow-500" :
                    "bg-gray-400"
                  )} />
                </div>
                <div className="min-w-0 hidden sm:block">
                  <p className="text-xs font-semibold truncate leading-tight">{employee.full_name?.split(" ")[0]}</p>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <span className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      employee.profile?.availability_status === "online" ? "bg-emerald-500" :
                      employee.profile?.availability_status === "offline" ? "bg-gray-500" :
                      employee.profile?.availability_status === "away" ? "bg-red-500" :
                      employee.profile?.availability_status === "busy" ? "bg-yellow-500" :
                      "bg-gray-400"
                    )} />
                    {employee.profile?.availability_status === "online" ? "Online" :
                     employee.profile?.availability_status === "offline" ? "Offline" :
                     employee.profile?.availability_status === "away" ? "Away" :
                     employee.profile?.availability_status === "busy" ? "Busy" : "Offline"}
                  </p>
                </div>
              </Link>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground truncate">{gig.title}</p>
              <p className="text-sm font-bold">
                From {formatPaise(isPackage ? getPackagePrice(selectedPackage) : gig.price)}
              </p>
            </div>
            {isBuyer ? (
              <Button size="sm" className="shrink-0 rounded-full h-9 px-5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                onClick={() => { setHireOpen(true); setHireRequirements(""); setHireAction("confirm"); setHireError(""); }}>
                Continue
              </Button>
            ) : currentUser ? (
              <Button size="sm" variant="outline" className="shrink-0 rounded-full h-9 px-5"
                onClick={() => setContactOpen(true)}>
                Contact
              </Button>
            ) : (
              <Button asChild size="sm" variant="outline" className="shrink-0 rounded-full h-9 px-5">
                <Link href="/auth/signup">
                  Join HiVR
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Edit Gig Dialog */}
      <EditGigDialog gigId={gig?.id ?? ""} open={editOpen} onOpenChange={setEditOpen} onSaved={() => {}} />
    </div>
  );
}
