"use client";

import * as React from "react";
import { SquirrelMascot } from "@/components/marketing/squirrel-mascot";

type ActionButton = { label: string; href: string; variant?: "default" | "outline" | "success" };

type Props = {
  mood: "excited" | "happy" | "neutral" | "sad" | "waving" | "worried" | "drinking";
  message?: string;
  task: {
    id: string;
    title: string;
    description: string;
    pricing_model: string;
    budget_min: number;
    budget_max: number;
    deadline: string | null;
    category_name?: string;
    skills_required: string[];
    status: string;
    deliverables: string | null;
    buyer_name?: string;
  };
  applicantCount: number;
  isOwnTask?: boolean;
  panelHeight?: number;
  actions?: ActionButton[];
};

export function DraggableSquirrel(props: Props) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState({ x: 0, y: 0 });
  const [dragging, setDragging] = React.useState(false);
  const dragStart = React.useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  const onMouseDown = React.useCallback((e: React.MouseEvent) => {
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, posX: pos.x, posY: pos.y };
    e.preventDefault();
  }, [pos]);

  React.useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      setPos({
        x: dragStart.current.posX + (e.clientX - dragStart.current.x),
        y: dragStart.current.posY + (e.clientY - dragStart.current.y),
      });
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [dragging]);

  return (
    <div
      ref={containerRef}
      className={`relative ${dragging ? "cursor-grabbing z-50" : "cursor-grab"}`}
    >
      <div
        style={{ transform: `translate(${pos.x}px, ${pos.y}px)`, marginTop: -10 }}
        className="transition-none"
      >
        <div onMouseDown={onMouseDown}>
          <SquirrelMascot
            mood={props.mood}
            message={props.message}
            task={props.task}
            applicantCount={props.applicantCount}
            isOwnTask={props.isOwnTask}
            panelHeight={props.panelHeight}
            actions={props.actions}
          />
        </div>
      </div>
    </div>
  );
}
