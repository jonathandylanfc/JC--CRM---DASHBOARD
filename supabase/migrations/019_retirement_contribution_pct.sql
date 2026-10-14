ALTER TABLE retirement_contributions
  ADD COLUMN IF NOT EXISTS contribution_pct numeric;
