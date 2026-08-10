-- Add paycheck estimator settings to user profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hourly_rate numeric(8,2);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pay_period text DEFAULT 'biweekly';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS shift_keyword text DEFAULT 'Work';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tax_rate numeric(4,1) DEFAULT 25;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pay_period_start_date date;
