-- Allow the paycheck estimator to exclude events from another person's schedule
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS shift_exclude_keyword text;
