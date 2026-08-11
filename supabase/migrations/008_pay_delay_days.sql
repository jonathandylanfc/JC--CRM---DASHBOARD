-- Days between pay period end and when the paycheck is actually received
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pay_delay_days integer DEFAULT 0;
