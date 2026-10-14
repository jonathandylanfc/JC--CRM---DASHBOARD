ALTER TABLE retirement_contributions
  ADD COLUMN IF NOT EXISTS tax_bracket_pct numeric NOT NULL DEFAULT 0;
