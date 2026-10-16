ALTER TABLE retirement_contributions
  ADD COLUMN IF NOT EXISTS offering_period_end date;
