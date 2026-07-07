"use client";

export function GigRibbon() {
  return (
    <div className="absolute -top-[2px] -right-[2px] z-20 w-[52px] h-[52px] overflow-hidden pointer-events-none">
      <div
        className="absolute flex items-center justify-center"
        style={{
          width: "56px",
          height: "16px",
          top: "10px",
          right: "-16px",
          transform: "rotate(45deg)",
          background: "linear-gradient(135deg, #f59e0b, #d97706)",
          boxShadow: "0 1px 4px rgba(180,83,9,0.35)",
        }}
      >
        <span className="text-[8px] font-bold uppercase tracking-[0.18em] text-white leading-none" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.25)" }}>
          Gig
        </span>
      </div>
    </div>
  );
}
