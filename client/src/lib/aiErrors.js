/**
 * User-facing copy for failed AI calls.
 *
 * The server classifies provider failures into stable codes and never forwards
 * raw provider text (server/src/lib/ai-errors.js). This module turns a code, or
 * a client-side failure, plus the surface that made the call into one message
 * that says what failed, why, and what to do next. Learners get plain language;
 * admins also get the configuration hint they can act on. Errors that did not
 * come from an AI call keep their own message, since app code already words
 * those for people.
 */

const SURFACES = {
  'coach-start': {
    subject: 'Your coach', action: 'start this lesson', audience: 'learner',
    retry: 'Reload the page to try again.',
  },
  'coach-reply': {
    subject: 'Your coach', action: 'reply', audience: 'learner',
    rejectedHint: 'If you attached an image or link, try sending without it.',
    recovery: 'Your message is back in the box.',
  },
  'lesson-creator': {
    subject: 'The lesson creator', action: 'respond', audience: 'admin',
    rejectedHint: 'Try a shorter message.',
  },
  'lesson-builder': { subject: 'plato', action: 'build the lesson from this conversation', audience: 'admin' },
  'kb-editor': {
    subject: 'The knowledge base editor', action: 'respond', audience: 'admin',
    rejectedHint: 'Try a shorter message.',
  },
  'kb-builder': { subject: 'plato', action: 'build the knowledge base from this conversation', audience: 'admin' },
  preview: { subject: 'plato', action: 'build the preview', audience: 'admin' },
  'profile-feedback': {
    subject: 'plato', action: 'update your profile', audience: 'learner',
    recovery: 'Your feedback is still in the box.',
  },
};

const DEFAULT_SURFACE = { subject: 'The AI assistant', action: 'respond', audience: 'learner' };
const DEFAULT_RETRY = 'Try again.';

const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const withPeriod = (s) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

/** What went wrong, independent of where. Exported for tests. */
export function aiErrorKind(err) {
  if (!err) return 'unknown';
  switch (err.code) {
    case 'ai_unavailable': return 'unavailable';
    case 'ai_rate_limited':
    case 'ai_overloaded': return 'busy';
    case 'ai_timeout': return 'timeout';
    case 'ai_invalid_request':
    case 'empty_message': return 'rejected';
    case 'ai_error': return 'server';
    default: break;
  }
  if (err.name === 'ApiError') {
    switch (err.type) {
      case 'rate_limit':
      case 'overloaded': return 'busy';
      case 'invalid_key': return 'session';
      case 'parse': return 'unreadable';
      case 'empty_response': return 'empty';
      case 'safety': return 'safety';
      default:
        if (err.status >= 500) return 'server';
        if (err.status === 400) return 'rejected';
        return 'unknown';
    }
  }
  const message = String(err.message || '');
  // fetch() rejects with a TypeError whose wording varies by browser.
  if (/failed to fetch|networkerror|load failed/i.test(message)) return 'offline';
  if (/^(session expired|not logged in)$/i.test(message)) return 'session';
  return 'other';
}

function describe(kind, s) {
  const who = s.subject;
  const act = s.action;
  const retry = s.retry || DEFAULT_RETRY;
  switch (kind) {
    case 'unavailable':
      return s.audience === 'admin'
        ? `${who} can't ${act} because the server can't reach the AI service. Check the server's AWS credentials and Bedrock model access.`
        : `${who} can't ${act} because the AI service is unavailable right now. Try again later, and tell your program admin if this keeps happening.`;
    case 'busy':
      return `${who} couldn't ${act} because the AI service is busy. Wait a moment, then ${lowerFirst(retry)}`;
    case 'timeout':
      return `${who} took too long to ${act}. ${retry}`;
    case 'rejected':
      return `${who} couldn't ${act} because the AI service couldn't process the request. ${s.rejectedHint || retry}`;
    case 'empty':
      return `${who} sent an empty reply. ${retry}`;
    case 'unreadable':
      return `${who} couldn't ${act} because the AI's response couldn't be read. ${retry}`;
    case 'safety':
      return `${who} couldn't ${act} because the AI's response didn't pass plato's checks. ${retry}`;
    case 'server':
      return `${who} couldn't ${act} because of a server problem. ${retry}`;
    case 'offline':
      return `${who} couldn't ${act} because your device can't reach the server. Check your internet connection, then ${lowerFirst(retry)}`;
    case 'session':
      return 'Your session expired. Sign in again to continue.';
    default:
      return `${who} couldn't ${act}. ${retry}`;
  }
}

/**
 * The message to show when an AI call fails.
 * @param {unknown} err - whatever the call threw
 * @param {keyof SURFACES} surface - where the call was made
 */
export function aiErrorMessage(err, surface) {
  const s = SURFACES[surface] || DEFAULT_SURFACE;
  const kind = aiErrorKind(err);
  const text = kind === 'other' && err?.message ? withPeriod(err.message) : describe(kind, s);
  return kind === 'session' || !s.recovery ? text : `${text} ${s.recovery}`;
}
