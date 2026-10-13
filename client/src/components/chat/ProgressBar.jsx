import { useEffect, useRef } from 'react';
import { celebrateExemplar } from '../../lib/exemplarCelebration.js';

/**
 * Lesson progress meter -- simple bar driven by coach's progress score.
 */
export default function ProgressBar({ lessonKB, celebrate = false }) {
  const checkRef = useRef(null);
  const isComplete = lessonKB?.status === 'completed';
  useEffect(() => {
    if (isComplete && celebrate) return celebrateExemplar(checkRef.current);
  }, [isComplete, celebrate]);

  if (!lessonKB) return null;
  const progress = lessonKB.progress ?? 0;
  const pct = isComplete ? 100 : progress * 10;

  return (
    <div
      className="mt-1.5"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={isComplete ? 'Exemplar achieved' : undefined}
      aria-label={`Lesson progress: ${pct}% toward exemplar`}
    >
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground mb-1" aria-hidden="true">
        <span>Starting</span>
        <span className={`ml-auto inline-flex items-center gap-1.5 text-right ${isComplete ? 'text-success-foreground font-medium' : ''}`}>
          {isComplete && (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <path ref={checkRef} data-exemplar-check="" d="m3 8 3 3 7-7" pathLength="1" strokeDasharray="1" strokeDashoffset="0" />
            </svg>
          )}
          {isComplete ? 'Exemplar Achieved!' : 'Exemplar'}
        </span>
      </div>
      <div className="h-1 rounded-full bg-muted overflow-hidden">
        <div
          className={`progress-fill h-full rounded-full ${isComplete ? 'bg-success-foreground' : 'bg-primary-text'}`}
          style={{ transform: `scaleX(${pct / 100})` }}
        />
      </div>
    </div>
  );
}
