/**
 * lib/schemas.ts — Zod schemas shared between client (form validation) and
 * server (request validation). Never trust client-side validation alone.
 */

import { z } from "zod";
import { TIER_A_PRICING_MODELS, TIER_B_PRICING_MODELS } from "./constants";

const phoneE164 = /^\+?[1-9]\d{6,14}$/;
const aadhaar = /^\d{12}$/;
const pan = /^[A-Z]{5}\d{4}[A-Z]$/;
const passport = /^[A-PR-WY]\d{7}$/;
const dl = /^[A-Z]{2}\d{13}$/;

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

export const SignInSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().regex(phoneE164).optional(),
  password: z.string().min(8).optional(),
  otp: z.string().length(6).optional(),
}).refine(d => d.email || d.phone, { message: "Email or phone is required" });

export const SignUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().min(2).max(80),
  phone: z.string().regex(phoneE164).optional(),
  role_intent: z.enum(["buyer", "employee", "both", "business"]),
});

/* ------------------------------------------------------------------ */
/* Onboarding                                                          */
/* ------------------------------------------------------------------ */

export const EmployeeProfileSchema = z.object({
  bio: z.string().min(20).max(800),
  languages: z.array(z.string().min(2).max(40)).min(1).max(10),
  location: z.string().min(2).max(120),
  experience_type: z.enum(["experienced", "fresher"]),
});

export const VerificationSchema = z.object({
  doc_type: z.enum(["aadhaar", "pan", "passport", "dl", "gstin", "bank"]),
  doc_number: z.string().min(6).max(40),
  selfie_b64: z.string().optional(),
  purpose: z.enum(["employee", "buyer"]).default("employee"),
  /** Optional metadata. For bank, { ifsc, account_holder, penny_drop_code }. */
  metadata: z.record(z.string(), z.any()).optional(),
});

/* ------------------------------------------------------------------ */
/* Business profile (legal entity)                                     */
/* ------------------------------------------------------------------ */

const panRe = /^[A-Z]{5}\d{4}[A-Z]$/;
const gstinRe = /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}\d{1}Z[A-Z\d]{1}$/;
const cinRe = /^[UL]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/;
const llpinRe = /^[A-Z]{3}-\d{4}$/;
const pincodeRe = /^\d{6}$/;

export const BusinessProfileSchema = z.object({
  legal_name: z.string().min(2).max(160),
  brand_name: z.string().max(80).optional().or(z.literal("")),
  entity_type: z.enum([
    "sole_proprietorship", "partnership", "llp", "private_limited",
    "public_limited", "society", "trust", "huf", "other",
  ]),
  pan: z.string().regex(panRe, "PAN must be 10 chars (e.g. ABCDE1234F)").transform(s => s.toUpperCase()),
  gstin: z.string().regex(gstinRe, "GSTIN must be 15 chars").optional().or(z.literal("")).transform(s => s?.toUpperCase()),
  cin: z.string().regex(cinRe, "CIN format looks wrong").optional().or(z.literal("")),
  llpin: z.string().regex(llpinRe, "LLPIN format looks wrong (e.g. AAA-1234)").optional().or(z.literal("")),
  incorporation_date: z.string().optional().or(z.literal("")),
  registered_address: z.string().min(5).max(500),
  operating_address: z.string().max(500).optional().or(z.literal("")),
  city: z.string().min(2).max(80),
  state: z.string().min(2).max(80),
  pincode: z.string().regex(pincodeRe, "Pincode must be 6 digits").optional().or(z.literal("")),
  country: z.string().default("India"),
  website: z.string().url().optional().or(z.literal("")),
  industry: z.string().max(80).optional().or(z.literal("")),
  employee_count_band: z.enum(["1", "2-10", "11-50", "51-200", "201-1000", "1000+"]).optional(),
  description: z.string().max(2000).optional().or(z.literal("")),
});

/* ------------------------------------------------------------------ */
/* Task posts                                                          */
/* ------------------------------------------------------------------ */

/**
 * `nanToUndefined` — preprocess that converts JS NaN (which a
 * react-hook-form `valueAsNumber: true` field sends when the <input>
 * isn't rendered or is empty) into `undefined` so the downstream
 * `.optional()` chain accepts it. Without this, NaN reaches the
 * number schema and validation fails with "Expected number, received nan".
 */
const nanToUndefined = (v: unknown) => (typeof v === "number" && Number.isNaN(v) ? undefined : v);

export const TaskPostSchema = z.object({
  category_id: z.string().uuid(),
  title: z.string().min(8).max(120),
  description: z.string().min(40).max(8000),
  pricing_model: z.enum([...TIER_A_PRICING_MODELS, ...TIER_B_PRICING_MODELS] as [string, ...string[]]),
  budget_min: z.preprocess(nanToUndefined, z.number({ invalid_type_error: "Enter a budget amount" }).int().positive()),
  budget_max: z.preprocess(nanToUndefined, z.number({ invalid_type_error: "Enter a budget amount" }).int().positive()),
  deadline: z.preprocess(
    (v) => {
      if (typeof v !== "string" || v.length === 0) return undefined;
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(v)) {
        return new Date(v).toISOString();
      }
      return v;
    },
    z.string().datetime().optional(),
  ).refine((v) => !v || new Date(v) > new Date(), { message: "Deadline must be in the future", path: ["deadline"] }),
  estimated_hours: z.preprocess(
    nanToUndefined,
    z.number().positive().max(720).optional(),
  ),
  scheduled_publish_at: z.string().optional(),
  show_in_upcoming: z.boolean().default(true),
  openings: z.coerce.number().int().min(1).max(50).default(1),
}).refine(d => d.budget_max >= d.budget_min, {
  message: "Max budget must be ≥ min budget",
  path: ["budget_max"],
});

export const MilestoneSchema = z.object({
  description: z.string().min(5).max(400),
  amount: z.number().int().positive(),
  due_date: z.preprocess(
    (v) => {
      if (typeof v !== "string" || v.length === 0) return undefined;
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(v)) {
        return new Date(v).toISOString();
      }
      return v;
    },
    z.string().datetime().optional(),
  ),
});

/* ------------------------------------------------------------------ */
/* Reviews                                                             */
/* ------------------------------------------------------------------ */

export const ReviewSchema = z.object({
  contract_id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
});

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export const AadhaarSchema = z.string().regex(aadhaar, "Aadhaar must be 12 digits");
export const PANSchema = z.string().regex(pan, "Invalid PAN format");
export const PassportSchema = z.string().regex(passport, "Invalid passport format");
export const DLSchema = z.string().regex(dl, "Invalid driving-license format");

/* ------------------------------------------------------------------ */
/* Business signup (separate from individual signup)                   */
/* ------------------------------------------------------------------ */

export const BusinessSignupSchema = z.object({
  // Business details
  legal_name: z.string().min(2).max(160),
  brand_name: z.string().max(80).optional().or(z.literal("")),
  entity_type: z.enum([
    "sole_proprietorship", "partnership", "llp", "private_limited",
    "public_limited", "society", "trust", "huf", "other",
  ]),
  pan: z.string().regex(panRe, "Business PAN must be 10 chars (e.g. ABCDE1234F)").transform(s => s.toUpperCase()),
  gstin: z.string().regex(gstinRe, "GSTIN must be 15 chars").optional().or(z.literal("")).transform(s => s?.toUpperCase()),
  website: z.string().url().optional().or(z.literal("")),
  // Work login
  work_email: z.string().email("Enter a valid work email"),
  work_phone: z.string().regex(/^\+?[1-9]\d{6,14}$/, "Use international format: +91XXXXXXXXXX"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  // Authorised signatory / contact
  contact_name: z.string().min(2).max(80),
  contact_role: z.enum(["owner", "director", "authorised_signatory", "hr", "manager", "other"]),
  contact_phone: z.string().regex(/^\+?[1-9]\d{6,14}$/, "Use international format: +91XXXXXXXXXX"),
});

export type SignUp = z.infer<typeof SignUpSchema>;
export type BusinessSignup = z.infer<typeof BusinessSignupSchema>;
export type TaskPost = z.infer<typeof TaskPostSchema>;
export type Milestone = z.infer<typeof MilestoneSchema>;
export type Review = z.infer<typeof ReviewSchema>;
