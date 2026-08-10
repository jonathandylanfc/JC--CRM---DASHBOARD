-- Auto-detect savings contributions and budget payments from transfer transactions
ALTER TABLE savings_goals ADD COLUMN IF NOT EXISTS transfer_keywords text;
ALTER TABLE budget_categories ADD COLUMN IF NOT EXISTS transfer_keywords text;
