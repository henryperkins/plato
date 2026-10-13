/**
 * LessonLoadingView — stepped build progress UI shown when starting a lesson.
 *
 * Shows 3 phases:
 * 1. Initializing lesson (Lesson Owner agent generates KB)
 * 2. Enriching lesson (plugins run — only shown if plugins are active)
 * 3. Starting conversation (Coach opens with first message)
 *
 * Each step shows a spinner + status. The enrichment step expands to show
 * per-plugin progress when multiple plugins are active.
 */

import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const STEPS = {
  INITIALIZING: 'initializing',
  ENRICHING: 'enriching',
  STARTING: 'starting',
};

function StepIcon({ status }) {
  if (status === 'completed') {
    return <CheckCircle2 className="w-5 h-5 text-success-foreground" aria-hidden="true" />;
  }
  if (status === 'in_progress') {
    return <Loader2 className="w-5 h-5 animate-spin text-primary-text" aria-hidden="true" />;
  }
  return <Circle className="w-5 h-5 text-muted-foreground" aria-hidden="true" />;
}

function BuildStep({ label, status, detail, enrichments }) {
  const isEnrichment = enrichments !== undefined;

  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 mt-0.5">
        <StepIcon status={status} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">
          {label}
        </div>
        {detail && (
          <div className="text-sm text-muted-foreground mt-0.5">
            {detail}
          </div>
        )}
        {isEnrichment && enrichments.length > 0 && status === 'in_progress' && (
          <div className="mt-2 space-y-1">
            {enrichments.map((e, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 shrink-0 animate-spin" aria-hidden="true" />
                <span className="break-words min-w-0">{e.label || e.pluginId}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function LessonLoadingView({ step, enrichments = [] }) {
  // Show enrichment step once we've reached it (and keep showing it after)
  const showEnrichmentStep = step === STEPS.ENRICHING || step === STEPS.STARTING;

  // Compute step statuses based on current step
  const steps = [
    {
      key: STEPS.INITIALIZING,
      label: 'Initializing lesson',
      detail: 'The Lesson Owner is reviewing the objectives and creating your personalized learning plan',
      status: step === STEPS.INITIALIZING
        ? 'in_progress'
        : (step === STEPS.ENRICHING || step === STEPS.STARTING ? 'completed' : 'pending'),
    },
  ];

  // Show enrichment step when we're actively enriching OR when enrichments were found
  if (showEnrichmentStep) {
    steps.push({
      key: STEPS.ENRICHING,
      label: 'Enriching lesson',
      detail: 'Gathering additional context and resources for this lesson',
      status: step === STEPS.ENRICHING
        ? 'in_progress'
        : (step === STEPS.STARTING ? 'completed' : 'pending'),
      enrichments,
    });
  }

  steps.push({
    key: STEPS.STARTING,
    label: 'Starting conversation',
    detail: 'Your coach is preparing to begin',
    status: step === STEPS.STARTING ? 'in_progress' : 'pending',
  });

  return (
    <div
      className="max-w-2xl mx-auto p-4 sm:py-8"
      role="status"
      aria-live="polite"
      aria-label="Lesson is loading"
    >
      <Card>
        <CardHeader>
          <CardTitle><h2>Preparing your lesson</h2></CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {steps.map((s) => (
            <BuildStep
              key={s.key}
              label={s.label}
              status={s.status}
              detail={s.detail}
              enrichments={s.enrichments}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// Export step constants so parent can use them
export { STEPS };
