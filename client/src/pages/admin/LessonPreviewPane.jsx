import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { renderMd } from '../../lib/helpers.js';

/**
 * Read-only markdown preview pane for the lesson editor (NewLessonView).
 * Presentational only — all state is owned by NewLessonView. The preview is
 * refreshed manually (onRefresh runs the lesson-extractor agent); it is never
 * persisted until the admin clicks "Create/Update Lesson".
 */
export default function LessonPreviewPane({
  markdown,
  loading,
  error,
  stale,
  isCreate,
  refreshDisabled,
  onRefresh,
}) {
  const hasContent = !!markdown?.trim();
  const saveLabel = isCreate ? 'Create Lesson' : 'Update Lesson';
  // Before the first extraction there is nothing to refresh — it's a generate.
  const refreshLabel = loading
    ? (hasContent ? 'Refreshing…' : 'Generating…')
    : (hasContent ? 'Refresh preview' : 'Generate preview');
  const showStaleHint = stale && !loading;

  // Announce refresh start/finish to screen readers. Errors are announced by
  // the role="alert" region below, so the status region stays quiet on
  // failure to avoid a double announcement.
  const [announcement, setAnnouncement] = useState('');
  const wasLoading = useRef(loading);
  useEffect(() => {
    if (loading && !wasLoading.current) {
      setAnnouncement(hasContent ? 'Refreshing lesson preview' : 'Generating lesson preview');
    } else if (!loading && wasLoading.current) {
      setAnnouncement(error ? '' : 'Lesson preview updated');
    }
    wasLoading.current = loading;
  }, [loading, error, hasContent]);

  return (
    <aside
      aria-label="Lesson markdown preview"
      className="flex flex-col rounded-2xl bg-muted/40 border border-border p-4"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <h2 className="text-sm font-semibold">Lesson preview</h2>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={onRefresh}
          disabled={refreshDisabled}
          aria-describedby={showStaleHint ? 'lesson-preview-stale-hint' : undefined}
        >
          {refreshLabel}
        </Button>
      </div>

      {/* Staleness hint — the conversation has advanced past the last refresh.
          Linked to the refresh button via aria-describedby so a screen-reader
          user hears why a refresh is worthwhile when the button is focused. */}
      {showStaleHint && (
        <p id="lesson-preview-stale-hint" className="text-xs text-muted-foreground mb-2">
          Preview may be outdated — refresh to update.
        </p>
      )}

      {/* Persistent reminder: the preview is not the saved lesson. */}
      <p
        role="note"
        className="text-xs rounded-md bg-amber-50 text-amber-800 border border-amber-200 px-3 py-2 mb-3"
      >
        This preview is not saved. Click &ldquo;{saveLabel}&rdquo; to save your changes.
      </p>

      {/* Screen-reader announcements for async refresh outcomes. */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      <div className="flex-1 overflow-auto">
        {error ? (
          <div
            role="alert"
            className="rounded-lg bg-destructive/10 text-destructive px-4 py-3 text-sm"
          >
            {error}
          </div>
        ) : loading ? (
          <div className="text-sm text-muted-foreground">Generating preview…</div>
        ) : hasContent ? (
          <div
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: renderMd(markdown) }}
          />
        ) : (
          <div className="text-sm text-muted-foreground py-12 text-center">
            No preview yet. Keep chatting with the editor, then click
            &ldquo;Generate preview&rdquo; to see the generated lesson markdown.
          </div>
        )}
      </div>
    </aside>
  );
}
