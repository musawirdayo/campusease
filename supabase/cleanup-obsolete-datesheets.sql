-- CampusEase · one-time cleanup of OBSOLETE exam datesheets.
-- The Spring 2026 CS exams are over and the built-in datesheet has changed to
-- the new FA26 mid-datesheet layout, so old documents should no longer reach
-- students. Run in Supabase → SQL Editor. REVIEW the SELECT first!
--
-- Option A (recommended): archive them (keeps history, students stop seeing them)
UPDATE public.schedule_documents
SET status = 'archived', published_at = NULL, updated_at = now()
WHERE kind = 'datesheet'
  AND status = 'published';

-- Option B: hard-delete everything datesheet-shaped (irreversible!)
-- DELETE FROM public.schedule_documents WHERE kind = 'datesheet';

-- Check what remains:
SELECT kind, status, title, version, departments.name, updated_at
FROM public.schedule_documents
LEFT JOIN departments ON departments.id = schedule_documents.department_id
ORDER BY updated_at DESC;
