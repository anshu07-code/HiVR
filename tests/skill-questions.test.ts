import { describe, it, expect } from "vitest";
import {
  selectQuestions,
  gradeAttempt,
  redactQuestion,
  DEFAULT_TEST_CONFIG,
  type StoredQuestion,
} from "@/lib/skill-questions";

const BANK: StoredQuestion[] = [
  // 12 MCQ, 6 practical
  ...Array.from({ length: 12 }).map((_, i): StoredQuestion => ({
    id: `mcq-${i + 1}`,
    question_type: "mcq",
    content: {
      prompt: `Q${i + 1}?`,
      options: ["A", "B", "C", "D"],
    },
    correct_answer: { option: "A" },
    difficulty: ((i % 5) + 1) as 1 | 2 | 3 | 4 | 5,
    time_estimate_seconds: 60,
  })),
  ...Array.from({ length: 6 }).map((_, i): StoredQuestion => ({
    id: `prac-${i + 1}`,
    question_type: "practical",
    content: { prompt: `Practical ${i + 1}` },
    correct_answer: { expected: "model answer" },
    difficulty: ((i % 5) + 1) as 1 | 2 | 3 | 4 | 5,
    time_estimate_seconds: 300,
  })),
];

describe("selectQuestions", () => {
  it("returns the configured number of MCQ and practical", () => {
    const selected = selectQuestions(BANK, "attempt-1", { ...DEFAULT_TEST_CONFIG, mcq_count: 8, practical_count: 2 });
    expect(selected.filter((q) => q.question_type === "mcq").length).toBe(8);
    expect(selected.filter((q) => q.question_type === "practical").length).toBe(2);
    expect(selected.length).toBe(10);
  });

  it("is deterministic: same attempt id → same selection", () => {
    const a = selectQuestions(BANK, "attempt-X", { ...DEFAULT_TEST_CONFIG, mcq_count: 5, practical_count: 1 });
    const b = selectQuestions(BANK, "attempt-X", { ...DEFAULT_TEST_CONFIG, mcq_count: 5, practical_count: 1 });
    expect(a.map((q) => q.id)).toEqual(b.map((q) => q.id));
  });

  it("different attempt ids usually give different selections", () => {
    const a = selectQuestions(BANK, "attempt-A", { ...DEFAULT_TEST_CONFIG, mcq_count: 8, practical_count: 2 });
    const b = selectQuestions(BANK, "attempt-B", { ...DEFAULT_TEST_CONFIG, mcq_count: 8, practical_count: 2 });
    // Not a strict test (could collide by chance with small banks) but very unlikely
    expect(a.map((q) => q.id).join()).not.toBe(b.map((q) => q.id).join());
  });

  it("respects max_difficulty filter", () => {
    const selected = selectQuestions(BANK, "attempt-Z", { ...DEFAULT_TEST_CONFIG, max_difficulty: 2 });
    expect(selected.every((q) => q.difficulty <= 2)).toBe(true);
  });

  it("clamps gracefully if more requested than available", () => {
    const tiny = BANK.slice(0, 3);
    const selected = selectQuestions(tiny, "attempt-tiny", { ...DEFAULT_TEST_CONFIG, mcq_count: 8, practical_count: 2 });
    expect(selected.length).toBeLessThanOrEqual(3);
  });
});

describe("gradeAttempt", () => {
  it("scores 100% when all MCQ answered correctly", () => {
    const mcq = BANK.filter((q) => q.question_type === "mcq").slice(0, 5);
    const answers: Record<string, any> = {};
    for (const q of mcq) answers[q.id] = "A";
    const r = gradeAttempt(mcq, answers);
    expect(r.correct_count).toBe(5);
    expect(r.total_count).toBe(5);
    expect(r.score).toBe(1);
    expect(r.passed).toBe(true);
  });

  it("scores 0% when all MCQ answered wrong", () => {
    const mcq = BANK.filter((q) => q.question_type === "mcq").slice(0, 5);
    const answers: Record<string, any> = {};
    for (const q of mcq) answers[q.id] = "B";
    const r = gradeAttempt(mcq, answers);
    expect(r.correct_count).toBe(0);
    expect(r.score).toBe(0);
    expect(r.passed).toBe(false);
  });

  it("passes at the 70% threshold (exactly)", () => {
    const mcq = BANK.filter((q) => q.question_type === "mcq").slice(0, 10);
    const answers: Record<string, any> = {};
    for (let i = 0; i < mcq.length; i++) answers[mcq[i].id] = i < 7 ? "A" : "B";
    const r = gradeAttempt(mcq, answers);
    expect(r.score).toBe(0.7);
    expect(r.passed).toBe(true);
  });

  it("fails at 60% (below 70% threshold)", () => {
    const mcq = BANK.filter((q) => q.question_type === "mcq").slice(0, 10);
    const answers: Record<string, any> = {};
    for (let i = 0; i < mcq.length; i++) answers[mcq[i].id] = i < 6 ? "A" : "B";
    const r = gradeAttempt(mcq, answers);
    expect(r.score).toBe(0.6);
    expect(r.passed).toBe(false);
  });

  it("practical questions without admin_score are pending and excluded from score", () => {
    const prac = BANK.filter((q) => q.question_type === "practical").slice(0, 2);
    const mcq = BANK.filter((q) => q.question_type === "mcq").slice(0, 2);
    const answers: Record<string, any> = {
      [mcq[0].id]: "A",
      [mcq[1].id]: "B",
      [prac[0].id]: { text: "my answer" },
      [prac[1].id]: { text: "another answer" },
    };
    const r = gradeAttempt([...mcq, ...prac], answers);
    expect(r.pending_practical).toBe(2);
    expect(r.total_count).toBe(2); // only MCQ count
    expect(r.correct_count).toBe(1);
    expect(r.score).toBe(0.5);
  });

  it("practical questions with admin_score >= 0.7 count as correct", () => {
    const prac = BANK.filter((q) => q.question_type === "practical").slice(0, 2);
    const answers: Record<string, any> = {
      [prac[0].id]: { text: "ok", admin_score: 0.8 },
      [prac[1].id]: { text: "meh", admin_score: 0.5 },
    };
    const r = gradeAttempt(prac, answers);
    expect(r.pending_practical).toBe(0);
    expect(r.correct_count).toBe(1);
    expect(r.total_count).toBe(2);
    expect(r.score).toBe(0.5);
  });

  it("handles empty bank gracefully", () => {
    const r = gradeAttempt([], {});
    expect(r.score).toBe(0);
    expect(r.total_count).toBe(0);
    expect(r.passed).toBe(false);
  });
});

describe("redactQuestion", () => {
  it("removes correct_answer and grading_rubric", () => {
    const q: StoredQuestion = {
      id: "x",
      question_type: "mcq",
      content: { prompt: "Q", options: ["A", "B"] },
      correct_answer: { option: "A" },
      grading_rubric: { foo: 1 },
      difficulty: 1,
      time_estimate_seconds: 60,
    };
    const r = redactQuestion(q);
    expect((r as any).correct_answer).toBeUndefined();
    expect((r as any).grading_rubric).toBeUndefined();
    expect(r.id).toBe("x");
    expect(r.content.prompt).toBe("Q");
  });
});
