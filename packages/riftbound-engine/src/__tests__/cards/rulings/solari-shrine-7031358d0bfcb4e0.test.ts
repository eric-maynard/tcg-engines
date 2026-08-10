/**
 * Ruling 7031358d0bfcb4e0 — Solari Shrine (OGN-072 → ogn-072-298) · Gear · Calm · [3]
 *   "When you kill a stunned enemy unit, you may exhaust this to draw 1."
 *
 * Q: Can Solari Shrine be exhausted to draw after winning a COMBAT against a stunned unit?
 * A: Yes. When your unit wins the combat and the opponent's stunned unit goes to the trash, that is "you kill a stunned
 *    enemy unit" — the kill need not come from a spell that says "kill"; combat kills count.
 * Rules: 428.5.c.2 (units killed in the Combat Cleanup are attributed to the sources of the combat damage and their
 *        controller), 383.3.b ("you may exhaust this" is the trigger's cost, paid on accepting).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SOLARI_SHRINE = "ogn-072-298";
/** Inline "[Action] Stun a unit." so the stun is applied in-game rather than seeded. */
const DAZE = {
  abilities: [{ effect: { target: { type: "unit" }, type: "stun" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "calm",
  energyCost: 1,
  name: "Daze (inline)",
  rulesText: "[Action] Stun a unit.",
  timing: "action",
} as const;

/** P1's turn with [1]. P1: ready Solari Shrine in base, Brawler (4) in base, Daze in hand, known deck. P2 holds bf1 with a Sentry (3). */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .gear(P1, SOLARI_SHRINE, "shrine")
    .unit(P1, "base", { might: 4, name: "Brawler" }, "brawler")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Sentry" }, "sentry")
    .hand(P1, DAZE, "daze")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

describe("Ruling 7031358d0bfcb4e0 — a combat kill of a stunned enemy unit triggers Solari Shrine", () => {
  test("stun the Sentry, attack it with the Brawler and win: the stunned Sentry dies in the combat cleanup → Shrine offers 'exhaust to draw 1' to P1; yes ⇒ Shrine exhausted, 1 card drawn", async () => {
    const game = await board().build();
    await game.p1.cast("daze", { targets: "sentry" });
    await game.settle();
    expect(game.state("sentry").isStunned).toBe(true);
    await game.p1.move("brawler", "bf1");
    const r = await game.settle(); // both pass Focus; combat: stunned Sentry deals nothing, takes 4 and dies
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.state("brawler")).toMatchObject({ damage: 0, location: "bf1" });
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "shrine", pendingChoiceType: "opt-in" } });
    expect(game.p1.hand()).toEqual([]);
    await game.p1.yes();
    expect(game.state("shrine").isExhausted).toBe(true); // the cost, paid on accepting
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // and the combat was won: conquered
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — the same combat kill of an UN-stunned Sentry offers nothing: Shrine stays ready, no draw", async () => {
    const game = await board().build();
    await game.p1.move("brawler", "bf1");
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("shrine").isExhausted).toBe(false);
    expect(game.p1.hand()).toEqual(["daze"]); // Daze never cast, nothing drawn
    expect(game.p1.deck().slice(0, 2)).toEqual(["d1", "d2"]);
  });
});
