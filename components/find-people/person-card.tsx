import Link from "next/link";
import { Star, MapPin, Clock, Zap, ShieldCheck, Briefcase, Award, BadgeCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatPaise } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Props = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  headline?: string | null;
  bio?: string | null;
  location?: string | null;
  avg_rating?: number | null;
  total_reviews?: number | null;
  total_contracts_completed?: number | null;
  hourly_rate_paise?: number | null;
  availability_hours?: number | null;
  availability_status?: string | null;
  experience_type?: string | null;
  overall_trust_tier?: string | null;
  is_top?: boolean;
  is_available?: boolean;
  is_verified?: boolean;
  skills?: Array<{
    id?: string;
    verification_status?: string;
    category?: { name: string; slug: string; tier: string; icon: string } | null;
  }>;
  className?: string;
};

/**
 * PersonCard — the "profile preview" tile on the Find People page.
 *
 * Design:
 *  - Avatar sits half outside / half inside the card (top: -28px),
 *    giving a layered "card with a popping photo" look. Works in all
 *    3 theme modes because every color is a theme token.
 *  - Below the avatar: name, verified badge, headline, rating,
 *    contracts completed, location, top skills, hourly rate, and
 *    availability. Tapping anywhere on the card opens the public
 *    profile.
 *  - Top-rated and available badges are pinned to the top-right so
 *    they're always visible regardless of card width.
 */
export function PersonCard(p: Props) {
  const initials = (p.full_name ?? "??")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const rating = p.avg_rating != null ? Number(p.avg_rating) : null;
  const isTop = !!p.is_top;
  const isVerified = !!p.is_verified;

  return (
    <Link href={`/people/${p.id}`} className={cn("group block pt-7", p.className)}>
      <Card className={cn(
        "relative h-full overflow-visible transition-all group-hover:border-primary/40 group-hover:shadow-md",
        isTop && "border-amber-500/40 ring-1 ring-amber-500/20"
      )}>
        {/* Avatar — half outside the top edge, half inside. The
            white ring around the avatar is the card's bg so it
            "punches through" the top border cleanly. */}
        <div className="relative -mt-10 flex justify-center">
          <div className="relative">
            <Avatar className="h-20 w-20 ring-4 ring-card">
              <AvatarImage src={p.avatar_url ?? undefined} alt={p.full_name ?? "Profile"} />
              <AvatarFallback className="text-lg font-semibold">{initials}</AvatarFallback>
            </Avatar>
             {p.availability_status && ["online","offline","away","busy"].includes(p.availability_status) && (
              <span
                className={cn(
                  "absolute bottom-0 right-0 h-3 w-3 -translate-x-[3px] -translate-y-[3px] rounded-full ring-2 ring-card",
                  p.availability_status === "online" && "bg-emerald-500",
                  p.availability_status === "offline" && "bg-gray-400",
                  p.availability_status === "away" && "bg-red-500",
                  p.availability_status === "busy" && "bg-yellow-500",
                )}
                title={p.availability_status}
              />
            )}
            {isVerified && (
              <span
                className="absolute -top-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full bg-blue-500 text-white ring-2 ring-card"
                title="Identity verified"
              >
                <BadgeCheck className="h-3 w-3" />
              </span>
            )}
          </div>
        </div>

        {/* Name + headline + badges (centered, below the avatar) */}
        <div className="px-4 pt-3 text-center">
          <h3 className="truncate font-display text-base font-semibold text-card-foreground">
            {p.full_name ?? "Anonymous"}
          </h3>
          {/* Badges sit on their own row below the name so they
              never overlap the avatar (which extends above the card
              edge) and never overflow the card width. */}
          {isTop && (
            <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1">
              <Badge variant="warning" className="text-[10px]">
                <Star className="mr-0.5 h-3 w-3 fill-current" />
                Top rated
              </Badge>
            </div>
          )}
          {p.headline && (
            <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">
              {p.headline}
            </p>
          )}
        </div>

        {/* Bio (clipped to 2 lines) */}
        {p.bio && (
          <p className="mx-4 mt-2 line-clamp-2 text-center text-[11px] leading-relaxed text-muted-foreground">
            {p.bio}
          </p>
        )}

        {/* Stats strip — rating · reviews · experience tier */}
        <div className="mt-3 grid grid-cols-3 divide-x divide-border border-y border-border bg-muted/30 px-2 py-2 text-center">
          <Stat
            icon={<Star className="h-3 w-3 fill-current" />}
            primary={rating != null ? rating.toFixed(2) : "—"}
            secondary={rating != null ? "rating" : "no reviews"}
            accent="amber"
          />
          <Stat
            icon={<Briefcase className="h-3 w-3" />}
            primary={String(p.total_reviews ?? 0)}
            secondary="reviews"
          />
          <Stat
            icon={<Award className="h-3 w-3" />}
            primary={p.experience_type ? labelize(p.experience_type) : "—"}
            secondary="tier"
            small
          />
        </div>

        {/* Location + rate + availability */}
        <div className="space-y-1.5 px-4 py-3 text-[11px] text-muted-foreground">
          {p.location && (
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{p.location}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            {p.hourly_rate_paise ? (
              <span className="font-mono text-foreground">
                {formatPaise(p.hourly_rate_paise)}/hr
              </span>
            ) : (
              <span className="italic">Rate on request</span>
            )}
            {p.availability_hours ? (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {p.availability_hours}h/wk
              </span>
            ) : null}
          </div>
        </div>

        {/* Top skills (up to 3) */}
        {p.skills && p.skills.length > 0 && (
          <div className="flex flex-wrap gap-1 border-t border-border px-4 py-3">
            {p.skills.slice(0, 3).map((s, i) => (
              <Badge
                key={s.id ?? s.category?.slug ?? i}
                variant={s.category?.tier === "role_engagement" ? "tierB" : "tierA"}
                className="text-[10px]"
              >
                {s.category?.name}
              </Badge>
            ))}
            {p.skills.length > 3 && (
              <span className="text-[10px] text-muted-foreground">+{p.skills.length - 3} more</span>
            )}
          </div>
        )}
      </Card>
    </Link>
  );
}

function Stat({
  icon,
  primary,
  secondary,
  small,
  accent,
}: {
  icon: React.ReactNode;
  primary: string;
  secondary: string;
  small?: boolean;
  accent?: "amber";
}) {
  return (
    <div className="flex flex-col items-center justify-center px-1">
      <div className={cn(
        "inline-flex items-center gap-1 font-semibold text-card-foreground",
        small ? "text-[10px] uppercase tracking-wider" : "text-sm",
        accent === "amber" && "text-amber-500"
      )}>
        {icon}
        {primary}
      </div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
        {secondary}
      </div>
    </div>
  );
}

function labelize(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
