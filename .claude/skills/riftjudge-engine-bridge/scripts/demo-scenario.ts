/**
 * Built-in demo: the canonical RiftJudge-style question
 *
 *   "My enemy plays Sacrifice on my 5-Might unit; I react with Stupify
 *    reducing its Might to 4. What happens?"
 *
 * MODELLING NOTE (also surfaced in the answer's caveats):
 *   The *real* Riftbound card Sacrifice (UNL-173) does NOT target an enemy
 *   unit — its text is "As an additional cost to play this, kill a friendly
 *   [Mighty] unit. Draw 2 cards, channel a rune." So the question as literally
 *   asked rests on a misunderstanding of the card. We model the *correct*
 *   interaction:
 *     1. The enemy plays Sacrifice. Its additional cost — "kill a friendly
 *        Mighty unit" — is paid AS THE SPELL IS PLAYED, before it goes on the
 *        chain (rule 357 / RiftJudge FAQ #9906). The enemy must kill one of
 *        THEIR OWN Mighty units (here a 6-Might unit), not the asker's unit.
 *     2. Only now does the asker get priority to play Stupefy (a Reaction,
 *        OGN-095) — they target their own 5-Might unit, dropping it to 4 this
 *        turn. Stupefy can't touch the cost already paid; the asker's unit was
 *        never a Sacrifice target in the first place.
 *     3. Sacrifice resolves: the enemy draws 2, channels a rune (cosmetic,
 *        not modeled). The asker's unit survives at 4 Might.
 *
 * This demonstrates the bridge's pre-chain additional-cost model: a cost paid
 * when a spell is played cannot be undone by a later-resolving Reaction.
 *
 * Cards used: "Stupefy" — real (OGN-095). "Sacrifice" — real (UNL-173).
 */

import type { Scenario } from "./scenario-schema";

export const demoScenario: Scenario = {
  questionText:
    "My enemy plays Sacrifice on my 5-Might unit; I react with Stupify reducing its Might to 4. What happens?",
  question: "Does my unit die / does Sacrifice still go through?",
  premise: {
    turnPlayer: "opp", // the enemy is taking the action, so it's their turn
    units: [
      { id: "myUnit", side: "me", might: 5, name: "(my 5-Might unit)" },
      // The enemy must have a friendly Mighty unit of their own to pay
      // Sacrifice's additional cost — there is no way to Sacrifice an enemy unit.
      { id: "oppMighty", side: "opp", might: 6, name: "(opponent's 6-Might unit)" },
    ],
    notes:
      "Real Riftbound 'Sacrifice' (UNL-173) kills a FRIENDLY Mighty unit as an additional cost — it can't target an enemy unit at all, and the cost is paid before the spell hits the chain (rule 357). The asker's premise that Sacrifice 'targets my 5-Might unit' is a misreading of the card; the enemy actually kills one of their OWN Mighty units (the 6-Might one here).",
  },
  actions: [
    // Reactions resolve LIFO. Stupefy was played in response to Sacrifice, so
    // it resolves FIRST — list it first. (Sacrifice's COST, however, was
    // already paid before Stupefy was even legal — see `additionalCosts`.)
    {
      kind: "playSpell",
      name: "Stupefy",
      side: "me",
      effects: [
        { kind: "modifyMight", target: "myUnit", delta: -1, source: "Stupefy" },
        { kind: "draw", side: "me", count: 1, source: "Stupefy" },
      ],
    },
    // Sacrifice: its additional cost (kill a friendly Mighty unit) is paid in
    // the pre-pass at play time; its on-resolve effect is just "draw 2".
    {
      kind: "playSpell",
      name: "Sacrifice",
      side: "opp",
      additionalCosts: [
        {
          kind: "killUnit",
          target: "oppMighty",
          source: "Sacrifice (additional cost: kill a friendly Mighty unit)",
        },
      ],
      effects: [{ kind: "draw", side: "opp", count: 2, source: "Sacrifice" }],
    },
  ],
};
