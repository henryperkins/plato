# Mobile Input And Chat Polish Design

## Goal

Make plato text entry feel native on iPhone while preserving the desktop layout, chat accessibility contract, and existing lesson behavior. The change covers shared text input primitives where feasible and adds chat-specific refinements for the learner/admin conversation surfaces.

## Current Context

The shared text primitives are `client/src/components/ui/input.jsx` and `client/src/components/ui/textarea.jsx`. They already use `text-base` on mobile and `md:text-sm` on desktop, which protects most form fields from iOS focus zoom. The lesson composer is custom in `client/src/components/chat/ComposeBar.jsx`; it currently uses `text-sm`, manually auto-resizes through `useAutoResize`, and is mounted twice by `client/src/pages/LessonChat.jsx` so the inline composer and fixed composer can share text/image state. `ChatArea`, `UserMessage`, and `AssistantMessage` own the chat log semantics and bubble layout used across learner and admin chat surfaces. Learner image attachment messages are rendered directly in `LessonChat.jsx`, not through `UserMessage`, so they must be included in any bubble-width and spacing contract. The learner chat currently scrolls the page/window; `ChatArea` is not an independent scroll container.

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
- Shared `ChatArea`, `UserMessage`, `AssistantMessage`, and learner image attachment bubble spacing and line-length behavior.
- Learner `LessonChat` fixed composer safe-area positioning and page-scroll padding.
- Focused regression tests for the CSS/class contracts that guard iPhone text entry and chat accessibility.
- Browser/mobile viewport verification for safe-area positioning, composer overlap, computed tap target size, and textarea zoom behavior.

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
- Attach, send, and image-preview remove controls should have at least 40px hit targets on mobile. Desktop can stay compact through responsive classes if needed, but no interactive target should be smaller than 40px on touch-sized layouts.
- The composer wrapper should include bottom safe-area padding through shared CSS tokens, so the fixed learner composer clears the iPhone home indicator.
- The send button should remain icon-only because the existing UI already has an accessible name and compact mobile shape.
- Image loading status should keep the persistent live-region node.

The existing dual-mount learner composer behavior must remain intact: the inline and fixed instances share controlled `text` and `images`, and the resize effect runs when externally supplied text changes. Update `useAutoResize` or its call site so the default remains backwards-compatible, but `ComposeBar` uses an explicit row-based configuration such as `COMPOSER_MAX_ROWS = 8` instead of the current implicit 200px cap.

### Chat Area And Bubbles

`ChatArea` should add a reusable chat-log class for message spacing, readable width, and overscroll behavior where the component is placed inside a scrollable parent. It should keep its current ref forwarding, keyboard navigation hook, auto-scroll sentinel, and live-region layout.

Do not assume `ChatArea` is the scroll owner in learner chat. `LessonChat` currently scrolls the page/window, so composer-overlap protection must be applied to the actual scroll container. For this pass, keep the page-scroll model and add a lesson-page helper that applies bottom scroll padding to the document scroller or another element that actually owns `scrollIntoView()` behavior. A `scroll-padding-bottom` class on `ChatArea` alone is not sufficient for the fixed composer case.

Message bubbles should use CSS tokens for line length:

- Mobile bubble width target: around 42ch, still capped by the viewport.
- Desktop bubble width target: around 68ch.
- User bubbles should keep the primary-color filled style.
- Assistant messages should keep prose rendering and serif body styling, but should use the same readable max-width token.
- Learner image attachment bubbles in `LessonChat.jsx` should use the same tokenized max-width contract; do not leave them on the old `max-w-[85%]` path after text bubbles move to tokens.

Spacing should be tight and predictable: 8-12px vertical rhythm between messages and comfortable bubble padding. The result should read as a conversation, not a card layout.

### Learner Fixed Composer

`LessonChat` currently pins the fixed composer at `bottom-9`, which is not tied to safe-area or the app shell. Replace that with a safe-area-aware bottom class or helper style so the composer clears the iPhone home indicator without floating unnecessarily high on desktop. The inline composer should remain in document flow as the layout anchor.

Because the learner chat uses page scrolling, add a route-scoped scroll-padding helper for the document scroller while `LessonChat` is mounted, or apply equivalent padding to the actual page-scroll owner if the implementation changes the scroll model. The verification target is concrete: when `bottomRef.scrollIntoView()` runs, the newest message must remain visible above the fixed composer on mobile.

The lesson container should prefer dynamic viewport behavior where useful, but this change should avoid a broad shell rewrite. A global `@supports (height: 100dvh)` helper and safe-area tokens are enough for this scope.

### Global CSS Tokens

Add mobile input/chat tokens in `client/src/index.css`:

- `--safe-top`
- `--safe-bottom`
- `--composer-height`
- `--bubble-max`

At `min-width: 640px`, widen `--bubble-max` for desktop reading. Add utility classes for safe composer padding, fixed composer positioning, message bubble width, and the learner page-scroll padding described above. Disable the default iOS tap highlight globally to reduce mobile flash without affecting focus visibility.

## Testing

Add focused client tests under `client/tests/` using Node's built-in test runner. These tests should read the component source files and assert stable contracts that matter for this UI pass:

- Shared text primitives keep mobile `text-base` and desktop compaction.
- `ComposeBar` keeps mobile 16px text, row-based auto-grow configuration, Cmd/Ctrl+Enter send behavior, persistent image status live region, and mobile-sized attach/send/remove controls.
- `ChatArea` keeps `role="log"`, `aria-live="off"`, `aria-label="Chat log"`, keyboard navigation hook, and the reusable chat-log class.
- Message components keep `data-chat-message`, sr-only speaker prefixes, and tokenized max-width behavior.
- `LessonChat` image attachment bubbles use the same tokenized max-width behavior as text bubbles.
- `LessonChat` fixed composer uses safe-area-aware positioning rather than the old static bottom offset, and composer-overlap scroll padding is applied to the actual page scroll owner rather than only to `ChatArea`.

Source assertions are necessary but not sufficient for this change. Add a browser verification pass before marking the work complete:

- Start the client locally and inspect the learner chat at iPhone-sized viewports, including a short viewport such as 320x568 and a modern notched viewport such as 390x844.
- Confirm the focused composer textarea computes to at least 16px on mobile and does not trigger iOS-style focus zoom behavior in available mobile emulation. If real iPhone Safari is not available, record that limitation explicitly.
- Confirm attach, send, and image remove controls compute to at least 40px hit targets on touch-sized layouts.
- Confirm the fixed composer clears the safe area and the newest message remains visible after auto-scroll.
- Confirm desktop layout remains compact at the `md` breakpoint and does not inherit oversized mobile control density.

Verification commands:

```bash
cd client && npm test
cd client && npm run lint
cd client && npm run build
```

Browser verification can be performed with Playwright MCP/devtools if available, or manually against the local Vite server. Do not treat the Node source assertions as proof that the fixed composer and safe-area behavior work on mobile.

## Rollout Notes

This is a client-only UI polish change. It should not touch server code, plugin contracts, prompt files, lesson limits, or persistence. The safest implementation path is to update shared primitives first, then chat components and all user/media bubble paths, then learner fixed-composer positioning and page-scroll padding, with tests added before each behavior change. Finish with the browser/mobile verification pass because the highest-risk regressions are computed layout and viewport behavior, not importable business logic.

## Spec Self-Review

- Placeholder scan: no incomplete marker text or intentionally vague implementation gaps remain.
- Scope check: the work is a single client-side UI pass with clear file boundaries, including the learner image attachment bubble path that bypasses shared message components.
- Accessibility check: the existing chat screen reader and keyboard contracts are explicitly preserved.
- Risk check: the highest-risk areas are the dual-mounted learner composer and page-scroll/fixed-composer interaction; the design requires controlled text/image state, resize-on-external-text behavior, and visible newest-message auto-scroll behavior to remain unchanged.
