-- Fix existing transactions where "Payment to [Bank] card ending in ..."
-- was classified as expense instead of transfer.
UPDATE transactions
SET type = 'transfer'
WHERE
  type = 'expense'
  AND lower(title) ~ 'payment\s+to\s+.{0,40}card(\s+ending)?';
