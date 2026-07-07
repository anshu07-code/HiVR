"use client";

import * as React from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Eye, MapPin, GraduationCap, Briefcase, Award, Star } from "lucide-react";

type Props = {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  headline: string;
  bio: string;
  location: string;
  skills: any[];
  education: any[];
  experience: any[];
  certifications: any[];
  achievements: any[];
  languages: string[];
};

export function ProfilePreviewDialog({
  userId, fullName, avatarUrl, headline, bio, location,
  skills, education, experience, certifications, achievements, languages,
}: Props) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Eye className="h-3.5 w-3.5" />
          Preview public profile
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Profile preview</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarImage src={avatarUrl ?? undefined} />
              <AvatarFallback>{fullName?.charAt(0) ?? "?"}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold">{fullName}</p>
              {headline && <p className="text-xs text-muted-foreground">{headline}</p>}
              {location && <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{location}</p>}
            </div>
          </div>

          {bio && <p className="text-sm text-muted-foreground line-clamp-4">{bio}</p>}

          {languages.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Languages</p>
              <div className="flex flex-wrap gap-1">
                {languages.map(l => <Badge key={l} variant="secondary" className="text-[10px]">{l}</Badge>)}
              </div>
            </div>
          )}

          {skills.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Skills</p>
              <div className="flex flex-wrap gap-1">
                {skills.slice(0, 8).map((s: any) => <Badge key={s.category_id} variant="outline" className="text-[10px]">{s.name ?? s.category_id}</Badge>)}
                {skills.length > 8 && <span className="text-[10px] text-muted-foreground">+{skills.length - 8} more</span>}
              </div>
            </div>
          )}

          {education.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1"><GraduationCap className="h-3 w-3" /> Education</p>
              <div className="space-y-1">
                {education.slice(0, 3).map((e: any) => (
                  <p key={e.id} className="text-xs">{e.institution}{e.degree ? ` · ${e.degree}` : ""}</p>
                ))}
              </div>
            </div>
          )}

          {experience.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1"><Briefcase className="h-3 w-3" /> Experience</p>
              <div className="space-y-1">
                {experience.slice(0, 3).map((e: any) => (
                  <p key={e.id} className="text-xs">{e.role} at {e.company}</p>
                ))}
              </div>
            </div>
          )}

          {certifications.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1"><Award className="h-3 w-3" /> Certifications</p>
              <div className="space-y-1">
                {certifications.slice(0, 3).map((c: any) => (
                  <p key={c.id} className="text-xs">{c.name} · {c.issuer}</p>
                ))}
              </div>
            </div>
          )}

          {achievements.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1"><Star className="h-3 w-3" /> Achievements</p>
              <div className="space-y-1">
                {achievements.slice(0, 3).map((a: any) => (
                  <p key={a.id} className="text-xs">{a.title}</p>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2 text-center">
            <Button asChild variant="link" size="sm">
              <a href={`/people/${userId}`} target="_blank" rel="noreferrer">
                Full profile <ExternalLink className="h-3 w-3" />
              </a>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
