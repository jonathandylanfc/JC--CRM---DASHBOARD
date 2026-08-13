ALTER TABLE savings_goals
  ADD COLUMN IF NOT EXISTS goal_type text DEFAULT 'savings' CHECK (goal_type IN ('savings', 'debt')),
  ADD COLUMN IF NOT EXISTS debt_principal numeric(10,2),
  ADD COLUMN IF NOT EXISTS debt_interest_rate numeric(6,4),
  ADD COLUMN IF NOT EXISTS debt_monthly_payment numeric(10,2);
