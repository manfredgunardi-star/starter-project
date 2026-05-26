-- ============================================================
-- Migration 005: Journal Period Trigger
-- ============================================================
-- Enforce open accounting periods at the table layer so manual journal
-- saves cannot bypass the client-side period check.

CREATE OR REPLACE FUNCTION public.enforce_journal_period_open()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._ensure_period_open(NEW.date);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_journal_period_not_closed ON public.journals;

CREATE TRIGGER check_journal_period_not_closed
  BEFORE INSERT OR UPDATE ON public.journals
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_journal_period_open();
