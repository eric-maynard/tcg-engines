/**
 * Ruling f0eeee907483b5a3 — Star-Crossed (UNL-128 → unl-128-219) · [Reaction] · [3][chaos] "Return a friendly unit and an enemy unit
 *     to their owners' hands."
 *   × Deathgrip (SFD-163 → sfd-163-221) · [Reaction] · [2] "Kill a friendly unit. If you do, give +[Might] equal to its Might to
 *     another friendly unit this turn. Draw 1."
 *
 * Q: If Star-Crossed returns the enemy unit that was to RECEIVE Deathgrip's Might, does the unit chosen to be killed still die?
 * A: Yes — LIFO: Star-Crossed bounces the would-be recipient first; Deathgrip then resolves partially: the kill target is still
 *    legal and dies, no Might is given (the recipient is gone), and the caster still draws 1. (The answer — self-flagged
 *    "could not fully verify" — also asserts BOTH units are locked as targets when Deathgrip is played.)
 * Rules: 340 (LIFO), 359.3.e.8 (resolve on remaining legal targets), 359.3.e.14 ("If you do"), 359.3.e.5 (Draw 1 independent).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STAR_CROSSED = "unl-128-219";
const DEATHGRIP = "sfd-163-221";

/**
 * P1's turn with exactly [2]; P2 has exactly [3][chaos]. P1: Victim (3) at P1's bf1 and Recipient (2) in base — the ONLY other
 * friendly unit (`extraAlly` adds a third). P2: a 1-Might Pawn in base (Star-Crossed's own "friendly unit"). Known P1 deck.
 */
function board(extraAlly = false) {
  const b = scenario()
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 3, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Victim" }, "victim")
    .unit(P1, "base", { might: 2, name: "Recipient" }, "rec")
    .unit(P2, "base", { might: 1, name: "Pawn" }, "pawn")
    .hand(P1, DEATHGRIP, "grip")
    .hand(P2, STAR_CROSSED, "sc")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
  return extraAlly ? b.unit(P1, "base", { might: 1, name: "Spare" }, "spare") : b;
}

/** Deathgrip on the Victim; P1 passes; P2 Star-Crosses [Pawn, Recipient]. */
async function gripThenStarCrossed(game: Game): Promise<void> {
  await game.p1.cast("grip", { targets: "victim" });
  expect(game.p1.energy()).toBe(0);
  await game.p1.passPriority();
  expect(game.p2.can("cast", "sc")).toBe(true);
  await game.p2.cast("sc", { targets: ["pawn", "rec"] });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["grip", "sc"]);
  expect(game.chain()[1]).toMatchObject({ controller: P2, targets: ["pawn", "rec"] });
}

describe("Ruling f0eeee907483b5a3 — Star-Crossed bouncing Deathgrip's would-be recipient: the victim still dies, no bonus, still draw", () => {
  // RULING-CONFLICT: riftjudge f0eeee907483b5a3 says the recipient is locked as a second target when Deathgrip is played;
  // riftjudge 90c84f3c7db78fd3 (green test deathgrip-90c84f3c7db78fd3) says only the victim is chosen at play and the recipient
  // "if you do … another friendly unit" is chosen as the spell resolves — engine follows the latter (one play-time slot).
  test("as played, Deathgrip's chain item carries ONE target — the Victim; the recipient is not named yet", async () => {
    const game = await board().build();
    const slot = game.p1.option("cast", "grip")?.fields.find((f) => f.name === "targets");
    expect(slot).toMatchObject({ max: 1, min: 1 });
    await game.p1.cast("grip", { targets: "victim" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "grip", controller: P1, targets: ["victim"] })]);
  });

  test("Star-Crossed [Pawn, Recipient] resolves first (LIFO): both go to their owners' hands while Deathgrip still waits with its Victim target intact", async () => {
    const game = await board().build();
    await gripThenStarCrossed(game);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("sc")).toBe("trash");
    expect(game.zoneOf("rec")).toBe("hand");
    expect(game.zoneOf("pawn")).toBe("hand");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "grip", targets: ["victim"] })]);
    expect(game.zoneOf("victim")).toBe("battlefield-bf1");
  });

  test("then Deathgrip resolves partially, exactly as ruled: the Victim (still legal) DIES, no unit receives any Might (the only other friendly unit left the board — nothing is even asked), and P1 still draws 1", async () => {
    const game = await board().build();
    await gripThenStarCrossed(game);
    const r = await game.settle();
    expect(r.reason).toBe("open"); // no recipient prompt was raised
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("grip")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.state("rec")).toMatchObject({ mightModifier: 0, zone: "hand" });
    expect(game.p1.hand().sort()).toEqual(["d1", "rec"]); // Recipient bounced + Draw 1
    expect(game.p1.deck()[0]).toBe("d2");
    expect(game.violations()).toEqual([]);
  });

  // RULING-CONFLICT (same as above): under riftjudge f0eeee907483b5a3's "recipient locked at play" reading the bonus would simply be
  // lost here too; under the engine's model (riftjudge 90c84f3c7db78fd3) the recipient is chosen on resolution among the friendly
  // units still on the board, so a remaining Spare can take the Victim's +3.
  test("engine model contrast: with a third friendly unit (Spare) still on the board, the recipient is determined at RESOLUTION — Spare (the only remaining candidate) gets the Victim's +3", async () => {
    const game = await board(true).build();
    await gripThenStarCrossed(game);
    const r = await game.settle();
    if (r.reason === "unanswered") {
      expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
      await game.p1.pick("spare");
      await game.settle();
    }
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.state("spare")).toMatchObject({ might: 4, mightModifier: 3 });
    expect(game.p1.hand().sort()).toEqual(["d1", "rec"]);
  });
});
