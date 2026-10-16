ALTER TABLE retirement_contributions
  ADD COLUMN IF NOT EXISTS pending_cash numeric NOT NULL DEFAULT 0;
