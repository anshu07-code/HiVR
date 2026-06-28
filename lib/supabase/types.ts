// Generated from supabase/migrations/0001_init.sql. Keep in sync by hand for now;
// later, wire to `supabase gen types typescript`.
//
// This file exists so our typed clients (lib/supabase/*.ts) compile. If you
// change the schema, update the types here too.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [k: string]: Json | undefined }
  | Json[];

export type UserRole = "buyer" | "employee" | "admin" | "business";
export type ExperienceType = "experienced" | "fresher";
export type TrustTier = "provisional" | "verified" | "track_record" | "top_rated";
export type DocType = "aadhaar" | "pan" | "passport" | "dl";
export type VerificationStatus = "pending" | "verified" | "rejected";
export type CategoryTier = "micro_task" | "role_engagement";
export type CategoryStatus = "active" | "coming_soon";
export type SkillVerificationStatus = "provisional" | "verified" | "experienced" | "top_rated";
export type QuestionType = "mcq" | "practical";
export type PricingModel =
  | "hourly"
  | "daily"
  | "monthly"
  | "fixed"
  | "daily_rate"
  | "fixed_milestone";
export type ContractStatus =
  | "active"
  | "delivered"
  | "disputed"
  | "completed"
  | "cancelled";
export type MilestoneStatus = "pending" | "delivered" | "approved" | "paid";
export type PaymentStatus =
  | "created"
  | "authorized"
  | "captured"
  | "in_escrow"
  | "released"
  | "refunded"
  | "disputed"
  | "failed";
export type PointsReason =
  | "task_completed"
  | "redeemed_for_discount"
  | "admin_adjustment"
  | "signup_bonus"
  | "review_left";
export type InterviewStatus = "scheduled" | "completed" | "no_show" | "cancelled";
export type AdminRole = "super_admin" | "finance_admin" | "trust_safety_admin" | "support_admin";
export type BuyerType = "individual" | "business";

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string | null;
          phone: string | null;
          full_name: string | null;
          avatar_url: string | null;
          roles: UserRole[];
          theme_preference: "light" | "dark" | "eye_shield" | "automatic";
          current_mode: "buyer" | "employee" | null;
          is_suspended: boolean;
          suspension_reason: string | null;
          contact_warning_count: number;
          created_at: string;
          last_active: string;
          strike_count: number;
          buyer_penalty_paise: number;
          dob: string | null;
          is_minor: boolean;
          fampay_handle: string | null;
          parent_user_id: string | null;
          parent_consent_at: string | null;
          minor_yearly_contracts: number;
          minor_yearly_reset_at: string;
          minor_daily_earnings_paise: number;
          minor_daily_reset_at: string;
          minor_payout_hold_until: string | null;
          upi_id: string | null;
          upi_provider_name: string | null;
          upi_verified_at: string | null;
          upi_verified_payment_id: string | null;
          account_holder: string | null;
          account_last4: string | null;
          ifsc: string | null;
          bank_verified_at: string | null;
        };
        Insert: Omit<Database["public"]["Tables"]["users"]["Row"], "id" | "created_at" | "last_active" | "contact_warning_count"> & {
          id?: string;
          contact_warning_count?: number;
          created_at?: string;
          last_active?: string;
        };
        Update: Partial<Database["public"]["Tables"]["users"]["Insert"]>;
      };
      employee_profiles: {
        Row: {
          user_id: string;
          bio: string | null;
          languages: string[];
          location: string | null;
          experience_type: ExperienceType;
          overall_trust_tier: TrustTier;
          avg_rating: number;
          total_reviews: number;
          completion_rate: number;
          response_time_avg_minutes: number;
          lifetime_earnings: number;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["employee_profiles"]["Row"], "created_at" | "avg_rating" | "total_reviews" | "completion_rate" | "response_time_avg_minutes" | "lifetime_earnings" | "overall_trust_tier"> & {
          avg_rating?: number;
          total_reviews?: number;
          completion_rate?: number;
          response_time_avg_minutes?: number;
          lifetime_earnings?: number;
          overall_trust_tier?: TrustTier;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["employee_profiles"]["Insert"]>;
      };
      buyer_profiles: {
        Row: {
          user_id: string;
          company_name: string | null;
          buyer_type: BuyerType;
          lifetime_spent: number;
          kyc_required_above: number;
          kyc_completed: boolean;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["buyer_profiles"]["Row"], "created_at" | "lifetime_spent" | "kyc_completed"> & {
          lifetime_spent?: number;
          kyc_completed?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["buyer_profiles"]["Insert"]>;
      };
      verifications: {
        Row: {
          id: string;
          user_id: string;
          doc_type: string;
          purpose: string;
          status: string;
          provider: string | null;
          provider_reference_id: string | null;
          metadata: Json;
          verified_at: string | null;
          created_at: string;
          session_id: string | null;
          minor_only: boolean;
        };
        Insert: Omit<Database["public"]["Tables"]["verifications"]["Row"], "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["verifications"]["Insert"]>;
      };
      skill_categories: {
        Row: {
          id: string;
          parent_category_id: string | null;
          name: string;
          slug: string;
          icon: string;
          description: string;
          tier: CategoryTier;
          status: CategoryStatus;
          sort_order: number;
          created_at: string;
          brief_template: Json;
        };
        Insert: Omit<Database["public"]["Tables"]["skill_categories"]["Row"], "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["skill_categories"]["Insert"]>;
      };
      employee_skills: {
        Row: {
          id: string;
          employee_id: string;
          category_id: string;
          verification_status: SkillVerificationStatus;
          tier: "provisional" | "verified" | "experienced" | "top_rated";
          current_wage_band_min: number;
          current_wage_band_max: number;
          last_tested_at: string | null;
          retake_available_at: string | null;
          contracts_in_skill: number;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["employee_skills"]["Row"], "id" | "created_at" | "contracts_in_skill"> & {
          id?: string;
          contracts_in_skill?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["employee_skills"]["Insert"]>;
      };
      skill_test_questions: {
        Row: {
          id: string;
          category_id: string;
          question_type: QuestionType;
          content: Json;
          correct_answer: Json;
          grading_rubric: Json | null;
          difficulty: 1 | 2 | 3 | 4 | 5;
          time_estimate_seconds: number;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["skill_test_questions"]["Row"], "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["skill_test_questions"]["Insert"]>;
      };
      skill_test_attempts: {
        Row: {
          id: string;
          employee_id: string;
          category_id: string;
          score: number;
          passed: boolean;
          proctoring_flags: Json;
          answers: Json;
          started_at: string;
          completed_at: string | null;
        };
        Insert: Omit<Database["public"]["Tables"]["skill_test_attempts"]["Row"], "id" | "started_at"> & {
          id?: string;
          started_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["skill_test_attempts"]["Insert"]>;
      };
      tier_b_interviews: {
        Row: {
          id: string;
          employee_id: string;
          category_id: string;
          interviewer_id: string | null;
          scheduled_at: string;
          status: InterviewStatus;
          scorecard: Json | null;
          passed: boolean | null;
          feedback: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["tier_b_interviews"]["Row"], "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["tier_b_interviews"]["Insert"]>;
      };
      task_posts: {
        Row: {
          id: string;
          buyer_id: string;
          category_id: string;
          title: string;
          description: string;
          pricing_model: PricingModel;
          budget_min: number;
          budget_max: number;
          deadline: string | null;
          estimated_hours: number | null;
          status: "open" | "in_contract" | "closed" | "cancelled" | "upcoming";
          attachments: Json;
          created_at: string;
          brief: Json;
          scope_flag: "standard" | "custom";
          incentive_condition_type: "time_based" | "checklist_based" | "rating_based" | null;
          incentive_threshold: string | null;
          incentive_amount_paise: number | null;
          openings: number;
        };
        Insert: Omit<Database["public"]["Tables"]["task_posts"]["Row"], "id" | "created_at" | "status"> & {
          id?: string;
          status?: "open" | "in_contract" | "closed" | "cancelled";
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["task_posts"]["Insert"]>;
      };
      contracts: {
        Row: {
          id: string;
          task_post_id: string | null;
          buyer_id: string;
          employee_id: string;
          category_id: string;
          tier: CategoryTier;
          pricing_model: PricingModel;
          agreed_price: number;
          platform_fee_pct: number;
          status: ContractStatus;
          escrow_payment_id: string | null;
          started_at: string;
          delivered_at: string | null;
          approved_at: string | null;
          revision_count: number;
          max_revisions: number;
          incentive_condition_type: "time_based" | "checklist_based" | "rating_based" | null;
          incentive_threshold: string | null;
          incentive_amount_paise: number | null;
          incentive_earned: boolean;
          incentive_paid_at: string | null;
          pushback_rounds_used: number;
          scope_flag: "standard" | "custom" | null;
        };
        Insert: Omit<Database["public"]["Tables"]["contracts"]["Row"], "id" | "started_at" | "revision_count" | "status"> & {
          id?: string;
          started_at?: string;
          revision_count?: number;
          status?: ContractStatus;
        };
        Update: Partial<Database["public"]["Tables"]["contracts"]["Insert"]>;
      };
      milestones: {
        Row: {
          id: string;
          contract_id: string;
          description: string;
          amount: number;
          status: MilestoneStatus;
          due_date: string | null;
          delivered_at: string | null;
          approved_at: string | null;
          paid_at: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["milestones"]["Row"], "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["milestones"]["Insert"]>;
      };
      payments: {
        Row: {
          id: string;
          contract_id: string;
          milestone_id: string | null;
          amount: number;
          platform_fee_amount: number;
          razorpay_payment_id: string | null;
          razorpay_route_transfer_id: string | null;
          status: PaymentStatus;
          escrow_released: boolean;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["payments"]["Row"], "id" | "created_at" | "escrow_released"> & {
          id?: string;
          escrow_released?: boolean;
          created_at?: string;
        };
        Update: never; // immutable — never UPDATE payment rows; only INSERT new status rows or use payment_status_history
      };
      payment_status_history: {
        Row: {
          id: string;
          payment_id: string;
          from_status: PaymentStatus | null;
          to_status: PaymentStatus;
          actor_id: string | null;
          reason: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["payment_status_history"]["Row"], "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: never;
      };
      tips: {
        Row: {
          id: string;
          contract_id: string;
          from_user_id: string;
          to_user_id: string;
          amount: number;
          platform_cut_pct: number;
          paid_at: string | null;
          flagged_for_review: boolean;
        };
        Insert: Omit<Database["public"]["Tables"]["tips"]["Row"], "id" | "flagged_for_review" | "paid_at"> & {
          id?: string;
          flagged_for_review?: boolean;
          paid_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["tips"]["Insert"]>;
      };
      reviews: {
        Row: {
          id: string;
          contract_id: string;
          reviewer_id: string;
          reviewee_id: string;
          rating: number;
          comment: string | null;
          is_verified_purchase: boolean;
          editable_until: string;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["reviews"]["Row"], "id" | "created_at" | "is_verified_purchase" | "editable_until"> & {
          id?: string;
          is_verified_purchase?: boolean;
          editable_until?: string;
          created_at?: string;
        };
        Update: never; // reviews are immutable after editable_until
      };
      loyalty_points: {
        Row: {
          employee_id: string;
          points_balance: number;
          lifetime_points_earned: number;
        };
        Insert: Database["public"]["Tables"]["loyalty_points"]["Row"];
        Update: never; // balance is only changed via points_ledger trigger
      };
      points_ledger: {
        Row: {
          id: string;
          employee_id: string;
          change_amount: number;
          reason: PointsReason;
          related_contract_id: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["points_ledger"]["Row"], "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: never;
      };
      messages: {
        Row: {
          id: string;
          contract_id: string | null;
          pre_contract_thread_id: string | null;
          sender_id: string;
          content: string;
          flagged_for_contact_info: boolean;
          blocked: boolean;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["messages"]["Row"], "id" | "created_at" | "flagged_for_contact_info" | "blocked"> & {
          id?: string;
          flagged_for_contact_info?: boolean;
          blocked?: boolean;
          created_at?: string;
        };
        Update: never;
      };
      disputes: {
        Row: {
          id: string;
          contract_id: string;
          raised_by: string;
          reason: string;
          status: "open" | "under_review" | "resolved_buyer" | "resolved_employee" | "split" | "closed";
          resolution: string | null;
          admin_handler_id: string | null;
          created_at: string;
          resolved_at: string | null;
          dispute_type: "scope_mismatch" | "item_level" | "general" | null;
          delivery_checklist_item_id: string | null;
          buyer_strike_applied: boolean;
          bad_faith_finding: "none" | "buyer" | "employee";
          raised_by_role: "buyer" | "employee" | null;
          contract_status_at_raise: string | null;
        };
        Insert: Omit<Database["public"]["Tables"]["disputes"]["Row"], "id" | "created_at" | "status"> & {
          id?: string;
          status?: "open" | "under_review" | "resolved_buyer" | "resolved_employee" | "split" | "closed";
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["disputes"]["Insert"]>;
      };
      category_rate_stats: {
        Row: {
          category_id: string;
          employee_tier: CategoryTier;
          size_bucket: string;
          computed_min: number;
          computed_max: number;
          sample_count: number;
          last_computed_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["category_rate_stats"]["Row"], "last_computed_at"> & {
          last_computed_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["category_rate_stats"]["Insert"]>;
      };
      employee_standing_rates: {
        Row: {
          user_id: string;
          category_id: string;
          tier: CategoryTier;
          standing_rate: number;
          computed_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["employee_standing_rates"]["Row"], "computed_at"> & {
          computed_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["employee_standing_rates"]["Insert"]>;
      };
      negotiation_offers: {
        Row: {
          id: string;
          task_post_id: string;
          employee_id: string;
          buyer_id: string;
          offer_type: "instant_hire_pushback" | "custom_scope_negotiation";
          round_number: number;
          proposed_price: number;
          comment: string | null;
          status: "pending" | "accepted" | "countered" | "declined" | "expired";
          created_by: string;
          created_at: string;
          responded_at: string | null;
        };
        Insert: Omit<Database["public"]["Tables"]["negotiation_offers"]["Row"], "id" | "created_at" | "status" | "round_number"> & {
          id?: string;
          status?: "pending" | "accepted" | "countered" | "declined" | "expired";
          round_number?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["negotiation_offers"]["Insert"]>;
      };
      delivery_checklist_items: {
        Row: {
          id: string;
          contract_id: string;
          brief_item_key: string;
          description: string;
          sort_order: number;
          status: "pending" | "done" | "not_done" | "disputed" | "resolved";
          buyer_comment: string | null;
          employee_response: string | null;
          employee_evidence_url: string | null;
          disputed: boolean;
          resolved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["delivery_checklist_items"]["Row"], "id" | "created_at" | "updated_at" | "status" | "disputed"> & {
          id?: string;
          status?: "pending" | "done" | "not_done" | "disputed" | "resolved";
          disputed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["delivery_checklist_items"]["Insert"]>;
      };
      dispute_evidence: {
        Row: {
          id: string;
          dispute_id: string;
          submitted_by: string;
          submitted_by_role: "buyer" | "employee" | "admin";
          evidence_type: "file" | "link" | "screenshot" | "log" | "text";
          content: string;
          file_url: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["dispute_evidence"]["Row"], "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["dispute_evidence"]["Insert"]>;
      };
      workspaces: {
        Row: {
          id: string;
          contract_id: string;
          buyer_id: string;
          employee_id: string;
          status: "awaiting_funding" | "funded" | "delivered" | "in_review" | "completed" | "frozen" | "cancelled";
          escrow_funded: boolean;
          escrow_amount_paise: number;
          escrow_provider: string | null;
          escrow_payment_id: string | null;
          funded_at: string | null;
          delivered_at: string | null;
          completed_at: string | null;
          chat_locked_at: string | null;
          freeze_reason: string | null;
          frozen_by: string | null;
          last_message_at: string | null;
          previous_workspace_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["workspaces"]["Row"], "id" | "created_at" | "updated_at" | "status" | "escrow_funded"> & {
          id?: string;
          status?: "awaiting_funding" | "funded" | "delivered" | "in_review" | "completed" | "frozen" | "cancelled";
          escrow_funded?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["workspaces"]["Insert"]>;
      };
      workspace_messages: {
        Row: {
          id: number;
          workspace_id: string;
          sender_id: string;
          body: string | null;
          is_flagged: boolean;
          is_ghosted: boolean;
          flag_reason: string | null;
          vault_resource_id: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["workspace_messages"]["Row"], "id" | "created_at" | "is_flagged" | "is_ghosted"> & {
          id?: number;
          is_flagged?: boolean;
          is_ghosted?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["workspace_messages"]["Insert"]>;
      };
      workspace_vault: {
        Row: {
          id: string;
          workspace_id: string;
          parent_id: string | null;
          is_folder: boolean;
          name: string;
          original_name: string | null;
          storage_object_id: string | null;
          file_size: number | null;
          mime_type: string | null;
          uploaded_by: string;
          flagged_for_review: boolean;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["workspace_vault"]["Row"], "id" | "created_at" | "is_folder" | "flagged_for_review"> & {
          id?: string;
          is_folder?: boolean;
          flagged_for_review?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["workspace_vault"]["Insert"]>;
      };
      workspace_events: {
        Row: {
          id: number;
          workspace_id: string;
          actor_id: string | null;
          kind: string;
          payload: Json;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["workspace_events"]["Row"], "id" | "created_at"> & {
          id?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["workspace_events"]["Insert"]>;
      };
      workspace_message_reads: {
        Row: {
          workspace_id: string;
          user_id: string;
          last_read_at: string;
        };
        Insert: Database["public"]["Tables"]["workspace_message_reads"]["Row"];
        Update: Partial<Database["public"]["Tables"]["workspace_message_reads"]["Row"]>;
      };
      verification_sessions: {
        Row: {
          id: string;
          user_id: string;
          kind: "adult_aadhaar" | "adult_pan" | "adult_passport" | "adult_dl" | "minor_school_id" | "minor_aadhaar" | "minor_parent_aadhaar";
          status: "in_progress" | "submitted" | "auto_approved" | "admin_review" | "approved" | "rejected" | "expired";
          dob: string | null;
          ocr_full_name: string | null;
          ocr_dob: string | null;
          ocr_document_number: string | null;
          ocr_document_hash: string | null;
          selfie_hash: string | null;
          liveness_challenges: Json;
          confidence_score: number | null;
          confidence_breakdown: Json;
          rejection_reason: string | null;
          reviewer_user_id: string | null;
          reviewed_at: string | null;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
          expires_at: string;
          submitted_at: string | null;
          resolved_at: string | null;
        };
        Insert: Omit<Database["public"]["Tables"]["verification_sessions"]["Row"], "id" | "created_at" | "expires_at" | "status"> & {
          id?: string;
          status?: "in_progress" | "submitted" | "auto_approved" | "admin_review" | "approved" | "rejected" | "expired";
          created_at?: string;
          expires_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["verification_sessions"]["Insert"]>;
      };
      verification_assets: {
        Row: {
          id: string;
          session_id: string;
          user_id: string;
          kind: "selfie" | "document" | "liveness_frame";
          storage_bucket: string;
          storage_path: string;
          mime_type: string | null;
          byte_size: number | null;
          perceptual_hash: string | null;
          meta: Json;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["verification_assets"]["Row"], "id" | "created_at" | "storage_bucket"> & {
          id?: string;
          created_at?: string;
          storage_bucket?: string;
        };
        Update: Partial<Database["public"]["Tables"]["verification_assets"]["Insert"]>;
      };
      verification_audit: {
        Row: {
          id: number;
          user_id: string | null;
          session_id: string | null;
          event: string;
          ip_address: string | null;
          user_agent: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["verification_audit"]["Row"], "id" | "created_at"> & {
          id?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["verification_audit"]["Insert"]>;
      };
      profile_videos: {
        Row: {
          id: string;
          user_id: string;
          storage_bucket: string;
          storage_path: string;
          thumbnail_path: string | null;
          caption: string;
          skill_category_id: string | null;
          duration_seconds: number;
          byte_size: number | null;
          is_public: boolean;
          flagged_for_review: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["profile_videos"]["Row"], "id" | "created_at" | "storage_bucket" | "is_public" | "flagged_for_review"> & {
          id?: string;
          created_at?: string;
          storage_bucket?: string;
          is_public?: boolean;
          flagged_for_review?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["profile_videos"]["Insert"]>;
      };
      bank_verifications: {
        Row: {
          id: string;
          user_id: string;
          amount_paise: number;
          upi_id: string;
          upi_provider: string | null;
          account_holder: string;
          ifsc: string;
          status: "pending" | "awaiting_payment" | "paid" | "failed" | "expired" | "rejected";
          payment_provider: string;
          payment_link_id: string | null;
          payment_id: string | null;
          paid_at: string | null;
          sandbox_code: string | null;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
          expires_at: string;
          resolved_at: string | null;
        };
        Insert: Omit<Database["public"]["Tables"]["bank_verifications"]["Row"], "id" | "created_at" | "expires_at" | "status" | "payment_provider" | "amount_paise"> & {
          id?: string;
          amount_paise?: number;
          payment_provider?: string;
          status?: "pending" | "awaiting_payment" | "paid" | "failed" | "expired" | "rejected";
          created_at?: string;
          expires_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["bank_verifications"]["Insert"]>;
      };
      bank_verification_audit: {
        Row: {
          id: number;
          user_id: string | null;
          bank_id: string | null;
          event: string;
          metadata: Json;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["bank_verification_audit"]["Row"], "id" | "created_at"> & {
          id?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["bank_verification_audit"]["Insert"]>;
      };
      category_waitlist: {
        Row: {
          id: string;
          user_id: string;
          category_id: string;
          role_interest: "buyer" | "employee";
          joined_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["category_waitlist"]["Row"], "id" | "joined_at"> & {
          id?: string;
          joined_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["category_waitlist"]["Insert"]>;
      };
      platform_settings: {
        Row: {
          key: string;
          value: Json;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: Omit<Database["public"]["Tables"]["platform_settings"]["Row"], "updated_at"> & {
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["platform_settings"]["Insert"]>;
      };
      admin_users: {
        Row: {
          user_id: string;
          admin_role: AdminRole;
          granted_at: string;
          granted_by: string | null;
        };
        Insert: Database["public"]["Tables"]["admin_users"]["Row"];
        Update: Partial<Database["public"]["Tables"]["admin_users"]["Insert"]>;
      };
      admin_audit_log: {
        Row: {
          id: string;
          actor_id: string;
          action: string;
          target_table: string | null;
          target_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["admin_audit_log"]["Row"], "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: never;
      };
      faq_documents: {
        Row: {
          id: string;
          title: string;
          content: string;
          category: string;
          embedding: number[] | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["faq_documents"]["Row"], "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["faq_documents"]["Insert"]>;
      };
      ai_response_cache: {
        Row: {
          id: string;
          question_hash: string;
          question: string;
          response: string;
          hit_count: number;
          created_at: string;
          last_used_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["ai_response_cache"]["Row"], "id" | "created_at" | "last_used_at" | "hit_count"> & {
          id?: string;
          hit_count?: number;
          created_at?: string;
          last_used_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["ai_response_cache"]["Insert"]>;
      };
    };
  };
};
