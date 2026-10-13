# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary audience is **independent learners who communicate on Slack**, confirmed by the product owner during initialization.

Their learning workflow is self-directed: choose a focused lesson, work toward its exemplar with an AI coach, and return to an existing conversation to continue learning. The particular subject areas, learner experience levels, and Slack workspace arrangements remain unspecified.

## Product Purpose

plato helps learners demonstrate a concrete skill or outcome through a continuous conversation with an AI coach. Each lesson defines one **exemplar**, the mastery-level outcome the learner produces or demonstrates, and **2–4 learning objectives** that support it.

The coach creates activities, evaluates submitted work, gives specific feedback, and adapts the next step using the learner's progress and context. Success means demonstrating the exemplar. Roughly **11 exchanges / 20 minutes** is the current lesson-design target; it is not a guaranteed completion time or a deadline that ends the conversation.

## Positioning

plato combines exemplar-driven microlearning with adaptive conversational coaching. The coach uses the lesson, a program knowledge base, a learner profile, and accumulated observations to guide and assess the learner. Course progress can provide context across related lessons.

Slack is part of the primary audience's communication context. The existing integration supports onboarding through Slack direct messages; learning conversations currently take place in the authenticated web app.

## Operating Context

- Learners choose, filter, and resume lessons at `/lessons`, open a lesson conversation at `/lessons/:lessonGroupId`, and manage their profile at `/settings`.
- Learners submit typed responses, uploaded or pasted images, and attached web links. The coach evaluates this work against the exemplar and objectives.
- Conversations, learner profiles, and progress are persisted on the server. The current product requires an internet connection and sign-in.
- The implemented admin role manages users, lessons, courses, classroom identity, the program knowledge base, and plugins at `/plato`. Who operates this role for the independent-learner audience is an open decision.
- Admins create lessons and the program knowledge base through the authoring tools. Startup seeds prompts and default theme settings; it does not seed a lesson curriculum or a program knowledge base.
- The optional Slack plugin lets admins connect a workspace, find users or channel members, and send onboarding invitations by direct message. It requires installation and configuration of a Slack app with the appropriate permissions.

## Capabilities and Constraints

These are current repository facts and requirements. They describe the implemented product; the owner has not separately reaffirmed every item as a permanent product commitment.

- **Mastery and pacing:** Progress is a score from 0–10. A lesson completes when the coach reports 10, with completion handled in code. Exchange count never forces completion. Longer lessons are a diagnostic for improving lesson design and coaching.
- **Completed conversations:** The thread continues for lesson feedback. Its completion, progress, and exchange count stay fixed. Starting another lesson uses its own conversation.
- **Lesson access:** Admins control lesson visibility and sharing, organize lessons into courses, and define profile fields. Required profile fields are collected before the classroom renders through the existing client-side gate.
- **Learner records:** Lesson conversations, submitted images, knowledge-base updates, and learner profiles support continued coaching. Images are stored separately from conversation messages; attached links retain their URL and title, with extracted page text used for the attachment turn.
- **Administration:** The dashboard reports engagement and pacing diagnostics. Admin “View as User” is a read-only inspection workflow.
- **Classroom identity:** Admins can configure a classroom name and logo. Classroom customization applies to learner-facing surfaces; administration retains plato's identity.
- **AI dependency:** AWS Bedrock is the current AI backend in local development and production. The repository requires an open-source model with image input and reliable progress/update signals. Credentials and enabled model access are necessary for AI conversations.
- **Implementation and licensing:** The existing app uses React/Vite and a Hono API, with SQLite for local development and AWS Lambda/DynamoDB for production. The repository is licensed AGPL-3.0. Preserve authentication, access controls, persistence, and URL-fetch safeguards when changing the interface.
- **Slack scope:** The shipped plugin supports invitations. Additional learning or communication workflows inside Slack remain undecided.

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before changes to lesson completion or persistence. Current technical requirements continue to apply unless deliberately changed through the repository's development process.

## Brand Commitments

The existing product name is **plato**, styled in lowercase in product copy and assets. Existing attribution identifies **11:11 Philosopher's Group** as its creator. No rebrand was requested during initialization.

The coach's implemented voice is concise, direct, and specific: brief responses, feedback about the learner's actual work, and one clear next step. It scaffolds the learner's thinking and leaves the learner responsible for producing the exemplar. See [client/prompts/coach.md](client/prompts/coach.md).

## Evidence on Hand

- [README.md](README.md) provides the existing product description and development setup; code is the authority where documentation and implementation differ.
- [client/src/App.jsx](client/src/App.jsx) identifies the implemented learner, authentication, and admin routes.
- [client/prompts/](client/prompts/) contains the bundled coaching and authoring instructions.
- [client/src/lib/lessonEngine.js](client/src/lib/lessonEngine.js) and [client/src/lib/constants.js](client/src/lib/constants.js) establish current completion and pacing behavior.
- [server/src/lib/seed.js](server/src/lib/seed.js) establishes which content is seeded and which admins must create.
- [plugins/slack/docs/README.md](plugins/slack/docs/README.md) documents the existing Slack invitation workflow and configuration requirements.
- [client/assets/](client/assets/) contains existing logos and application icons.

This record is based on the owner's audience answer and repository inspection. A live deployment, connected Slack workspace, and real learner outcomes were not verified during initialization. No testimonials or outcome statistics were supplied for new claims.

## Product Principles

Working principles derived from the confirmed audience and current product behavior:

1. Prioritize the independent learner's ability to choose, continue, and complete a focused lesson.
2. Make the exemplar, current progress, and next useful action understandable throughout the conversation.
3. Let demonstrated mastery determine completion, while using pacing to improve the lesson and coaching.
4. Fit the learner's Slack communication context with clear handoffs into the web learning experience.
5. Preserve accessible interaction and reliable learner records across the full learning workflow.

## Accessibility & Inclusion

The repository requires keyboard support and an accessible name for every interactive element. The existing product targets screen reader and keyboard-only use, including VoiceOver, NVDA, and JAWS.

Preserve controlled new-message announcements, the silent-by-default chat log, keyboard navigation between messages with `Alt+ArrowUp` / `Alt+ArrowDown`, and `Cmd/Ctrl+Enter` to send. Plain Enter inserts a newline. Loading, error, and progress states need accessible equivalents.

These are existing product requirements; accessibility conformance was not audited during initialization. Additional audience-specific access needs remain open.

## Open Decisions

- Who administers and authors the learning program for independent learners, and which subjects or learning goals it serves.
- Whether Slack remains an onboarding and communication context or gains additional learning workflows.
- Which existing technical, licensing, and pacing requirements the owner wants to reaffirm as long-term commitments beyond the current repository policy.
