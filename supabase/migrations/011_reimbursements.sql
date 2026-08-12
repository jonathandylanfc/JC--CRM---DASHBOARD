-- Tag income/transfer transactions as reimbursements for a specific budget category
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reimburses_category_id uuid REFERENCES budget_categories(id) ON DELETE SET NULL;
