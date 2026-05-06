# PR 144 CONTRIBUTING Compliance Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PR #144 fully compliant with `CONTRIBUTING.md` by adding the missing extension-point process evidence, literal plugin-host test coverage, updated test documentation, and a repaired required review check.

**Architecture:** Keep app behavior unchanged. The source-tree work is limited to compliance tests and contribution documentation; GitHub/AWS work records the public plugin-contract approval trail and repairs the required automated review infrastructure. The OpenRouter Rewards plugin remains the real plugin proving the host additions are not speculative.

**Tech Stack:** Node.js built-in test runner, plato plugin manifest validator, GitHub CLI, AWS IAM OIDC trust policy, Bedrock-backed Code Review workflow.

---

## Findings Covered

- [Process] `CONTRIBUTING.md` requires an `extension-point-request` issue and maintainer triage before adding new plugin extension points. No `extension-point` issue currently exists for PR #144.
- [Coverage] `CONTRIBUTING.md` explicitly asks for a test in `server/tests/lib/plugins/registry.test.js` proving new extension-point capability gates. The branch has related coverage elsewhere, but no file at that path.
- [Docs] Root `npm test` now runs client, server, and plugin-local tests, but `CONTRIBUTING.md` still describes the root command as only "Both" client/server tests.
- [Merge blocker] `CONTRIBUTING.md` requires a passing `review` status check before merge. PR #144 still fails before review at the Bedrock OIDC credential step with `Could not load credentials from any providers`.

## File Structure

- Create `server/tests/lib/plugins/registry.test.js`
  - Adds the literal plugin-host capability-gate regression file requested by `CONTRIBUTING.md`.
  - Uses `validateManifest()` because `pluginRegistry.boot()` delegates manifest acceptance/rejection to that validator before loading plugins.
- Modify `CONTRIBUTING.md`
  - Updates root test documentation so it matches `package.json` after `test:plugins` was added.
  - Keeps the extension-point checklist intact now that this plan adds the requested `registry.test.js` file.
- GitHub metadata, no repo file
  - Creates an `extension-point` issue from the existing template content.
  - Updates PR #144 body and comments with the extension-point issue link.
- GitHub/AWS infrastructure, no repo file
  - Restores `AWS_BEDROCK_ROLE_ARN` and IAM OIDC trust so the required Code Review workflow can assume the Bedrock role.

---

## Task 1: Record Extension-Point Request Evidence

**Files:**
- No repository files.
- GitHub issue: create one `extension-point` issue in `1111philo/plato`.
- GitHub PR: update PR #144 body and comments.

- [ ] **Step 1: Confirm there is still no extension-point issue**

Run:

```bash
gh issue list --repo 1111philo/plato --label extension-point --state all --limit 50 --json number,title,state,url
```

Expected before this task:

```json
[]
```

- [ ] **Step 2: Create the extension-point request body**

Run:

```bash
cat > /tmp/pr144-extension-point-request.md <<'EOF'
## What plugin needs this?

Plugin: OpenRouter Rewards, implemented in PR #144.

Feature: classroom-funded OpenRouter API key rewards for learners. Admins configure reward rules and a management key. Learners see available rewards in learner settings, receive a completion reward card after a lesson is completed, can reissue their key, and may optionally receive the one-time plaintext key by Slack direct message.

## Proposed extension point

This request covers the public plugin API additions required by PR #144.

Learner and admin UI slots:

- Slot: `learnerProfileFields`
  - Props: `{ user }`
  - Renders inside: `client/src/pages/Settings.jsx`
  - Purpose: lets a plugin add learner-owned account/profile controls without modifying the settings page for every plugin.
- Slot: `learnerHomeBanner`
  - Props: `{ user }`
  - Renders inside: `client/src/pages/LessonsList.jsx`
  - Purpose: lets a plugin surface learner-facing status before the lesson list without changing lesson catalog semantics.
- Slot: `learnerCompletionAfter`
  - Props: `{ lessonId, lessonKB }`
  - Renders inside: `client/src/pages/LessonChat.jsx`
  - Purpose: presentation-only post-completion UI. It renders only after `applyCoachResponseToKB` has already marked the lesson complete. It never awards progress, changes pacing, or triggers completion.
- Slot: `adminProfileFields`
  - Props: `{ user }`
  - Renders inside: the admin user/profile surface.
  - Purpose: lets a plugin add admin-only per-user controls such as key status, reissue queueing, and revocation.

Plugin-owned user metadata:

- Capability: `user.metadata.read`
  - Grants read access to `userMeta:<pluginId>` for the calling plugin's own id.
- Capability: `user.metadata.write`
  - Grants write/delete access to `userMeta:<pluginId>` for the calling plugin's own id.
- SDK helpers used by PR #144: `getUserMeta`, `getUserMetaWithVersion`, `putUserMetaConditional`, and `deleteUserMeta`.
- Isolation rule: plugins must not read or write another plugin's `userMeta:<otherPluginId>` record.

Targeted secret events:

- Manifest shape: `extensionPoints.secretEvents: [{ event: "openrouter-rewards.keyAwarded" }]`
- Capability: `secretEvent.receive.openrouter-rewards.keyAwarded`
- Emit API: `emitSecret("openrouter-rewards.keyAwarded", "slack", payload)` and `ctx.emitSecretTo("slack", "openrouter-rewards.keyAwarded", payload)`.
- Purpose: deliver sensitive one-time plaintext key payloads to a specific plugin receiver without broadcasting them on the open hook bus.

## What did you try first?

Existing extension points did not fit this plugin:

- `adminSettingsPanel` handles classroom-wide configuration, but not learner-owned reward status or one-time key reveal.
- `server.routes` handles HTTP APIs, but it does not provide a safe render point after lesson completion.
- The open hook bus is intentionally not suitable for plaintext secrets because it fans out to every subscriber.
- Core sync endpoints intentionally filter plugin-owned `userMeta:*` records from learner export/sync flows; a plugin-scoped SDK surface is needed for admin-maintained plugin metadata.

The OpenRouter Rewards plugin is the real plugin using every requested surface in PR #144, so these are not speculative extension points.

## Confirmation

- I read `docs/plugins/AGENTS.md` and `docs/plugins/EXTENSION_REFERENCE.md`.
- I tried composing existing slots/hooks before opening this.
- I have a real plugin that needs this: OpenRouter Rewards in PR #144.
EOF
```

- [ ] **Step 3: Create the issue**

Run:

```bash
ISSUE_URL="$(gh issue create \
  --repo 1111philo/plato \
  --title "[extension-point] OpenRouter rewards plugin host surfaces" \
  --label extension-point \
  --body-file /tmp/pr144-extension-point-request.md | tail -n 1)"
printf '%s\n' "$ISSUE_URL"
```

Expected:

```text
https://github.com/1111philo/plato/issues/
```

- [ ] **Step 4: Update PR #144 body with the issue link**

Run:

```bash
{
  printf '%s\n' '## Summary'
  printf '%s\n' ''
  printf '%s\n' '- Adds the OpenRouter Rewards plugin for classroom-funded learner reward keys.'
  printf '%s\n' '- Replaces the OAuth callback flow with synchronous management-key issuance for classroom-owned keys.'
  printf '%s\n' '- Adds the plugin-platform support required for learner-facing plugin surfaces, plugin-owned user metadata, and optional secret-event delivery.'
  printf '%s\n' ''
  printf '%s\n' '## CONTRIBUTING.md compliance'
  printf '%s\n' ''
  printf '%s\n' "- Extension-point request: ${ISSUE_URL}"
  printf '%s\n' '- Plugin manifest validation: `node scripts/validate-plugins.js`'
  printf '%s\n' '- Local test gate: `npm test` runs client, server, and plugin-local tests.'
  printf '%s\n' '- Merge blocker: required `review` status must pass before merge.'
  printf '%s\n' ''
  printf '%s\n' '## PR scope'
  printf '%s\n' ''
  printf '%s\n' 'This PR is intentionally not plugin-only. It includes the OpenRouter plugin and the core plugin-system changes needed to host it:'
  printf '%s\n' ''
  printf '%s\n' '- Core plugin host: learner slots in Settings, Lessons, and LessonChat; schema/capability/manifest/SDK/docs updates; plugin-owned user metadata; targeted secret events.'
  printf '%s\n' '- OpenRouter rewards plugin: admin settings/status UI, learner claim/reissue UI, management API mint/top-up/revoke logic, reservation state, and tests.'
  printf '%s\n' '- Slack plugin: optional OpenRouter key-delivery secret-event receiver.'
  printf '%s\n' ''
  printf '%s\n' '## Behavior'
  printf '%s\n' ''
  printf '%s\n' '- `/check-pending` is the single award path: rule match -> reserve -> mint or top up -> finalize -> return plaintext once.'
  printf '%s\n' '- `/status.availableReward` lets learner UI discover claimable rewards without mutating state.'
  printf '%s\n' '- OAuth, PKCE, callback routing, workspace-member addition, and the old `/oauth/start` + `/claim` flow are removed.'
  printf '%s\n' '- Stale pre-rewrite metadata is ignored/pruned on read; no migration step is required.'
} > /tmp/pr144-body.md

gh pr edit 144 --repo 1111philo/plato --body-file /tmp/pr144-body.md
```

Expected:

```text
https://github.com/1111philo/plato/pull/144
```

- [ ] **Step 5: Add a PR audit comment**

Run:

```bash
gh pr comment 144 --repo 1111philo/plato --body "CONTRIBUTING.md extension-point process evidence: opened ${ISSUE_URL}. PR #144 should not merge until a maintainer records approval or requests changes on that issue."
```

Expected:

```text
https://github.com/1111philo/plato/pull/144#issuecomment-
```

- [ ] **Step 6: Stop for maintainer triage when approval is absent**

Run:

```bash
gh issue view "${ISSUE_URL##*/}" --repo 1111philo/plato --comments
```

Expected before maintainer action: the issue exists and has no approval comment. Do not merge PR #144 until the issue contains explicit maintainer approval or an accepted changes-request path.

---

## Task 2: Add The Literal Registry Capability-Gate Test

**Files:**
- Create: `server/tests/lib/plugins/registry.test.js`

- [ ] **Step 1: Create the registry test file**

Create `server/tests/lib/plugins/registry.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateManifest } from '../../../src/lib/plugins/manifest.js';

const baseManifest = {
  id: 'demo',
  name: 'Demo',
  version: '1.0.0',
  apiVersion: '1.x',
  description: 'A demo plugin.',
  capabilities: [],
  extensionPoints: {},
};

function assertMissingCapability(manifest, capability) {
  const result = validateManifest(manifest, { expectedId: manifest.id });
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((error) => error.includes(`extensionPoints declare capabilities not listed in "capabilities": ${capability}`)),
    result.errors.join('\n'),
  );
}

describe('plugin registry extension-point capability gates', () => {
  it('requires learnerCompletionAfter capability before a manifest can use the slot', () => {
    assertMissingCapability({
      ...baseManifest,
      extensionPoints: {
        slots: { learnerCompletionAfter: 'client/Completion.jsx' },
      },
    }, 'ui.slot.learnerCompletionAfter');
  });

  it('requires targeted secret-event receive capability before a manifest can receive the event', () => {
    assertMissingCapability({
      ...baseManifest,
      extensionPoints: {
        secretEvents: [{ event: 'openrouter-rewards.keyAwarded' }],
      },
    }, 'secretEvent.receive.openrouter-rewards.keyAwarded');
  });

  it('accepts the PR 144 host surfaces when their capabilities are declared', () => {
    const result = validateManifest({
      ...baseManifest,
      capabilities: [
        'ui.slot.adminProfileFields',
        'ui.slot.learnerProfileFields',
        'ui.slot.learnerHomeBanner',
        'ui.slot.learnerCompletionAfter',
        'secretEvent.receive.openrouter-rewards.keyAwarded',
        'user.metadata.read',
        'user.metadata.write',
      ],
      extensionPoints: {
        slots: {
          adminProfileFields: 'client/AdminProfileFields.jsx',
          learnerProfileFields: 'client/LearnerProfileFields.jsx',
          learnerHomeBanner: 'client/LearnerHomeBanner.jsx',
          learnerCompletionAfter: 'client/LearnerCompletionAfter.jsx',
        },
        secretEvents: [{ event: 'openrouter-rewards.keyAwarded' }],
      },
    }, { expectedId: 'demo' });

    assert.equal(result.ok, true, result.errors?.join('\n'));
  });
});
```

- [ ] **Step 2: Run the focused test**

Run:

```bash
node --test server/tests/lib/plugins/registry.test.js
```

Expected:

```text
# pass 3
# fail 0
```

- [ ] **Step 3: Run server plugin-host tests**

Run:

```bash
cd server && node --test $(find tests/lib/plugins -name '*.test.js' | sort)
```

Expected: every `server/tests/lib/plugins/*.test.js` test passes, including the new `registry.test.js` file.

- [ ] **Step 4: Commit the registry coverage**

Run:

```bash
git add server/tests/lib/plugins/registry.test.js
git commit -m "test: add registry extension-point gate coverage"
```

---

## Task 3: Update CONTRIBUTING Test Documentation

**Files:**
- Modify: `CONTRIBUTING.md`

- [ ] **Step 1: Update the development workflow test sentence**

In `CONTRIBUTING.md`, replace:

```markdown
- **Tests:** `npm test` in either `client/` or `server/` runs that package's tests. Run both with `npm test` from the root.
```

With:

```markdown
- **Tests:** `npm test` in either `client/` or `server/` runs that package's tests. From the repo root, `npm test` runs client tests, server tests, and every `plugins/**/*.test.js` plugin-local test.
```

- [ ] **Step 2: Update the running-tests command block**

In `CONTRIBUTING.md`, replace:

```markdown
# Both
cd /path/to/plato && npm test
```

With:

```markdown
# Plugin tests
cd /path/to/plato && npm run test:plugins

# Full local merge gate: client + server + plugin tests
cd /path/to/plato && npm test
```

- [ ] **Step 3: Run a docs diff check**

Run:

```bash
git diff -- CONTRIBUTING.md
```

Expected: only the root test-gate description changes.

- [ ] **Step 4: Commit the docs update**

Run:

```bash
git add CONTRIBUTING.md
git commit -m "docs: clarify root test gate"
```

---

## Task 4: Repair The Required Review Check Infrastructure

**Files:**
- No repository files.
- Requires a GitHub token with Actions secrets permission for `1111philo/plato`.
- Requires AWS credentials that can update IAM role `arn:aws:iam::722741357267:role/plato-github-bedrock`.

- [ ] **Step 1: Capture the latest review failure**

Run:

```bash
REVIEW_RUN_ID="$(gh run list --repo 1111philo/plato --workflow 'Code Review' --branch feat/openrouter-rewards-plugin --limit 1 --json databaseId --jq '.[0].databaseId')"
printf '%s\n' "$REVIEW_RUN_ID"
gh run view "$REVIEW_RUN_ID" --repo 1111philo/plato --log-failed
```

Expected before infrastructure repair:

```text
Configure AWS credentials (Bedrock OIDC)
Credentials could not be loaded, please check your action inputs: Could not load credentials from any providers
```

- [ ] **Step 2: Set the repository secret**

Run with a GitHub account that can manage repository Actions secrets:

```bash
gh secret set AWS_BEDROCK_ROLE_ARN \
  --repo 1111philo/plato \
  --body 'arn:aws:iam::722741357267:role/plato-github-bedrock'

gh secret list --repo 1111philo/plato | rg '^AWS_BEDROCK_ROLE_ARN\s'
```

Expected:

```text
AWS_BEDROCK_ROLE_ARN
```

- [ ] **Step 3: Update the AWS OIDC trust policy**

Run in AWS account `722741357267`:

```bash
cat > /tmp/plato-github-bedrock-trust.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::722741357267:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": [
            "repo:1111philo/plato:pull_request",
            "repo:1111philo/plato:ref:refs/heads/*"
          ]
        }
      }
    }
  ]
}
EOF

aws iam update-assume-role-policy \
  --role-name plato-github-bedrock \
  --policy-document file:///tmp/plato-github-bedrock-trust.json

aws iam get-role \
  --role-name plato-github-bedrock \
  --query 'Role.AssumeRolePolicyDocument'
```

Expected: the returned trust policy includes `token.actions.githubusercontent.com`, `sts.amazonaws.com`, `repo:1111philo/plato:pull_request`, and `repo:1111philo/plato:ref:refs/heads/*`.

- [ ] **Step 4: Verify Bedrock inference-profile visibility**

Run:

```bash
aws bedrock list-inference-profiles --region us-east-2 \
  --query "inferenceProfileSummaries[?inferenceProfileId=='us.anthropic.Codex-sonnet-4-5-20250929-v1:0'].inferenceProfileId"
```

Expected:

```json
[
  "us.anthropic.Codex-sonnet-4-5-20250929-v1:0"
]
```

- [ ] **Step 5: Rerun the review workflow**

Run:

```bash
gh run rerun "$REVIEW_RUN_ID" --repo 1111philo/plato --failed
gh pr checks 144 --repo 1111philo/plato --watch --interval 10
```

Expected after infrastructure repair:

```text
review    pass
lint (client)    pass
lint (server)    pass
```

- [ ] **Step 6: Record unresolved infrastructure blockers when credentials cannot be repaired**

If `gh secret set` or `aws iam update-assume-role-policy` cannot be run by the current operator, run:

```bash
gh pr comment 144 --repo 1111philo/plato --body "CONTRIBUTING.md merge gate remains blocked: the required review check still fails before code review at Bedrock OIDC credential loading. A maintainer with repository secret access and AWS account 722741357267 IAM access must repair AWS_BEDROCK_ROLE_ARN and the plato-github-bedrock trust policy before merge."
```

Expected: PR #144 contains a durable comment explaining that the remaining failure is infrastructure access, not application code.

---

## Task 5: Final Verification And Push

**Files:**
- No new source files beyond Tasks 2 and 3.

- [ ] **Step 1: Re-check branch state**

Run:

```bash
git status --short --branch
git fetch origin
git merge-tree --write-tree origin/main HEAD >/tmp/pr144-merge-tree.out && echo MERGE_TREE_OK || (echo MERGE_TREE_FAILED && cat /tmp/pr144-merge-tree.out)
```

Expected:

```text
## feat/openrouter-rewards-plugin...henry-fork/feat/openrouter-rewards-plugin [ahead 2]
MERGE_TREE_OK
```

- [ ] **Step 2: Run plugin manifest validation**

Run:

```bash
node scripts/validate-plugins.js
```

Expected:

```text
✓ Valid plugins: openrouter-rewards, slack, teacher-comments
```

- [ ] **Step 3: Run whitespace validation**

Run:

```bash
git diff --check origin/main...HEAD
```

Expected: no output and exit code 0.

- [ ] **Step 4: Run the full local test gate**

Run:

```bash
npm test
```

Expected:

```text
client tests pass
server tests pass
plugin tests pass
```

- [ ] **Step 5: Run the production client build**

Run:

```bash
npm run build:client
```

Expected:

```text
✓ built
```

- [ ] **Step 6: Confirm plugin Tailwind classes still ship**

Run:

```bash
grep -o "wrap-anywhere\\|cursor-pointer\\|text-green-700" client/dist/assets/index-*.css | sort -u
```

Expected:

```text
cursor-pointer
text-green-700
wrap-anywhere
```

- [ ] **Step 7: Push the branch**

Run:

```bash
git push henry-fork feat/openrouter-rewards-plugin
```

Expected: PR #144 updates to the new head commit.

- [ ] **Step 8: Verify PR compliance state**

Run:

```bash
gh pr view 144 --repo 1111philo/plato --json headRefOid,mergeStateStatus,reviewDecision,statusCheckRollup,body --jq '{headRefOid, mergeStateStatus, reviewDecision, hasExtensionPointIssue: (.body | contains("Extension-point request: https://github.com/1111philo/plato/issues/")), checks: [.statusCheckRollup[] | {name, status, conclusion}]}'
```

Expected after the infrastructure repair and maintainer triage:

```json
{
  "hasExtensionPointIssue": true,
  "mergeStateStatus": "CLEAN",
  "reviewDecision": "APPROVED"
}
```

If `mergeStateStatus` remains `BLOCKED`, inspect `checks` and the extension-point issue comments. The branch is not compliant for merge until the required `review` check passes and maintainer approval exists.

---

## Self-Review Checklist

- [ ] Extension-point request evidence is covered by Task 1 with exact `gh` commands and PR metadata updates.
- [ ] Literal `server/tests/lib/plugins/registry.test.js` coverage is covered by Task 2 with concrete test code.
- [ ] Root test documentation drift is covered by Task 3 with exact `CONTRIBUTING.md` replacements.
- [ ] Bedrock OIDC review failure is covered by Task 4 with exact GitHub secret, AWS trust policy, Bedrock profile, rerun, and fallback comment commands.
- [ ] Final verification is covered by Task 5 with manifest validation, whitespace check, full tests, client build, CSS scan, push, and PR state checks.
- [ ] No task changes lesson completion semantics, pacing directives, exchange cutoffs, or `_system:settings.*`.
- [ ] No task asks the OpenRouter plugin to read or write another plugin's settings or user metadata.
- [ ] No task mounts plugin routes outside `/v1/plugins/openrouter-rewards/`.
