/**
 * Ruling 43399be30986231a — (no specific card) does a Recall ready or exhaust the unit?
 *
 * Q: When I recall, am I ready or exhausted?
 * A: Neither — a Recall only changes location. The permanent keeps whatever ready/exhausted state (and
 *    damage, and other statuses) it had; an exhausted unit comes back to base exhausted, a ready one ready.
 * Rules: 455 (a Recall relocates a permanent to its base without being a Move), 456 (Recalls are not Moves),
 *        458 / 458.1 ("Recalls do not affect the state of the Permanent being recalled" — damage and statuses
 *        remain unaffected unless the source says otherwise). The ruling quotes the older numbering (436/436.1).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

/** [Action] "Recall a unit." — a bare Recall with no rider, so only the Recall itself is under test. */
const RECALL_SPELL = {
  abilities: [{ effect: { target: { type: "unit" }, type: "recall" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "calm",
  energyCost: 0,
  name: "Test Recall",
  rulesText: "[Action] Recall a unit.",
  timing: "action",
} as const;

/** P1 holds bf1 with two units — one exhausted, one ready — plus a bare Recall spell in hand. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Tired" }, "tired", { exhausted: true })
    .unit(P1, "bf1", { might: 4, name: "Fresh" }, "fresh")
    .hand(P1, RECALL_SPELL, "recall1")
    .hand(P1, RECALL_SPELL, "recall2");
}

describe("Ruling 43399be30986231a — a Recall changes location only; ready/exhausted is untouched", () => {
  test("an EXHAUSTED unit recalled from a battlefield arrives in base still exhausted", async () => {
    const game = await board().build();
    expect(game.state("tired")).toMatchObject({ isExhausted: true, zone: "battlefield-bf1" });
    await game.p1.cast("recall1", { targets: "tired" });
    await game.settle();
    expect(game.zoneOf("tired")).toBe("base");
    expect(game.locationOf("tired")).toBe("base");
    expect(game.state("tired")).toMatchObject({ isExhausted: true, isReady: false });
  });

  test("a READY unit recalled the same way arrives in base still ready — the Recall neither readies nor exhausts", async () => {
    const game = await board().build();
    expect(game.state("fresh")).toMatchObject({ isExhausted: false, zone: "battlefield-bf1" });
    await game.p1.cast("recall2", { targets: "fresh" });
    await game.settle();
    expect(game.zoneOf("fresh")).toBe("base");
    expect(game.state("fresh")).toMatchObject({ isExhausted: false, isReady: true });
  });

  test("458.1 in full: damage and other statuses ride along too — a damaged, stunned, exhausted unit keeps all three", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 5, name: "Battered" }, "battered", { damage: 2, exhausted: true, stunned: true })
      .hand(P1, RECALL_SPELL, "recall1")
      .build();
    await game.p1.cast("recall1", { targets: "battered" });
    await game.settle();
    expect(game.zoneOf("battered")).toBe("base");
    expect(game.state("battered")).toMatchObject({ damage: 2, isExhausted: true, isStunned: true });
    expect(game.violations()).toEqual([]);
  });

  test("the enemy's unit recalled by my spell goes to ITS OWN controller's base, still in the state it was in", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Raider" }, "raider", { exhausted: true })
      .unit(P1, "base", { might: 3, name: "Mine" }, "mine")
      .hand(P1, RECALL_SPELL, "recall1")
      .build();
    await game.p1.cast("recall1", { targets: "raider" });
    await game.settle();
    expect(game.zoneOf("raider")).toBe("base");
    expect(game.p2.base()).toContain("raider");
    expect(game.state("raider")).toMatchObject({ controller: P2, isExhausted: true });
  });
});
