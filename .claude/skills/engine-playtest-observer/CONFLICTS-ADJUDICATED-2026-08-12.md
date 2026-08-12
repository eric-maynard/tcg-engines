# Ruling-vs-CR conflicts — adjudicated 2026-08-12

The 17 items TRIAGE-2026-08-12.md §3 flagged as "no engine lane can move these". Each had burned ~4
`requeue-failed` rounds: a fixer claims one, re-derives the same conflict, fails it again. This pass settles each
on the Comprehensive Rules instead of trying to fix it.

**Method.** For each item: read the card text and the facet, look the rules up with
`.claude/skills/riftbound-rules/scripts/rule.ts`, and check whether the community answer is *stale* (pre-Unleashed
text the current CR supersedes, or contradicted by a second riftjudge answer) before declaring a live conflict.
That check paid: 10 of 17 were stale or misread, and one was not a conflict at all.

**Outcome.** 10 CR-wins (facet rewritten as a passing test, item closed) · 7 engine-wrong (real bugs, reopened with
fix sites) · 0 left genuinely undecided. Every parked item in `failed/` — these plus the 17 capability/embargo/bad-repro
ones — now carries `"noRequeue": true`, and `fix-queue.ts requeue-failed` skips it.

---

## (a) CR wins — ruling stale or wrong; facet now a PASSING test asserting the engine

Each rewritten facet carries a `// RULING-CONFLICT` comment naming the ruling, the rule, and a "previously
asserted the opposite, do not flip back" line. Items moved to `done/`.

| id | question (one sentence) | ruling says | CR says | verdict · now lives in |
|---|---|---|---|---|
| `2688d35630c1` | Does Sun Disc's own play satisfy its `[Legion]` on the turn it is played? | yes — the ability is separate from the card and sees that a card was played | **no** — 812.1.c needs "a card DIFFERENT than the one with the Legion ability … Finalized by you on the same turn" (812.1.b.1 "another card") | ruling wrong · `rulings/baited-hook-4bd896c444b3c607.test.ts` |
| `cf3ad3938e34` | With no `[Legion]`, may Sun Disc be tapped "for no effect"? | yes, the cost is paid and nothing happens | **no** — 812.1.b.1/812.1.c leave the Dependent Ability Inactive, so the activated ability is not on the card to activate | ruling wrong · same file |
| `99cac87aa3a4` | Hidden Blade's target is saved from the kill — does its controller still draw 2? | yes | **no** — 355.10.d uses this exact sentence ("targets the unit, but not its controller") and 359.3.e.5's own Hidden Blade example ignores "any instructions related to that unit"; 359.3.e.7/.e.12 make "its controller" null | ruling wrong · `rulings/hidden-blade-719c8ada539c1401.test.ts` (see Open question 1) |
| `f52b2c46ed62` | May Stalking Wolf be played, at Reaction speed, to the battlefield its own additional cost just emptied? | yes — "you may play me to its battlefield (even if you don't have other units there)" | **no** — that clause grants LOCATION validity (822.3.a); the Reaction comes from conditional `[Ambush]` (813.4/813.4.a) and fails step 5 Check Legality once the destination is empty (813.4.b, 822.3) | ruling wrong; official `57b3e2849ef0109a` agrees with the CR · `rulings/stalking-wolf-7c7de024a0a95e9c.test.ts` (all 3 facets) |
| `17d8f4d9a8f8` | Does a play trigger of a unit Promising Future played resolve before or after the other card PF played? | after — PF finishes everything first | **before** — the queued spell keeps its older append slot (337.1.b), so the later-appended trigger is newest and 340.1 resolves it first | ruling wrong · `rulings/promising-future-95688f6f6f4b0da4.test.ts` |
| `555a85d71eb8` | Can a card played by Promising Future be countered? | no — it resolves inside PF's resolution | **yes** — 354.3 leaves it Pending, 337.1/337.1.b finalize after PF, 337.4 then gives priority | ruling wrong; riftjudge `22ed336a9af8edc9` agrees with the CR · same file |
| `01bd7f7c1abc` | Do units carry attacker/defender designations while the open showdown is still running? | no — only once it closes and combat begins | **yes** — 323.14 turns it into a Combat Showdown, 464.2 calls that combat opening, 464.2.c.3 stamps designations "now" (464.2.c.1.b assumes exactly this case) | ruling half-wrong (its other half — the showdown does not end early — is right and stays asserted) · `rulings/ride-the-wind-33552d2333fd187b.test.ts` |
| `12a7be869edc` | With a gear on the board, must Salvage target it? | yes — a gear must be targeted | **no** — post-errata "up to one gear" + 355.13 make zero a legal answer | ruling describes the pre-errata wording · `rulings/salvage-eea5054e0caa29a0.test.ts` (already rewritten in-tree; item closed) |
| `bceae31f8e7b` | Does an already-damaged enemy die the instant Elder Dragon enters? | yes (`4085408cc733a662`) / no, it survives to be healed (`d0b7f94188fac000`, `e936e0fd5ae150ce`) | **both** — 142.4.c alters lethal damage only "for enemy units that have damage marked BY YOU" | **not a conflict — bad repro.** The seed carried no attributor. Verified: with `lastDamagedBy` = the Dragon's controller the enemy is in the trash before the play trigger asks; with any other attributor it lives · `rulings/elder-dragon-4085408cc733a662.test.ts` (+ a contrast facet) |
| `d3db201455ae` | With 0 fury, is Buccaneer's "pay [fury] to …" opt-in shown at all? | it should be silent — the item takes its priority window and does nothing | the *silent no-op* cannot exist: "[X] to [Y]" is the trigger's base cost (355.10.c.1) and 404.2 removes an unpaid item. Hidden-vs-shown is engine convention, not CR | WONTFIX confirmed; engine surfaces it with `canAccept:false` (DESIGN.md § Paying costs, ~200 tests) · `interactions/buccaneer-cost-discard-chompers-waits.test.ts` |

## (b) Engine wrong — real bugs, reopened in `open/` with fix sites

All seven are one rules question with one CR answer: **a specific Game Object that an item's own text tells its
controller to choose is chosen in the Make Relevant Choices step (355.5 for a card, 402.2 for an ability) and
locked there (355.15)**; 355.10 is a closed list of carve-outs and none of them applies to these cards. The engine
defers them to resolution. Where a community ruling also said "resolution", the CR supersedes it too.

| id | question | CR citation | fix site (abridged — full hint on the item) |
|---|---|---|---|
| `06e8cde00a83`, `b6fb00d493bb` | Is Forge of the Future's "recycle up to 4 cards from trashes" set chosen at finalization or resolution? | **finalization** — a trash is Public (355.10.a.1), so 355.5/355.7 + 402.2 choose it and 355.15 locks it; the "Kill this" cost is paid later, in step 4 (357.2), so the Forge can never be in its own set | `cards/ogn/forge-of-the-future.ts` + `moves/play/make-choices.ts`, `abilities/target-slots.ts`; the 4 green facets in the same file and the ogn-212-298/Karma suites move with it. riftjudge `2f2fb3a61bb3446a` superseded |
| `57ef4e17f5c4` | When is Deceiver's copy source ("another unit there") chosen? | **finalization** — 355.5/355.7/355.10 + 402.2 | `cards/unl/deceiver.ts` (drop `chooseAtResolution`) + `make-choices.ts`; 8 green facets across `deceiver-*` / `reflection-40ecc1be71f6fc76`. Residual wrinkle → Open question 2 |
| `bff64291e60b`, `f635907c4a88` | Are Shuriken Flip's friendly mover and its destination supplied at play or at resolution? | **play** — 355.10.f keys on the literal templating word "must" (its own contrast pair is "you MUST recycle one of your runes" vs "recycle a rune you control", both mandatory), and "then move a friendly unit" has none, so it targets; 355.4 puts the destination in step 2 | `abilities/effects/move.ts:601` — the `chooseAtResolution` branch is justified in-code by a 355.10.f reading this pass rejects — plus `abilities/move-destinations.ts`; green facets 1/5/6 in the same file must change (`cast(targets:[foe])` stops being a legal variant) |
| `fd40801abfa1` | Is the trash spell of Kai'Sa's conquer trigger named at finalization? | **yes** — 355.10.a: the trash is Public, so "play a spell from your trash" is an ordinary target | `cards/ogn/kaisa-evolutionary.ts` needs `location:'trash'`; the dynamic `{points:'controller'}` bound is missing from the target resolver's `matchesPrintedCostFilter` (a drifted copy of the one in `abilities/effects/play.ts`). The follow-on sequencing half → Open question 3 |
| `3e4eeae2344c` | Can Relentless Pursuit be played with no Equipment in play? | **no** — 355.12: "you may \<verb\> a \<descriptor\>" defers the DECISION, never the OBJECT; with nothing to name, 355.8 keeps the spell off the chain. (The Salvage errata is the precedent: "you may kill a gear" had to be re-worded to "up to one gear" to make zero legal.) | `cards/sfd/relentless-pursuit.ts` — make the Equipment a play-time target (`holder:'bound'`). 8 facets in `relentless-pursuit-*`, `warwick-hunter-a06a580c2b2fadd1`, `sfd-184-221`, `leave-no-reconquer` cast it with no Equipment and are wrong under this adjudication. Needs the two-named-objects capability parked as `85be115e663c` / `dc844d499933` |

riftjudge `4283ca02526c0650` (Relentless Pursuit) turns out to be **right** — it is the one ruling in the set the
engine should have followed.

The finalize-vs-resolve doctrine itself is written up in DESIGN.md § "Choices and when they are made"; the
capability that makes it implementable is lane `wp-makechoices`'s. Each of the seven items carries
`"noRequeue": true` as well, so a failed attempt before that capability lands does not restart the churn.

## (c) Genuinely ambiguous — none

Nothing in the 17 needed to stay undecided. Three *residual* questions survive the pass, none of them blocking:
they are recorded in DESIGN.md § "Open rules questions (need a human or an official ruling)" (Hidden Blade's
linked draw, Deceiver's "another", and the naming-vs-playing sequencing behind Kai'Sa). Each is already
implemented one way and pinned by tests; an official answer would change something, which is why they are written
down instead of being re-derived a fifth time.

## Churn fix

`.claude/fix-queue/fix-queue.ts` gained an `Item.noRequeue` field; `requeue-failed` skips any item carrying it and
reports the count (`{"requeued":N,"skipped_parked":M}`). Set it on an item no engine lane can close; clear it by
hand when the blocker is gone. Applied to all 24 permanently-parked items (7 reopened bugs + 17 pre-existing
capability / embargo / bad-repro parks).
