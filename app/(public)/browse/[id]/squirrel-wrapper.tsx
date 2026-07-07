"use client";

import * as React from "react";
import { SquirrelMascot, type Mood, type TaskInfo } from "@/components/marketing/squirrel-mascot";

export function SquirrelPanelMatch({ mood, message, task, applicantCount, isOwnTask }: {
  mood: Mood;
  message?: string;
  task: TaskInfo;
  applicantCount?: number;
  isOwnTask?: boolean;
}) {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [squirrelH, setSquirrelH] = React.useState(176);

  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const measure = () => {
      const above = el.parentElement;
      const leftCol = above?.parentElement;
      const panel = document.querySelector(".apply-cta-panel");
      if (!above || !leftCol || !panel) return;

      const leftRect = leftCol.getBoundingClientRect();
      const aboveRect = above.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();

      const aboveH = aboveRect.top - leftRect.top;
      const leftH = leftRect.height;
      const panelH = panelRect.height;
      const containerH = Math.max(leftH, panelH);

      const h = Math.max(176, containerH - aboveH);
      setSquirrelH(h);
    };

    measure();
    window.addEventListener("resize", measure);

    const leftCol = el.parentElement?.parentElement;
    const panel = document.querySelector(".apply-cta-panel");
    if (leftCol && panel) {
      const ro = new ResizeObserver(measure);
      ro.observe(leftCol);
      ro.observe(panel);
      return () => {
        window.removeEventListener("resize", measure);
        ro.disconnect();
      };
    }
    return () => window.removeEventListener("resize", measure);
  }, []);

  return (
    <div ref={wrapRef}>
      <SquirrelMascot
        mood={mood}
        message={message}
        task={task}
        applicantCount={applicantCount}
        isOwnTask={isOwnTask}
        panelHeight={squirrelH}
      />
    </div>
  );
}
