-- أزل تكرارات الحفظ التاريخية مع إبقاء أحدث نسخة لكل موضع.
DELETE FROM public.messages older
USING public.messages newer
WHERE older.project_id = newer.project_id
  AND older.position = newer.position
  AND (older.created_at, older.id) < (newer.created_at, newer.id);

-- يمنع أي عمليتي حفظ متزامنتين من إنشاء الموضع نفسه مجدداً.
CREATE UNIQUE INDEX IF NOT EXISTS messages_project_position_unique
  ON public.messages(project_id, position);

ANALYZE public.messages;