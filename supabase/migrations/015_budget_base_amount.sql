-- Add base_amount to budget_categories for "fixed_plus_percentage" type
-- e.g. $440 car payment + 4% of income toward extra payment
ALTER TABLE budget_categories ADD COLUMN IF NOT EXISTS base_amount numeric DEFAULT NULL;
