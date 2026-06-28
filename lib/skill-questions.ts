/**
 * lib/skill-questions.ts
 *
 * Helpers for selecting and grading the skill test. Used by the test
 * runner UI and the admin question bank page (for live previews).
 *
 * Pure functions, no I/O. All randomness is seeded from the test
 * attempt id so every attempt gets a stable, deterministic selection
 * (re-loading the page doesn't reshuffle the questions).
 */

export type StoredQuestion = {
  id: string;
  question_type: "mcq" | "practical";
  content: { prompt: string; options?: string[]; wage_band?: { min: number; max: number } } & Record<string, any>;
  correct_answer?: any;  // Only present on the admin-side row; not exposed to employees
  grading_rubric?: any;
  difficulty: number;
  time_estimate_seconds: number;
};

export type TestConfig = {
  // Number of MCQ questions to draw.
  mcq_count: number;
  // Number of practical questions to draw.
  practical_count: number;
  // Pass threshold (0-1). Default 0.7.
  pass_threshold?: number;
  // Max difficulty (1-5). Default 5 (any).
  max_difficulty?: number;
  // Total time budget in seconds (display only; not enforced server-side).
  total_time_seconds?: number;
};

export const DEFAULT_TEST_CONFIG: TestConfig = {
  mcq_count: 8,
  practical_count: 2,
  pass_threshold: 0.7,
  max_difficulty: 5,
  total_time_seconds: 30 * 60,
};

/**
 * Tiny deterministic PRNG seeded from a string. Used so each attempt
 * gets a stable question order.
 */
function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

function pickN<T>(arr: T[], n: number, rand: () => number): T[] {
  if (n >= arr.length) return [...arr];
  // Fisher-Yates partial shuffle with the seeded RNG.
  const out = arr.slice();
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rand() * (out.length - i));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.slice(0, n);
}

/**
 * Pick the questions for a test attempt. Stable: the same attemptId
 * always returns the same selection.
 */
export function selectQuestions(
  bank: StoredQuestion[],
  attemptId: string,
  config: TestConfig = DEFAULT_TEST_CONFIG,
): StoredQuestion[] {
  const rand = seededRandom(attemptId);
  const filtered = bank.filter((q) => q.difficulty <= (config.max_difficulty ?? 5));
  const mcq = filtered.filter((q) => q.question_type === "mcq");
  const practical = filtered.filter((q) => q.question_type === "practical");
  return [
    ...pickN(mcq, config.mcq_count, rand),
    ...pickN(practical, config.practical_count, rand),
  ];
}

/**
 * Grade an attempt. Returns:
 *   - score: 0-1
 *   - passed: boolean
 *   - correct_count, total_count
 *   - per_question: { id, correct: boolean, points: number }
 *
 * MCQ questions are auto-graded (full point if option matches, 0 otherwise).
 * Practical questions are NOT auto-graded here; they need a human (admin).
 * For attempts that have not been human-graded, the practical questions
 * are counted as "pending" and the score is the MCQ-only rate.
 */
export function gradeAttempt(
  questions: StoredQuestion[],
  answers: Record<string, any>,
  config: TestConfig = DEFAULT_TEST_CONFIG,
): {
  score: number;
  passed: boolean;
  correct_count: number;
  total_count: number;
  pending_practical: number;
  per_question: { id: string; type: "mcq" | "practical"; correct: boolean | null; points: number }[];
} {
  const threshold = config.pass_threshold ?? 0.7;
  let correct = 0;
  let total = 0;
  let pendingPractical = 0;
  const per_question: { id: string; type: "mcq" | "practical"; correct: boolean | null; points: number }[] = [];

  for (const q of questions) {
    const a = answers[q.id];
    if (q.question_type === "mcq") {
      const expected = q.correct_answer?.option;
      const got = a?.option ?? a;
      const isCorrect = expected != null && got != null && String(expected) === String(got);
      per_question.push({ id: q.id, type: "mcq", correct: isCorrect, points: isCorrect ? 1 : 0 });
      if (isCorrect) correct += 1;
      total += 1;
    } else {
      // Practical: mark as pending unless the admin has filled in
      // `answers[q.id].admin_score` (a 0-1 number).
      const adminScore = a?.admin_score;
      if (typeof adminScore === "number") {
        const isCorrect = adminScore >= 0.7;
        per_question.push({ id: q.id, type: "practical", correct: isCorrect, points: adminScore });
        if (isCorrect) correct += 1;
        total += 1;
      } else {
        per_question.push({ id: q.id, type: "practical", correct: null, points: 0 });
        pendingPractical += 1;
        // Don't count toward score yet
      }
    }
  }
  const score = total > 0 ? correct / total : 0;
  const passed = total > 0 && score >= threshold;
  return { score, passed, correct_count: correct, total_count: total, pending_practical: pendingPractical, per_question };
}

/**
 * Strip the correct_answer field from a question before sending it to an
 * employee-facing API. Defense-in-depth: even if RLS is misconfigured,
 * the client never sees the right answer.
 */
export function redactQuestion<T extends StoredQuestion>(q: T): Omit<T, "correct_answer" | "grading_rubric"> {
  const { correct_answer: _ca, grading_rubric: _gr, ...rest } = q;
  return rest as any;
}
