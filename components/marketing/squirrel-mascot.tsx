"use client";

import * as React from "react";
import { X } from "lucide-react";

export type Mood = "excited" | "happy" | "neutral" | "sad" | "waving" | "worried" | "drinking";

export interface TaskInfo {
  id: string;
  title: string;
  description: string;
  pricing_model: string;
  budget_min?: number | null;
  budget_max?: number | null;
  deadline?: string | null;
  category_name?: string;
  skills_required?: string[];
  status: string;
  deliverables?: string | null;
  buyer_name?: string;
}

interface SquirrelMascotProps {
  mood: Mood;
  message?: string;
  task?: TaskInfo;
  applicantCount?: number;
  isOwnTask?: boolean;
  isSignedIn?: boolean;
  panelHeight?: number;
}

function getAnswer(query: string, task: TaskInfo): string {
  const q = query.toLowerCase().trim();
  const closed = task.status !== "open";

  if (closed) return "Ahh task closed. You were late! I can't answer questions for a closed task.";

  if (q.includes("deliverable") || q.includes("submit") || q.includes("need to do") || q.includes("work")) {
    const desc = task.description.slice(0, 300);
    return `Based on the task description: "${desc}..." Make sure you deliver exactly what is described.`;
  }
  if (q.includes("budget") || q.includes("pay") || q.includes("price") || q.includes("cost") || q.includes("money")) {
    if (task.pricing_model === "fixed") return `This is a fixed-price task. Budget is set between Rs.${task.budget_min} - Rs.${task.budget_max}. You can negotiate with the buyer.`;
    const min = task.budget_min ?? 0; const max = task.budget_max ?? 0;
    return `This task pays Rs.${min} - Rs.${max} per hour based on the listing.`;
  }
  if (q.includes("deadline") || q.includes("time") || q.includes("when") || q.includes("due") || q.includes("duration")) {
    if (task.deadline) return `Deadline is ${new Date(task.deadline).toLocaleDateString()}. Don't procrastinate -- apply and start early.`;
    return `No strict deadline is mentioned in the task. But buyers love quick turnarounds.`;
  }
  if (q.includes("skill") || q.includes("qualification") || q.includes("require")) {
    if (task.skills_required?.length) return `Skills needed as per the task: ${task.skills_required.join(", ")}. Got them? Apply now.`;
    return `No specific skills are listed for this task, but showing relevant experience always helps.`;
  }
  if (q.includes("who") || q.includes("buyer") || q.includes("client") || q.includes("poster")) {
    if (task.buyer_name) return `The task was posted by ${task.buyer_name}. Be professional and respectful in your application.`;
    return `A buyer posted this task. Impress them with a good cover note.`;
  }
  if (q.includes("hello") || q.includes("hi ") || q === "hi" || q.includes("hey") || q.includes("good morning") || q.includes("good evening") || q.includes("good afternoon") || q.includes("sup") || q.includes("yo") || q.includes("wasup") || q.includes("whats up")) {
    const greetings = [
      `Hey there! I'm the HiVR Squirrel. Ask me anything about this task.`,
      `Hello! 👋 Ready to help. What do you want to know about this task?`,
      `Hi! I'm your task guide. Ask me about budget, deadline, skills, or deliverables.`,
      `Hey! Need help with this task? Just ask!`,
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }
  if (q.includes("how are you") || q.includes("how r u") || q.includes("how doin") || q.includes("howdy") || q.includes("how is it going")) {
    const reps = [
      `Doing great! A squirrel's life is simple — nuts, code, and helping you land tasks. What's up?`,
      `I'm awesome, thanks for asking! Ready to dive into this task's details?`,
      `Living the dream! One acorn at a time. What can I help you with?`,
    ];
    return reps[Math.floor(Math.random() * reps.length)];
  }
  if (q.includes("thank") || q.includes("thanks") || q.includes("ty")) {
    return `You're welcome! Good luck with the task. 🐿️`;
  }
  if (q.includes("bye") || q.includes("goodbye") || q.includes("see you") || q.includes("cya") || q.includes("gtg")) {
    return `Bye! Hope you find the perfect task. Come back anytime! 🐿️`;
  }
  if (q.includes("joke") || q.includes("funny") || q.includes("laugh")) {
    const jokes = [
      `Why did the squirrel apply for the task? Because he wanted to earn some extra nuts.`,
      `What's a squirrel's favorite work tool? An acorn-drill.`,
      `How many squirrels does it take to complete this task? Just one -- if they have the right skills.`,
      `Why do squirrels make great freelancers? They're great at storing nuts (and knowledge)!`,
    ];
    return jokes[Math.floor(Math.random() * jokes.length)];
  }
  if (q.includes("help") || q.includes("how to apply") || q.includes("apply")) {
    return `Click the "Apply" button below, write a cover note explaining why you are perfect for this, and hit submit. Make it personal -- buyers love that.`;
  }
  if (q.includes("who are you") || q.includes("what are you") || q.includes("your name")) {
    return `I'm the HiVR Squirrel — your personal task assistant! I live right here in your browser and I know everything about this task. Ask me anything!`;
  }
  if (q.includes("coming soon") || q.includes("not available") || q.includes("when will")) {
    return `That category is coming soon! You can join the waitlist and we'll notify you when it launches.`;
  }
  if (q.includes("support") || q.includes("contact") || q.includes("email") || q.includes("help me") || q.includes("issue") || q.includes("problem") || q.includes("not working") || q.includes("error") || q.includes("bug") || q.includes("report")) {
    return `For support, please email us at hivr2026@gmail.com or open a ticket at /dashboard/support. We'll get back to you quickly!`;
  }

  return `I'm not sure I can help with that from my knowledge base. For anything outside HiVR's core features, please contact our support team at hivr2026@gmail.com or open a ticket at /dashboard/support.`;
}

function ChatPopover({ task, onClose }: { task: TaskInfo; onClose: () => void }) {
  const [messages, setMessages] = React.useState<{ from: "user" | "squirrel"; text: string }[]>([
    { from: "squirrel", text: `Hello! I'm the HiVR Squirrel. Ask me anything about "${task.title}".` },
  ]);
  const [input, setInput] = React.useState("");
  const chatRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  const handleSend = () => {
    const q = input.trim();
    if (!q) return;
    setInput("");
    setMessages((m) => [...m, { from: "user", text: q }]);
    const answer = getAnswer(q, task);
    setTimeout(() => {
      setMessages((m) => [...m, { from: "squirrel", text: answer }]);
    }, 400 + Math.random() * 300);
  };

  return (
      <div className="absolute bottom-full left-2 mb-2 z-50">
        <div className="rounded-xl border bg-card shadow-xl overflow-hidden" style={{ width: "280px" }}>
        <div className="flex items-center justify-between border-b bg-muted/50 px-3 py-2">
          <span className="text-xs font-semibold">Task Guide</span>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-muted transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div ref={chatRef} className="flex flex-col gap-2 p-3 overflow-y-auto [&::-webkit-scrollbar]:w-0 [&::-webkit-scrollbar]:h-0" style={{ height: "200px" }}>
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.from === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`rounded-xl px-3 py-1.5 text-xs max-w-[85%] leading-relaxed ${
                  m.from === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1 border-t p-2">
          <input
            className="flex-1 rounded-lg border bg-background px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
            placeholder="Ask about this task..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
          />
          <button
            onClick={handleSend}
            className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Ask
          </button>
        </div>
      </div>
    </div>
  );
}

export function SquirrelMascot({ mood, message, task, applicantCount, isOwnTask, isSignedIn, panelHeight }: SquirrelMascotProps) {
  const [isWaving, setIsWaving] = React.useState(false);
  const [chatOpen, setChatOpen] = React.useState(false);
  const [isEating, setIsEating] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout>>();
  const eatTimerRef = React.useRef<ReturnType<typeof setTimeout>>();
  const [isInitialDrink, setIsInitialDrink] = React.useState(true);

  React.useEffect(() => {
    if (isInitialDrink) {
      const t = setTimeout(() => setIsInitialDrink(false), 3000);
      return () => clearTimeout(t);
    }
  }, [isInitialDrink]);

  const handleClick = () => {
    setIsWaving(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setIsWaving(false), 3000);
  };

  const handleNutClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setChatOpen((c) => !c);
    setIsEating(true);
    if (eatTimerRef.current) clearTimeout(eatTimerRef.current);
    eatTimerRef.current = setTimeout(() => setIsEating(false), 2500);
  };

  const shouldDrink = (mood === "drinking" && isInitialDrink) || isEating;
  const effectiveMood = isWaving ? "waving" : mood;

  const isRunning = effectiveMood === "excited";
  const isWavingActive = effectiveMood === "waving";

  const squirrelH = panelHeight ?? 176;
  const squirrelW = Math.round(squirrelH * 0.923);

  return (
    <div className="flex items-start gap-4 relative" data-tour="squirrel-mascot">
      <div className="relative shrink-0">
        <svg viewBox="0 0 240 260" width={squirrelW} height={squirrelH} className="shrink-0 drop-shadow-lg cursor-pointer" onClick={handleClick}>
          <defs>
            <radialGradient id="fur" cx="42%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#F0B86A" />
              <stop offset="55%" stopColor="#D4893A" />
              <stop offset="100%" stopColor="#B86A28" />
            </radialGradient>
            <radialGradient id="tailGrad" cx="30%" cy="40%" r="70%">
              <stop offset="0%" stopColor="#E8A34A" />
              <stop offset="45%" stopColor="#C47A2A" />
              <stop offset="100%" stopColor="#A05A20" />
            </radialGradient>
            <radialGradient id="belly" cx="50%" cy="40%" r="55%">
              <stop offset="0%" stopColor="#FDE8C8" />
              <stop offset="100%" stopColor="#F0CA88" />
            </radialGradient>
            <radialGradient id="acornBody" cx="40%" cy="30%" r="60%">
              <stop offset="0%" stopColor="#C47A2A" />
              <stop offset="100%" stopColor="#8B5E2A" />
            </radialGradient>
          </defs>
          <g>
            {isRunning && (
              <animateTransform attributeName="transform" type="translate" values="0 0;0 -5;0 0;0 -5;0 0" dur="0.45s" repeatCount="indefinite" />
            )}
            {shouldDrink && (
              <animateTransform attributeName="transform" type="translate" values="0 0;0 -2;0 0" dur="2s" repeatCount="indefinite" />
            )}
            <path d="M 88 176 C 18 162 4 92 28 54 C 48 22 84 22 94 42 C 102 60 78 72 74 92 C 70 112 84 124 84 144 C 84 158 80 168 88 176 Z" fill="url(#tailGrad)" stroke="#8B4513" strokeWidth="2.5" strokeLinejoin="round" />
            <path d="M 80 46 C 66 60 50 74 44 90" fill="none" stroke="#B86A28" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
            <path d="M 48 102 C 42 118 42 136 50 150" fill="none" stroke="#8B4513" strokeWidth="2" strokeLinecap="round" opacity="0.25" />
            <ellipse cx="120" cy="168" rx="34" ry="30" fill="url(#fur)" stroke="#8B4513" strokeWidth="2.5" />
            <ellipse cx="120" cy="174" rx="22" ry="20" fill="url(#belly)" stroke="#D4893A" strokeWidth="2" />
            {isRunning ? (
              <>
                <g>
                  <ellipse cx="100" cy="198" rx="13" ry="7" fill="#A05A20" stroke="#8B4513" strokeWidth="2.5">
                    <animateTransform attributeName="transform" type="rotate" values="-20 100 198;20 100 198;-20 100 198" dur="0.45s" repeatCount="indefinite" />
                  </ellipse>
                </g>
                <g>
                  <ellipse cx="140" cy="198" rx="13" ry="7" fill="#A05A20" stroke="#8B4513" strokeWidth="2.5">
                    <animateTransform attributeName="transform" type="rotate" values="20 140 198;-20 140 198;20 140 198" dur="0.45s" repeatCount="indefinite" />
                  </ellipse>
                </g>
              </>
            ) : (
              <>
                <ellipse cx="100" cy="198" rx="13" ry="7" fill="#A05A20" stroke="#8B4513" strokeWidth="2.5" />
                <ellipse cx="140" cy="198" rx="13" ry="7" fill="#A05A20" stroke="#8B4513" strokeWidth="2.5" />
              </>
            )}
            <g>
              <path d="M 72 72 C 68 48 82 28 102 32 C 114 34 116 52 110 66 C 104 78 84 82 72 72 Z" fill="url(#fur)" stroke="#8B4513" strokeWidth="2.5" strokeLinejoin="round" />
              <path d="M 76 68 C 74 50 84 34 100 38 C 108 40 110 54 106 64 C 102 74 86 76 76 68 Z" fill="#6B4220" />
            </g>
            <g>
              <path d="M 168 72 C 172 48 158 28 138 32 C 126 34 124 52 130 66 C 136 78 156 82 168 72 Z" fill="url(#fur)" stroke="#8B4513" strokeWidth="2.5" strokeLinejoin="round" />
              <path d="M 164 68 C 166 50 156 34 140 38 C 132 40 130 54 134 64 C 138 74 154 76 164 68 Z" fill="#6B4220" />
            </g>
            <g>
              {shouldDrink && <animateTransform attributeName="transform" type="rotate" values="0 120 102;-3 120 102;0 120 102" dur="2s" repeatCount="indefinite" />}
              {effectiveMood === "sad" && <animateTransform attributeName="transform" type="rotate" values="0 120 102;1 120 102;0 120 102" dur="2s" repeatCount="indefinite" />}
              <circle cx="120" cy="102" r="48" fill="url(#fur)" stroke="#8B4513" strokeWidth="2.5" />
              <path d="M 110 54 C 106 44 108 36 112 32" fill="none" stroke="#A05A20" strokeWidth="3" strokeLinecap="round" />
              <circle cx="112" cy="32" r="3" fill="#C47A2A" stroke="#8B4513" strokeWidth="1" />
              <path d="M 130 54 C 134 44 132 36 128 32" fill="none" stroke="#A05A20" strokeWidth="3" strokeLinecap="round" />
              <circle cx="128" cy="32" r="3" fill="#C47A2A" stroke="#8B4513" strokeWidth="1" />
              <ellipse cx="74" cy="122" rx="28" ry="24" fill="url(#fur)" stroke="#8B4513" strokeWidth="2.5" />
              <ellipse cx="166" cy="122" rx="28" ry="24" fill="url(#fur)" stroke="#8B4513" strokeWidth="2.5" />
              <ellipse cx="78" cy="126" rx="15" ry="10" fill="#FF8A9E" opacity="0.35" />
              <ellipse cx="162" cy="126" rx="15" ry="10" fill="#FF8A9E" opacity="0.35" />
              <ellipse cx="120" cy="124" rx="19" ry="11" fill="#FDE8C8" stroke="#D4893A" strokeWidth="2" />
              {effectiveMood === "sad" ? (
                <>
                  <ellipse cx="96" cy="96" rx="9" ry="13" fill="#1A1A1A" />
                  <ellipse cx="144" cy="96" rx="9" ry="13" fill="#1A1A1A" />
                  <circle cx="99" cy="91" r="3" fill="white" />
                  <circle cx="147" cy="91" r="3" fill="white" />
                  <circle cx="93" cy="89" r="1.5" fill="white" />
                  <circle cx="141" cy="89" r="1.5" fill="white" />
                  <path d="M 96 108 C 98 114 95 118 93 114" fill="#7DD3FC" opacity="0.7">
                    <animate attributeName="d" values="M 96 108 C 98 114 95 118 93 114;M 96 108 C 99 115 95 120 93 116;M 96 108 C 98 114 95 118 93 114" dur="1.5s" repeatCount="indefinite" />
                  </path>
                  <path d="M 144 108 C 146 114 143 118 141 114" fill="#7DD3FC" opacity="0.7">
                    <animate attributeName="d" values="M 144 108 C 146 114 143 118 141 114;M 144 108 C 147 115 143 120 141 116;M 144 108 C 146 114 143 118 141 114" dur="1.8s" repeatCount="indefinite" />
                  </path>
                </>
              ) : (
                <>
                  <ellipse cx="96" cy="96" rx="9" ry="13" fill="#1A1A1A" />
                  <ellipse cx="144" cy="96" rx="9" ry="13" fill="#1A1A1A" />
                  <circle cx="99" cy="91" r="4" fill="white" />
                  <circle cx="147" cy="91" r="4" fill="white" />
                  <circle cx="93" cy="88" r="2.2" fill="white" />
                  <circle cx="141" cy="88" r="2.2" fill="white" />
                  <circle cx="98" cy="100" r="1.5" fill="white" opacity="0.4" />
                  <circle cx="146" cy="100" r="1.5" fill="white" opacity="0.4" />
                </>
              )}
              <ellipse cx="120" cy="112" rx="4" ry="3" fill="#3A2010" />
              <ellipse cx="118" cy="111" rx="1.5" ry="1" fill="#5C3A1E" opacity="0.35" />
              <path d="M 106 124 Q 120 138 134 124" fill="none" stroke="#3A2010" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M 108 124 Q 120 136 132 124 Z" fill="#3A2010" opacity="0.12" />
              <rect x="115" y="128" width="6" height="7" rx="1.5" fill="#FEFEFE" stroke="#D4893A" strokeWidth="1" />
              <rect x="121" y="128" width="6" height="7" rx="1.5" fill="#FEFEFE" stroke="#D4893A" strokeWidth="1" />
              <g stroke="#A05A20" strokeWidth="1.2" opacity="0.4" strokeLinecap="round">
                <line x1="64" y1="118" x2="88" y2="124" />
                <line x1="62" y1="124" x2="88" y2="126" />
                <line x1="64" y1="130" x2="88" y2="128" />
                <line x1="176" y1="118" x2="152" y2="124" />
                <line x1="178" y1="124" x2="152" y2="126" />
                <line x1="176" y1="130" x2="152" y2="128" />
              </g>
            </g>
          </g>
          {shouldDrink ? (
            <g>
              <animateTransform attributeName="transform" type="translate" values="0 0;0 -22;0 0" dur="2s" repeatCount="indefinite" />
              <g transform="translate(120, 178)">
                <ellipse cx="0" cy="4" rx="17" ry="21" fill="url(#acornBody)" stroke="#6B4220" strokeWidth="2.5" />
                <path d="M -19 -2 C -19 -16 19 -16 19 -2" fill="#8B5E2A" stroke="#6B4220" strokeWidth="2.5" strokeLinecap="round" />
                <line x1="0" y1="-14" x2="-2" y2="-20" stroke="#6B4220" strokeWidth="3" strokeLinecap="round" />
                <ellipse cx="-5" cy="0" rx="6" ry="9" fill="#D4A017" opacity="0.2" />
              </g>
              <path d="M 90 162 C 76 160 66 178 76 190 C 84 198 100 196 110 190" fill="none" stroke="#D4893A" strokeWidth="10" strokeLinecap="round" />
              <path d="M 150 162 C 164 160 174 178 164 190 C 156 198 140 196 130 190" fill="none" stroke="#D4893A" strokeWidth="10" strokeLinecap="round" />
              <circle cx="118" cy="100" r="2" fill="#7DD3FC" opacity="0.5">
                <animate attributeName="cy" values="100;90;80" dur="1s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.5;0.3;0" dur="1s" repeatCount="indefinite" />
              </circle>
              <circle cx="122" cy="98" r="1.5" fill="#7DD3FC" opacity="0.4">
                <animate attributeName="cy" values="98;88;78" dur="1.2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.4;0.2;0" dur="1.2s" repeatCount="indefinite" />
              </circle>
            </g>
          ) : isWavingActive ? (
            <>
              <g transform="translate(120, 178)">
                <ellipse cx="0" cy="4" rx="17" ry="21" fill="url(#acornBody)" stroke="#6B4220" strokeWidth="2.5" />
                <path d="M -19 -2 C -19 -16 19 -16 19 -2" fill="#8B5E2A" stroke="#6B4220" strokeWidth="2.5" strokeLinecap="round" />
                <line x1="0" y1="-14" x2="2" y2="-20" stroke="#6B4220" strokeWidth="3" strokeLinecap="round" />
                <ellipse cx="-5" cy="0" rx="6" ry="9" fill="#D4A017" opacity="0.2" />
              </g>
              <path d="M 90 162 C 76 160 66 178 76 190 C 84 198 100 196 110 190" fill="none" stroke="#D4893A" strokeWidth="10" strokeLinecap="round" />
              <g>
                <path d="M 152 156 C 172 146 184 116 174 104" fill="none" stroke="#D4893A" strokeWidth="10" strokeLinecap="round">
                  <animateTransform attributeName="transform" type="rotate" values="0 152 156;-14 152 156;0 152 156" dur="0.6s" repeatCount="indefinite" />
                </path>
                <circle cx="174" cy="104" r="6" fill="#D4893A" stroke="#8B4513" strokeWidth="2">
                  <animateTransform attributeName="transform" type="rotate" values="0 152 156;-14 152 156;0 152 156" dur="0.6s" repeatCount="indefinite" />
                </circle>
              </g>
            </>
          ) : isRunning ? (
            <>
              <g>
                <path d="M 90 160 C 76 158 64 174 72 186 C 80 194 96 192 106 186" fill="none" stroke="#D4893A" strokeWidth="10" strokeLinecap="round">
                  <animateTransform attributeName="transform" type="rotate" values="-15 90 160;15 90 160;-15 90 160" dur="0.45s" repeatCount="indefinite" />
                </path>
              </g>
              <g>
                <path d="M 150 160 C 164 158 176 174 168 186 C 160 194 144 192 134 186" fill="none" stroke="#D4893A" strokeWidth="10" strokeLinecap="round">
                  <animateTransform attributeName="transform" type="rotate" values="15 150 160;-15 150 160;15 150 160" dur="0.45s" repeatCount="indefinite" />
                </path>
              </g>
              <g opacity="0.35">
                <line x1="52" y1="116" x2="40" y2="114" stroke="#8B4513" strokeWidth="2.5" strokeLinecap="round">
                  <animate attributeName="x1" values="52;42;52" dur="0.45s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.35;0.05;0.35" dur="0.45s" repeatCount="indefinite" />
                </line>
                <line x1="48" y1="126" x2="36" y2="126" stroke="#8B4513" strokeWidth="2.5" strokeLinecap="round">
                  <animate attributeName="x1" values="48;38;48" dur="0.45s" repeatCount="indefinite" begin="0.1s" />
                  <animate attributeName="opacity" values="0.35;0.05;0.35" dur="0.45s" repeatCount="indefinite" begin="0.1s" />
                </line>
                <line x1="188" y1="120" x2="200" y2="118" stroke="#8B4513" strokeWidth="2.5" strokeLinecap="round">
                  <animate attributeName="x1" values="188;198;188" dur="0.45s" repeatCount="indefinite" begin="0.2s" />
                  <animate attributeName="opacity" values="0.35;0.05;0.35" dur="0.45s" repeatCount="indefinite" begin="0.2s" />
                </line>
              </g>
            </>
          ) : (
            <>
              <g transform="translate(120, 178)">
                <ellipse cx="0" cy="4" rx="17" ry="21" fill="url(#acornBody)" stroke="#6B4220" strokeWidth="2.5" />
                <path d="M -19 -2 C -19 -16 19 -16 19 -2" fill="#8B5E2A" stroke="#6B4220" strokeWidth="2.5" strokeLinecap="round" />
                <line x1="0" y1="-14" x2="2" y2="-20" stroke="#6B4220" strokeWidth="3" strokeLinecap="round" />
                <ellipse cx="-5" cy="0" rx="6" ry="9" fill="#D4A017" opacity="0.2" />
              </g>
              <path d="M 90 162 C 76 160 66 178 76 190 C 84 198 100 196 110 190" fill="none" stroke="#D4893A" strokeWidth="10" strokeLinecap="round" />
              <path d="M 150 162 C 164 160 174 178 164 190 C 156 198 140 196 130 190" fill="none" stroke="#D4893A" strokeWidth="10" strokeLinecap="round" />
            </>
          )}
        </svg>

        {/* Chat nut button */}
        {task && (
          <div className="absolute -bottom-1.5 -right-1 z-10">
            <button
              onClick={handleNutClick}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-600 text-white shadow-md hover:bg-amber-700 transition-all hover:scale-110 ring-2 ring-background"
              title="Ask the squirrel about this task"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
                <ellipse cx="12" cy="14" rx="7" ry="8" fill="#FDE8C8" stroke="#6B4220" strokeWidth="1.5" />
                <path d="M 5 10 C 5 6 19 6 19 10" fill="#8B5E2A" stroke="#6B4220" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="12" y1="6" x2="12" y2="4" stroke="#6B4220" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
            {chatOpen && (
              <ChatPopover task={task} onClose={() => setChatOpen(false)} />
            )}
          </div>
        )}
      </div>

      {/* Speech bubble */}
      <div className="relative flex-1">
        <div className="relative rounded-xl border bg-card px-4 py-3 text-sm leading-relaxed shadow-sm">
          <div className="absolute -left-1.5 top-4 h-3 w-3 rotate-45 border-b border-l bg-card" />
          {message ? (
            <p>{message}</p>
          ) : effectiveMood === "excited" ? (
            <p className="font-medium text-emerald-600">Task is Open, Apply fast! <span className="text-foreground">Your skills match perfectly — don't miss out!</span></p>
          ) : effectiveMood === "happy" ? (
            <p>You've applied! <span className="font-medium text-emerald-600">Fingers crossed 🤞 I'm rooting for you!</span></p>
          ) : effectiveMood === "sad" ? (
            <p className="text-amber-700">Ah Task closed! You were late! 😢</p>
          ) : effectiveMood === "worried" ? (
            <p className="text-amber-600">Skills does not match. Apply at your own risk — buyers prefer verified skills.</p>
          ) : effectiveMood === "waving" ? (
            <p><span className="font-medium">Hello!</span> 👋 How can I help you?</p>
          ) : effectiveMood === "drinking" ? (
            <p>🥤 <span className="font-medium">Sign in</span> to apply for this task.</p>
          ) : (
            <p>Ready? Check the details below and apply when you're set!</p>
          )}

          {/* Buyer stats for own task */}
          {isOwnTask && task && task.status === "open" && (
            <div className="mt-2 rounded-lg bg-muted/50 p-2 text-xs">
              <p className="font-medium text-amber-700">
                📊 {applicantCount ?? 0} applicant{(applicantCount ?? 0) !== 1 ? "s" : ""} applied
              </p>
              <p className="mt-0.5 text-muted-foreground">
                You can hire, shortlist, or extend the task.
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
