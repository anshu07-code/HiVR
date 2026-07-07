import * as React from "react";
import { Video as VideoIcon, Plus, Trash2, Loader2, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { VideoUploader } from "./video-uploader";
import { revalidatePath } from "next/cache";
import { DeleteVideoButton } from "./delete-video-button";
import { getPublicVideoUrl } from "@/lib/storage-public";

/**
 * Server component: reads `profile_videos` for the given user and
 * renders a responsive grid. If the viewer is the owner, an "Add
 * video" button opens a modal with the uploader.
 */

type ProfileVideo = {
  id: string;
  storage_bucket: string;
  storage_path: string;
  thumbnail_path: string | null;
  caption: string;
  skill_category_id: string | null;
  duration_seconds: number;
  is_public: boolean;
  created_at: string;
  skill: { name: string; slug: string; icon: string } | null;
};

type SkillCategory = { id: string; name: string };

export async function VideoGrid({
  userId,
  isOwner,
  categories,
  showAdd = true,
  showCallout = false,
}: {
  userId: string;
  isOwner: boolean;
  categories?: SkillCategory[];
  showAdd?: boolean;
  showCallout?: boolean;
}) {
  const sb = createClient();
  const { data: rows } = await sb
    .from("profile_videos")
    .select("id, storage_bucket, storage_path, thumbnail_path, caption, skill_category_id, duration_seconds, is_public, created_at, skill:skill_categories(name, slug, icon)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const videos = ((rows ?? []) as any[]).map((v) => ({
    ...v,
    skill: Array.isArray(v.skill) ? v.skill[0] ?? null : v.skill,
  })) as ProfileVideo[];

  if (videos.length === 0 && !isOwner) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <VideoIcon className="h-4 w-4" /> Showreel
          </CardTitle>
          <CardDescription>
            {videos.length > 0
              ? `${videos.length} video${videos.length === 1 ? "" : "s"} · click to play.`
              : "Show your skills in action."}
          </CardDescription>
        </div>
        {isOwner && showAdd && <AddVideoButton categories={categories ?? []} />}
      </CardHeader>
      <CardContent className="space-y-3">
        {showCallout && (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs text-primary">
            <Sparkles className="mr-1 inline h-3.5 w-3.5" />
            <strong>Show your skills in action</strong> — record a 60-second clip or upload one. Clients love seeing real work.
          </div>
        )}
        {videos.length === 0 ? (
          <p className="rounded-md border bg-muted/20 p-6 text-center text-xs text-muted-foreground">
            No videos yet{isOwner ? ". Click 'Add video' to record or upload one." : "."}
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 md:grid-cols-3">
            {videos.map((v) => {
              const url = getPublicVideoUrl(v.storage_bucket, v.storage_path);
              return (
                <div key={v.id} className="group overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md">
                  <div className="relative aspect-video w-full overflow-hidden bg-zinc-950">
                    <video
                      src={url}
                      controls
                      preload="metadata"
                      playsInline
                      className="h-full w-full object-cover"
                    />
                    {isOwner && (
                      <DeleteVideoButton videoId={v.id} storagePath={v.storage_path} className="absolute right-1.5 top-1.5" />
                    )}
                  </div>
                  <div className="space-y-1.5 p-3">
                    <p className="text-xs leading-relaxed text-foreground line-clamp-2">{v.caption}</p>
                    {v.skill?.name && (
                      <Badge variant="secondary" className="text-[10px] font-normal">{v.skill.name}</Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AddVideoButton({ categories }: { categories: SkillCategory[] }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="gradient">
          <Plus className="h-3.5 w-3.5" />Add video
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogTitle className="sr-only">Add a video</DialogTitle>
        <AddVideoForm categories={categories} />
      </DialogContent>
    </Dialog>
  );
}

// Client island that wraps the VideoUploader. We need a small client
// island to call revalidatePath() after a successful upload.
function AddVideoForm({ categories }: { categories: SkillCategory[] }) {
  return (
    <VideoUploader
      categories={categories}
      onClose={() => {
        // The dialog auto-closes on backdrop click; we also call
        // revalidate to refresh the grid.
        try { revalidatePath("/dashboard/profile"); } catch { /* ignore */ }
        // Force a soft refresh
        if (typeof window !== "undefined") window.location.reload();
      }}
      onUploaded={() => {
        try { revalidatePath("/dashboard/profile"); } catch { /* ignore */ }
        if (typeof window !== "undefined") window.location.reload();
      }}
    />
  );
}
