/**
 * Ruling 6e6edb9b1676347a — Leona, Determined (OGN-238 → ogn-238-298) · [4][order] · 4 Might "[Shield] When I attack, stun an
 *     enemy unit here."
 *   × Reaver's Row (OGN-285 → ogn-285-298, battlefield) "When you defend here, you may move a friendly unit here to base."
 *   × Blastcone Fae (OGN-097 → ogn-097-298) · 2 Might "[Hidden] When you play me, give a unit -2 [Might] this turn, to a minimum of 1."
 *   (× Blast Cone UNL-133 — mentioned; not needed for the ruling.)
 *
 * Q: Leona attacks Reaver's Row and her stun triggers — is the target chosen at finalization or on resolution? If the defender
 *    then plays a unit (Blastcone Fae), can Leona stun the newcomer?
 * A: At FINALIZATION. Initial-chain order: the attacker's triggers are finalized first (Leona's target chosen), then the
 *    defender's (Reaver's Row); only then does the defender get priority. A Fae played at that point arrived after Leona's
 *    target was declared — it cannot be changed to her.
 * Rules: 344 (initial chain: attacker's triggers, then defender's), 355.5 (targets chosen when finalized), 383.4.e, 811.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LEONA = "ogn-238-298";
const REAVERS_ROW = "ogn-285-298";
const BLASTCONE_FAE = "ogn-097-298";

/**
 * Turn 3, P1's turn. "row" = live Reaver's Row held by P2 with a Guard (3) and a Squire (2), and P2's Blastcone Fae facedown
 * there (hidden earlier). Leona ready in P1's base.
 */
function board() {
  return scenario()
    .turn(3)
    .battlefield("row", { controller: P2, def: REAVERS_ROW, inert: false })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "row", { might: 3, name: "Guard" }, "guard")
    .unit(P2, "row", { might: 2, name: "Squire" }, "squire")
    .facedown(P2, "row", BLASTCONE_FAE, "fae")
    .unit(P1, "base", LEONA, "leona");
}

/** Leona attacks the Row: P1 locks her stun on the Guard, P2 declines the Row's optional move; P1 passes → P2 has priority. */
async function initialChainFinalized(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("leona", "row");
  // 1) attacker's trigger finalized first: P1 is asked Leona's target NOW (finalization), among the enemy units here.
  const d1 = game.decision();
  expect(d1).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "leona" } });
  expect(d1?.kind === "pick" ? d1.options.map((o) => o.key).sort() : []).toEqual(["guard", "squire"]);
  await game.p1.pick("guard");
  expect(game.chain()[0]).toMatchObject({ cardId: "leona", targets: ["guard"], triggered: true });
  // 2) then the defender finalizes Reaver's Row ("you may" decided at finalization) — P2 declines.
  const d2 = game.decision();
  expect(d2).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "row" } });
  await game.p2.no();
  // 3) all items finalized → priority: P1 (turn player) first, then the defender.
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 6e6edb9b1676347a — Leona's stun target is fixed at finalization; a Fae played afterwards can't become it", () => {
  test("finalization order on the initial chain: Leona's target (P1) is asked and locked BEFORE Reaver's Row (P2) is finalized, and before anyone has priority", async () => {
    await initialChainFinalized();
  });

  test("with priority, the defender plays the hidden Blastcone Fae here (aiming its -2 at Leona); Leona's chain item still names the Guard and P1 is never re-asked", async () => {
    const game = await initialChainFinalized();
    expect(game.p2.can("reveal", "fae")).toBe(true);
    await game.p2.reveal("fae");
    expect(game.zoneOf("fae")).toBe("battlefield-row");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2, source: { cardId: "fae" } });
    await game.p2.pick("leona");
    expect(game.chain().map((c) => c.cardId)).toEqual(["leona", "fae"]);
    expect(game.chain()[0]?.targets).toEqual(["guard"]); // unchanged
    // Resolve everything on the chain; at no point is P1 offered a (re)target pick for Leona.
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      const dd = game.decision();
      expect(dd?.kind === "pick" && dd.seat === P1).toBe(false);
      if (dd?.kind !== "action") {
        break;
      }
      await game.seat(dd.seat).passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("guard").isStunned).toBe(true); // the declared target
    expect(game.state("fae").isStunned).toBe(false); // the newcomer is not
    expect(game.state("squire").isStunned).toBe(false);
    expect(game.state("leona").might).toBe(2); // Fae's -2 did land on Leona (4 → 2)
    expect(game.violations()).toEqual([]);
  });

  test("a forced attempt to switch Leona's target to the Fae after it arrives is not a legal answer to anything", async () => {
    const game = await initialChainFinalized();
    await game.p2.reveal("fae");
    await game.p2.pick("leona");
    // It is P2's/P1's PRIORITY now — there is no open Leona pick; naming the Fae for P1 is rejected.
    const r = await game.p1.try((p) => p.pick("fae"));
    expect(r.ok).toBe(false);
    expect(game.chain()[0]?.targets).toEqual(["guard"]);
  });
});
