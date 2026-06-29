-- 0112: Add cancellation_policy to contracts and task_posts
-- "cancellable" = permit cancellation with deliverable-based refund math
-- "non-cancellable" = no refunds or cancellations permitted

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS cancellation_policy text NOT NULL DEFAULT 'cancellable'
  CHECK (cancellation_policy IN ('cancellable', 'non-cancellable'));

ALTER TABLE task_posts
  ADD COLUMN IF NOT EXISTS cancellation_policy text NOT NULL DEFAULT 'cancellable'
  CHECK (cancellation_policy IN ('cancellable', 'non-cancellable'));
