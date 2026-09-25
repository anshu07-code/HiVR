"use client";

import * as React from "react";
import { Video as VideoIcon, Plus, Loader2, Sparkles, Play, Pause, Volume2, VolumeX, Maximize } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { VideoUploader } from "./video-uploader";
import { DeleteVideoButton } from "./delete-video-button";
import { getPublicVideoUrl } from "@/lib/storage-public";

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

function PremiumVideoPlayer({ src, isOwner, videoId, storagePath }: { src: string; isOwner: boolean; videoId: string; storagePath: string }) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = React.useState(false);
  const [muted, setMuted] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [showControls, setShowControls] = React.useState(false);
  const controlsTimer = React.useRef<ReturnType<typeof setTimeout>>();

  React.useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    const onTime = () => setProgress(vid.currentTime / (vid.duration || 1));
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    vid.addEventListener("timeupdate", onTime);
    vid.addEventListener("play", onPlay);
    vid.addEventListener("pause", onPause);
    return () => {
      vid.removeEventListener("timeupdate", onTime);
      vid.removeEventListener("play", onPlay);
      vid.removeEventListener("pause", onPause);
    };
  }, []);

  const togglePlay = () => {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) { vid.play(); setPlaying(true); } else { vid.pause(); setPlaying(false); }
    showControlsTemporarily();
  };

  const showControlsTemporarily = () => {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setShowControls(false), 2500);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className="relative aspect-video w-full overflow-hidden bg-zinc-950 group"
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => { if (playing) { controlsTimer.current = setTimeout(() => setShowControls(false), 2000); } }}
    >
      <video
        ref={videoRef}
        src={src}
        preload="metadata"
        playsInline
        muted={muted}
        className="h-full w-full object-contain"
        onClick={togglePlay}
      />

      {/* Gradient overlay at bottom for controls */}
      <div className={`absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 to-transparent transition-opacity duration-300 ${showControls || !playing ? "opacity-100" : "opacity-0"}`} />

      {/* Center play button (shown when paused) */}
      <button
        onClick={togglePlay}
        className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex h-14 w-14 items-center justify-center rounded-full bg-white/20 backdrop-blur-md text-white shadow-2xl transition-all duration-200 hover:scale-110 hover:bg-white/30 ${playing ? "opacity-0 scale-75" : "opacity-100 scale-100"}`}
      >
        <Play className="h-6 w-6 ml-0.5" fill="white" />
      </button>

      {/* Bottom controls bar */}
      <div className={`absolute inset-x-0 bottom-0 flex items-center gap-2 px-3 pb-2 transition-opacity duration-300 ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        <button onClick={togglePlay} className="shrink-0 text-white/80 hover:text-white transition-colors">
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <div className="relative flex-1 h-1.5 rounded-full bg-white/20 cursor-pointer group" onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const pct = (e.clientX - rect.left) / rect.width;
          if (videoRef.current) { videoRef.current.currentTime = pct * videoRef.current.duration; setProgress(pct); }
        }}>
          <div className="h-full rounded-full bg-white/80 transition-all" style={{ width: `${progress * 100}%` }} />
        </div>
        <span className="shrink-0 text-[10px] text-white/60 font-mono min-w-[72px] text-right whitespace-nowrap">
          {videoRef.current ? `${formatTime(videoRef.current.currentTime)} / ${formatTime(videoRef.current.duration || 0)}` : "0:00 / 0:00"}
        </span>
        <button onClick={() => setMuted(!muted)} className="shrink-0 text-white/80 hover:text-white transition-colors">
          {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
        </button>
        <button onClick={() => videoRef.current?.requestFullscreen()} className="shrink-0 text-white/80 hover:text-white transition-colors">
          <Maximize className="h-3.5 w-3.5" />
        </button>
      </div>

      {isOwner && (
        <DeleteVideoButton videoId={videoId} storagePath={storagePath} className="absolute right-1.5 top-1.5 z-10" />
      )}
    </div>
  );
}

export function VideoGrid({
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
  const [videos, setVideos] = React.useState<ProfileVideo[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshKey, setRefreshKey] = React.useState(0);

  React.useEffect(() => {
    setLoading(true);
    fetch(`/api/profile/videos?userId=${userId}`)
      .then((r) => r.json())
      .then((data) => { setVideos(data.videos ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [userId, refreshKey]);

  if (videos.length === 0 && !isOwner) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <VideoIcon className="h-4 w-4" /> My Work
          </CardTitle>
          <CardDescription>
            {videos.length > 0
              ? `${videos.length} video${videos.length === 1 ? "" : "s"} · click to play.`
              : "Show your skills in action."}
          </CardDescription>
        </div>
        {isOwner && showAdd && <AddVideoButton categories={categories ?? []} onVideoAdded={() => setRefreshKey((k) => k + 1)} />}
      </CardHeader>
      <CardContent className="space-y-3">
        {showCallout && (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs text-primary">
            <Sparkles className="mr-1 inline h-3.5 w-3.5" />
            <strong>Show your skills in action</strong> — record a 60-second clip or upload one. Clients love seeing real work.
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : videos.length === 0 ? (
          <p className="rounded-md border bg-muted/20 p-6 text-center text-xs text-muted-foreground">
            No videos yet{isOwner ? ". Click 'Add video' to record or upload one." : "."}
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 md:grid-cols-3">
            {videos.map((v) => {
              const url = getPublicVideoUrl(v.storage_bucket, v.storage_path);
              return (
                <div key={v.id} className="group overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md">
                  <PremiumVideoPlayer src={url} isOwner={isOwner} videoId={v.id} storagePath={v.storage_path} />
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

function AddVideoButton({ categories, onVideoAdded }: { categories: SkillCategory[]; onVideoAdded: () => void }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="gradient">
          <Plus className="h-3.5 w-3.5" />Add video
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-track]:bg-transparent">
        <DialogTitle className="sr-only">Add a video</DialogTitle>
        <AddVideoForm categories={categories} onVideoAdded={onVideoAdded} />
      </DialogContent>
    </Dialog>
  );
}

function AddVideoForm({ categories, onVideoAdded }: { categories: SkillCategory[]; onVideoAdded: () => void }) {
  return (
    <VideoUploader
      categories={categories}
      onClose={() => onVideoAdded()}
      onUploaded={() => {}}
    />
  );
}
