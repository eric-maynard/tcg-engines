# Staying compatible with the `research-app-seams` branch

The Riftbound app is **hosted** by an internal research app that runs it as a confined child
process (`sandbox/sandbox/emaynard/riftbound/backend/supervisor.py` in the Anthropic monorepo).
That host is developed on the **`research-app-seams`** branch of this repo (worktree
`/root/src/tcg/tcg-engines-ra`), which periodically merges `rules-digest-and-lookup` into itself.
Our job on this branch is to stay mergeable **without dictating their design**.

## The hosting contract (do not break these)

The host runs the app with env-var *seams* instead of patching it:

| seam | what the host needs |
|---|---|
| `RB_LISTEN_UNIX`, `RB_LISTEN_UNIX_MODE`, `RB_BIND_HOST` | listen on a unix socket, not a public TCP port |
| `RB_TRUST_PROXY_AUTH`, `RB_PROXY_SECRET` | trust the host's authenticated proxy |
| `RB_STATIC_DIR`, `RB_SETS_DIR`, `RB_IMAGES_DIR`, `RB_LOG_DIR` | read assets/logs from host-chosen paths |
| `RIFTBOUND_DB_PATH`, `RIFTBOUND_RULES_DB` | state and rules DB under host-managed storage |
| `SANDBOX_ENABLED` | server-driven second seat (goldfish / Claude opponent) |
| `ANTHROPIC_BASE_URL`, `ANTHROPIC_UNIX_SOCKET`, `ANTHROPIC_AUTH_TOKEN` | model access ONLY via the host's relay |

Most of these are implemented on `research-app-seams`, not here — `server/config.ts` on this branch
still hard-codes `STATIC_DIR` / `IMAGES_DIR` / `SETS_DIR` and reads only `PORT`, `SANDBOX_ENABLED`,
`RIFTBOUND_DB_PATH`, `RIFTBOUND_RULES_DB`, `ANTHROPIC_API_KEY`, `RB_AI_MOCK`.

**Therefore, when touching `apps/riftbound-app/server/`:** never make a path, port, or credential
*less* overridable than it is today, never add a hard-coded absolute path or a direct outbound
network call (the relay is the only egress), and prefer `process.env.X ?? <default>` over a
constant so their seam can keep landing on top. If you must restructure `config.ts`, `http.ts`,
`routes-static.ts` or `log.ts`, say so in the commit message — those are the files their branch
edits most.

## Merge status (refresh when it changes)

Last checked: our branch +52 commits, theirs +14 since merge-base `b15e3c6`. A trial merge of our
HEAD into `research-app-seams` produced exactly **one** conflict:

- `public/js/gameplay/interactions.js` → `enterRuneSelected`. Both branches independently fixed the
  same user complaint (clicking a rune stack tapped the top rune and then the bottom one). Ours is
  `topmostReadyRuneOfSameStack(clickedId)`; theirs is `findPileExhaustMove(cardId)` from
  `918f48c` ("real printed card backs, pile-level rune tapping").
  **Resolution: take THEIRS.** It is the same intent integrated with their pile model; our helper
  is then dead and should be deleted in the merge commit. Do not re-introduce ours on top.

Everything else auto-merged, including `render/modals.js`. Re-run the check before any large app
change:

```sh
git worktree add --detach /tmp/rb-mergecheck research-app-seams
git -C /tmp/rb-mergecheck merge --no-commit --no-ff <our-HEAD>
git -C /tmp/rb-mergecheck diff --name-only --diff-filter=U
git -C /tmp/rb-mergecheck merge --abort && git worktree remove --force /tmp/rb-mergecheck
```
