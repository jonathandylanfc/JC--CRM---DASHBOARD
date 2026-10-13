CREATE TABLE IF NOT EXISTS retirement_contributions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  contribution_per_paycheck numeric NOT NULL DEFAULT 0,
  pay_frequency text NOT NULL DEFAULT 'biweekly'
    CHECK (pay_frequency IN ('weekly', 'biweekly', 'semimonthly', 'monthly')),
  employer_match_pct numeric NOT NULL DEFAULT 0,
  current_balance numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE retirement_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own retirement_contributions"
  ON retirement_contributions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
