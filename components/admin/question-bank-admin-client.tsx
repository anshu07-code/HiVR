"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Loader2, Trash2, Edit3, Check, X, AlertCircle, ListChecks, Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

type Question = {
  id: string;
  category_id: string;
  question_type: "mcq" | "practical";
  content: { prompt: string; options?: string[]; wage_band?: { min: number; max: number } };
  correct_answer: any;
  grading_rubric?: any;
  difficulty: number;
  time_estimate_seconds: number;
};

const DIFFICULTY_LABELS = ["", "Easy", "Beginner", "Intermediate", "Advanced", "Expert"];

export function QuestionBankAdminClient({
  categoryId,
  categoryName,
  initialQuestions,
}: {
  categoryId: string;
  categoryName: string;
  initialQuestions: Question[];
}) {
  const router = useRouter();
  const [questions, setQuestions] = React.useState<Question[]>(initialQuestions);
  const [adding, setAdding] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<"all" | "mcq" | "practical">("all");
  const [err, setErr] = React.useState<string | null>(null);

  // Form state (used for both add and edit)
  const [qType, setQType] = React.useState<"mcq" | "practical">("mcq");
  const [prompt, setPrompt] = React.useState("");
  const [options, setOptions] = React.useState<string[]>(["", "", "", ""]);
  const [correctOption, setCorrectOption] = React.useState("");
  const [practicalAnswer, setPracticalAnswer] = React.useState("");
  const [difficulty, setDifficulty] = React.useState(2);
  const [time, setTime] = React.useState(90);
  const [rubric, setRubric] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const visible = questions.filter((q) => filter === "all" || q.question_type === filter);
  const mcqCount = questions.filter((q) => q.question_type === "mcq").length;
  const practicalCount = questions.filter((q) => q.question_type === "practical").length;

  function resetForm() {
    setQType("mcq");
    setPrompt("");
    setOptions(["", "", "", ""]);
    setCorrectOption("");
    setPracticalAnswer("");
    setDifficulty(2);
    setTime(90);
    setRubric("");
    setErr(null);
  }

  function startEdit(q: Question) {
    setEditingId(q.id);
    setQType(q.question_type);
    setPrompt(q.content.prompt);
    setOptions(q.content.options ?? ["", "", "", ""]);
    setCorrectOption(q.correct_answer?.option ?? "");
    setPracticalAnswer(typeof q.correct_answer === "string" ? q.correct_answer : (q.correct_answer?.expected ?? ""));
    setDifficulty(q.difficulty);
    setTime(q.time_estimate_seconds);
    setRubric(q.grading_rubric ? JSON.stringify(q.grading_rubric, null, 2) : "");
    setAdding(false);
    setErr(null);
  }

  function cancelEdit() {
    setEditingId(null);
    resetForm();
  }

  async function save() {
    if (!prompt.trim()) { setErr("Prompt is required"); return; }
    if (qType === "mcq") {
      const cleaned = options.map((o) => o.trim()).filter(Boolean);
      if (cleaned.length < 2) { setErr("MCQ needs at least 2 non-empty options"); return; }
      if (!cleaned.includes(correctOption.trim())) { setErr("Correct option must match one of the options"); return; }
    }
    setBusy(true);
    setErr(null);
    try {
      const body: any = {
        question_type: qType,
        content: { prompt: prompt.trim(), options: qType === "mcq" ? options.map((o) => o.trim()).filter(Boolean) : undefined },
        correct_answer: qType === "mcq" ? { option: correctOption.trim() } : (practicalAnswer.trim() ? { expected: practicalAnswer.trim() } : {}),
        grading_rubric: rubric.trim() ? (() => { try { return JSON.parse(rubric); } catch { setErr("Rubric must be valid JSON"); return null; } })() : null,
        difficulty,
        time_estimate_seconds: time,
      };
      if (!body.grading_rubric && rubric.trim()) { setBusy(false); return; }
      const url = editingId ? `/api/admin/skills/questions/${editingId}` : "/api/admin/skills/questions";
      const method = editingId ? "PATCH" : "POST";
      if (!editingId) body.category_id = categoryId;
      const r = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) { setErr(d?.error ?? "Failed"); setBusy(false); return; }
      cancelEdit();
      setAdding(false);
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function del(id: string) {
    if (!confirm("Delete this question? In-flight test attempts referencing it will still work but the question won't appear in future tests.")) return;
    const r = await fetch(`/api/admin/skills/questions/${id}`, { method: "DELETE" });
    if (!r.ok) {
      const d = await r.json();
      alert(d?.error ?? "Failed");
      return;
    }
    setQuestions((qs) => qs.filter((q) => q.id !== id));
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total questions</p>
            <p className="font-display text-2xl font-semibold">{questions.length}</p>
            <p className="text-[10px] text-muted-foreground">for {categoryName}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">MCQ</p>
            <p className="font-display text-2xl font-semibold">{mcqCount}</p>
            <p className="text-[10px] text-muted-foreground">auto-graded</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Practical</p>
            <p className="font-display text-2xl font-semibold">{practicalCount}</p>
            <p className="text-[10px] text-muted-foreground">needs human review</p>
          </CardContent>
        </Card>
      </div>

      {err && <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{err}</div>}

      {/* Add form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="h-4 w-4" />
            {editingId ? "Edit question" : adding ? "New question" : "Question bank"}
          </CardTitle>
          <CardDescription>
            {editingId || adding
              ? "Configure the question. The correct answer is hidden from the employee by the test runner."
              : "Each test attempt picks 8 MCQ + 2 practical questions from this bank. Add at least 10 MCQ and 4 practical to give the test variety."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {adding || editingId ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label className="text-xs">Type</Label>
                  <select
                    value={qType}
                    onChange={(e) => setQType(e.target.value as any)}
                    disabled={!!editingId}
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="mcq">MCQ (auto-graded)</option>
                    <option value="practical">Practical (human review)</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Difficulty</Label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(Number(e.target.value))}
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {[1, 2, 3, 4, 5].map((d) => (
                      <option key={d} value={d}>{d} — {DIFFICULTY_LABELS[d]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Time estimate (seconds)</Label>
                  <Input
                    type="number"
                    min={15}
                    max={1800}
                    value={time}
                    onChange={(e) => setTime(Number(e.target.value))}
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Prompt</Label>
                <Textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="The question shown to the employee." className="mt-1" />
              </div>
              {qType === "mcq" ? (
                <div className="space-y-2">
                  <Label className="text-xs">Options (mark the correct one)</Label>
                  {options.map((o, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="correct"
                        checked={correctOption === o && o.trim() !== ""}
                        onChange={() => setCorrectOption(o)}
                        disabled={!o.trim()}
                      />
                      <Input
                        value={o}
                        onChange={(e) => {
                          const next = [...options];
                          const prev = next[i];
                          next[i] = e.target.value;
                          if (prev === correctOption) setCorrectOption(e.target.value);
                          setOptions(next);
                        }}
                        placeholder={`Option ${i + 1}`}
                      />
                      {options.length > 2 && (
                        <Button size="sm" variant="ghost" type="button" onClick={() => {
                          const next = options.filter((_, j) => j !== i);
                          if (correctOption === o) setCorrectOption("");
                          setOptions(next);
                        }}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                  {options.length < 6 && (
                    <Button size="sm" variant="ghost" type="button" onClick={() => setOptions([...options, ""])}>
                      <Plus className="h-3.5 w-3.5" />Add option
                    </Button>
                  )}
                </div>
              ) : (
                <div>
                  <Label className="text-xs">Expected answer / grading notes (private to admin)</Label>
                  <Textarea
                    rows={3}
                    value={practicalAnswer}
                    onChange={(e) => setPracticalAnswer(e.target.value)}
                    placeholder="A short model answer the human reviewer will use to compare submissions."
                    className="mt-1"
                  />
                </div>
              )}
              <div>
                <Label className="text-xs">Grading rubric (optional, JSON)</Label>
                <Textarea
                  rows={2}
                  value={rubric}
                  onChange={(e) => setRubric(e.target.value)}
                  placeholder='{"correctness": 0.6, "clarity": 0.2, "edge_cases": 0.2}'
                  className="mt-1 font-mono text-xs"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={save} disabled={busy}>
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  {editingId ? "Save" : "Add question"}
                </Button>
                <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={busy}>Cancel</Button>
              </div>
            </div>
          ) : (
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" />Add question
            </Button>
          )}
        </CardContent>
      </Card>

      {/* List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>All questions</span>
            <div className="flex items-center gap-1 text-xs">
              <button onClick={() => setFilter("all")} className={`rounded-md px-2 py-1 ${filter === "all" ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}>All</button>
              <button onClick={() => setFilter("mcq")} className={`rounded-md px-2 py-1 ${filter === "mcq" ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}>MCQ</button>
              <button onClick={() => setFilter("practical")} className={`rounded-md px-2 py-1 ${filter === "practical" ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}>Practical</button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {visible.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              {questions.length === 0
                ? "No questions in this bank yet. Click 'Add question' above to create the first one."
                : "No questions match this filter."}
            </p>
          ) : (
            <ul className="divide-y">
              {visible.map((q) => (
                <li key={q.id} className="space-y-2 py-3">
                  <div className="flex items-start gap-2">
                    <Badge variant={q.question_type === "mcq" ? "outline" : "secondary"} className="text-[10px] capitalize">
                      {q.question_type}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      L{q.difficulty} · {DIFFICULTY_LABELS[q.difficulty]}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      <Clock className="mr-0.5 h-2.5 w-2.5" />{q.time_estimate_seconds}s
                    </Badge>
                    <div className="ml-auto flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => startEdit(q)}>
                        <Edit3 className="h-3.5 w-3.5" />Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => del(q.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm">{q.content.prompt}</p>
                  {q.question_type === "mcq" && q.content.options && (
                    <ul className="ml-2 space-y-0.5 text-xs">
                      {q.content.options.map((o, i) => (
                        <li key={i} className={o === q.correct_answer?.option ? "text-emerald-700" : "text-muted-foreground"}>
                          {o === q.correct_answer?.option ? "✓ " : "○ "}{o}
                        </li>
                      ))}
                    </ul>
                  )}
                  {q.question_type === "practical" && q.correct_answer?.expected && (
                    <p className="rounded-md border border-dashed bg-muted/30 p-2 text-[11px] text-muted-foreground">
                      <strong>Expected:</strong> {q.correct_answer.expected}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {questions.length > 0 && questions.length < 12 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-800">
          <AlertCircle className="mr-1 inline h-3.5 w-3.5" />
          <strong>Heads up:</strong> the test runner picks 8 MCQ + 2 practical per attempt.
          With fewer than 12 questions the same questions repeat too often. Aim for at least 12 MCQ + 6 practical.
        </div>
      )}
    </div>
  );
}
