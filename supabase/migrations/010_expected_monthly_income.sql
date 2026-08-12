-- Allow users to set an expected monthly income for mid-month budget projections
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS expected_monthly_income numeric(10,2);
