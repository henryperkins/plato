# Mobile Input And Chat Polish Design

## Goal

Make plato text entry feel native on iPhone while preserving the desktop layout, chat accessibility contract, and existing lesson behavior. The change covers shared text input primitives where feasible and adds chat-specific refinements for the learner/admin conversation surfaces.

## Current Context

The shared text primitives are `client/src/components/ui/input.jsx` and `client/src/components/ui/textarea.jsx`. They already use `text-base` on mobile and `md:text-sm` on desktop, which protects most form fields from iOS focus zoom. The lesson composer is custom in `client/src/components/chat/ComposeBar.jsx`; it currently uses `text-sm`, manually auto-resizes through `useAutoResize`, and is mounted twice by `client/src/pages/LessonChat.jsx` so the inline composer and fixed composer can share text/image state. `ChatArea`, `UserMessage`, and `AssistantMessage` own the chat log semantics and bubble layout used across learner and admin chat surfaces.

The design must preserve these established contracts:

- Chat log remains `role="log"`, `aria-live="off"`, and `aria-label="Chat log"`.
- New message announcements stay in the separate `role="status"` live region.
- Streaming assistant messages remain hidden from screen readers through the `streaming` prop.
- Individual messages remain plain focusable `div`s with inline sr-only speaker prefixes and `data-chat-message` attributes for Alt+Arrow navigation.
- `ComposeBar` sends only on Cmd/Ctrl+Enter; plain Enter inserts a newline.
- Lesson completion semantics stay untouched. No pacing, progress, or lesson-engine behavior changes.

## Scope

In scope:

- Shared `Input` and `Textarea` mobile ergonomics for text entry.
- Shared `ComposeBar` mobile ergonomics for all chat surfaces.
- Shared `ChatArea`, `UserMessage`, and `AssistantMessage` spacing and line-length behavior.
- Learner `LessonChat` fixed composer safe-area positioning and scroll padding.
- Focused regression tests for the CSS/class contracts that guard iPhone text entry and chat accessibility.

Out of scope:

- New composer actions such as microphone, emoji, or arbitrary attachments.
- Reworking admin chat page information architecture.
- Replacing inline SVG icons with a larger icon-system migration.
- Changing AI message generation, lesson pacing, profile updates, or persistence semantics.

## Design

### Shared Text Inputs

`Input` and `Textarea` should continue to render at `text-base` below the `md` breakpoint so iOS Safari does not zoom focused fields. Keep the existing `md:text-sm` desktop compaction. The shared `Input` should keep its existing `h-10` default, because 40px is the lower bound of the target range and matches the current UI density. File inputs should keep their separate padding and file-button styling.

`Textarea` should keep a comfortable minimum height and mobile `text-base`, but its class list should be tightened around the same mobile-first rule as `Input`: 16px on mobile, compact desktop text at `md`, visible focus ring, and disabled states. Existing call sites such as Settings notes should not need per-page changes.

### Composer

`ComposeBar` should own chat-specific text-entry behavior:

- Textarea uses `text-base leading-6` on mobile and `md:text-sm md:leading-5` on desktop.
- Auto-grow keeps scrollbars hidden until the configured max height is reached.
- The max height should be row-based rather than a magic pixel default. Eight rows is the right default for lesson chat: large enough for reflection, small enough to keep the conversation visible.
- Attach and send controls should have at least 40px hit targets on mobile. Desktop can stay compact through responsive classes if needed, but no interactive target should be smaller than 40px on touch-sized layouts.
- The composer wrapper should include bottom safe-area padding through shared CSS tokens, so the fixed learner composer clears the iPhone home indicator.
- The send button should remain icon-only because the existing UI already has an accessible name and compact mobile shape.
- Image loading status should keep the persistent live-region node.

The existing dual-mount learner composer behavior must remain intact: the inline and fixed instances share controlled `text` and `images`, and the resize effect runs when externally supplied text changes.

### Chat Area And Bubbles

`ChatArea` should add a reusable chat-scroll class that provides overscroll containment and bottom scroll padding based on composer height plus safe area. It should keep its current ref forwarding, keyboard navigation hook, auto-scroll sentinel, and live-region layout.

Message bubbles should use CSS tokens for line length:

- Mobile bubble width target: around 42ch, still capped by the viewport.
- Desktop bubble width target: around 68ch.
- User bubbles should keep the primary-color filled style.
- Assistant messages should keep prose rendering and serif body styling, but should use the same readable max-width token.

Spacing should be tight and predictable: 8-12px vertical rhythm between messages and comfortable bubble padding. The result should read as a conversation, not a card layout.

### Learner Fixed Composer

`LessonChat` currently pins the fixed composer at `bottom-9`, which is not tied to safe-area or the app shell. Replace that with a safe-area-aware bottom class or helper style so the composer clears the iPhone home indicator without floating unnecessarily high on desktop. The inline composer should remain in document flow as the layout anchor.

The lesson container should prefer dynamic viewport behavior where useful, but this change should avoid a broad shell rewrite. A global `@supports (height: 100dvh)` helper and safe-area tokens are enough for this scope.

### Global CSS Tokens

Add mobile input/chat tokens in `client/src/index.css`:

- `--safe-top`
- `--safe-bottom`
- `--composer-height`
- `--bubble-max`

At `min-width: 640px`, widen `--bubble-max` for desktop reading. Add utility classes for safe composer padding and chat scrolling. Disable the default iOS tap highlight globally to reduce mobile flash without affecting focus visibility.

## Testing

Add focused client tests under `client/tests/` using Node's built-in test runner. These tests should read the component source files and assert stable contracts that matter for this UI pass:

- Shared text primitives keep mobile `text-base` and desktop compaction.
- `ComposeBar` keeps mobile 16px text, row-based auto-grow configuration, Cmd/Ctrl+Enter send behavior, persistent image status live region, and mobile-sized icon controls.
- `ChatArea` keeps `role="log"`, `aria-live="off"`, `aria-label="Chat log"`, keyboard navigation hook, and the chat-scroll class.
- Message components keep `data-chat-message`, sr-only speaker prefixes, and tokenized max-width behavior.
- `LessonChat` fixed composer uses safe-area-aware positioning rather than the old static bottom offset.

Verification commands:

```bash
cd client && npm test
cd client && npm run lint
cd client && npm run build
```

## Rollout Notes

This is a client-only UI polish change. It should not touch server code, plugin contracts, prompt files, lesson limits, or persistence. The safest implementation path is to update shared primitives first, then chat components, then learner fixed-composer positioning, with tests added before each behavior change.

## Spec Self-Review

- Placeholder scan: no incomplete marker text or intentionally vague implementation gaps remain.
- Scope check: the work is a single client-side UI pass with clear file boundaries.
- Accessibility check: the existing chat screen reader and keyboard contracts are explicitly preserved.
- Risk check: the highest-risk area is the dual-mounted learner composer; the design requires controlled text/image state and resize-on-external-text behavior to remain unchanged.
