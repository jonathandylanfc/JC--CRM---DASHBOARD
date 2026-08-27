-- Drop the existing type check constraint and add one that includes
-- the new 'fixed_plus_percentage' type
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'budget_categories'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%type%'
  LOOP
    EXECUTE 'ALTER TABLE budget_categories DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
  END LOOP;
END $$;

ALTER TABLE budget_categories
  ADD CONSTRAINT budget_categories_type_check
  CHECK (type IN ('percentage', 'fixed', 'fixed_plus_percentage'));
