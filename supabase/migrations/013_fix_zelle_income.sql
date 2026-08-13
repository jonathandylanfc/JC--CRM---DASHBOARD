-- Fix existing transactions where "Zelle payment from ..." was incorrectly
-- classified as expense or transfer. These are always incoming payments (income).
UPDATE transactions
SET
  type = 'income',
  category = CASE WHEN category = 'transfer' THEN 'income' ELSE category END
WHERE
  lower(title) ~ 'zelle.*from'
  AND type IN ('expense', 'transfer');
