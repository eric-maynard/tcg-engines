/**
 * Ruling 6e672365873a893b — Flame Chompers (OGN-006 → ogn-006-298) · Unit · Fury · [3] · 3 Might
 *     "When you discard me, you may pay [fury] to play me."
 *   × Chemtech Enforcer (ogn-003-298) "When you play me, discard 1." (a real discard)
 *   × Kennen, Storm of Shuriken (ven-113-166) "When you play me, [Burn 2]." (Main Deck top → trash)
 *
 * Q: If I burn cards and Flame Chompers is burned, can I play it off its own trigger?
 * A: No. "Discard" is hand → trash (422.1); [Burn] is Main Deck top → trash (440.1). Different game actions, so the
 *    "when you discard me" trigger never fires — the Chompers just sit in the trash. (Same for being killed.)
 * Rules: 422.1 (discard = from hand), 440.1 ([Burn] = from the top of the Main Deck), 383.2 (a trigger needs its event).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const FLAME_CHOMPERS = "ogn-006-298";
const CHEMTECH_ENFORCER = "ogn-003-298";
const KENNEN = "ven-113-166";

/** Inline [1] action spell that kills a unit — for the "not when killed either" facet. */
const SLAY = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Slay",
  timing: "action",
};

describe("Ruling 6e672365873a893b — burning Flame Chompers is not discarding it, so its trigger never fires", () => {
  test("control — a real DISCARD (Chemtech Enforcer) does fire it: P1 is offered the [fury] and can play the Chompers out of the trash", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 1 } })
      .hand(P1, CHEMTECH_ENFORCER, "enforcer")
      .hand(P1, FLAME_CHOMPERS, "chompers")
      .build();
    await game.p1.play("enforcer", { to: "base" });
    await game.settle(); // the Enforcer's "discard 1" has only the Chompers to take
    expect(game.zoneOf("chompers")).toBe("trash");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "chompers" } });
    await game.p1.yes();
    await game.settle({ policy: "first" });
    expect(game.zoneOf("chompers")).toBe("base");
    expect(game.p1.power("fury")).toBe(0); // the [fury] was the cost
  });

  test("ruling — [Burn 2] (Kennen) puts the Chompers from the top of the Main Deck into the trash and NOTHING is offered: no prompt, the [fury] is untouched, the Chompers stay in the trash", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { chaos: 1, fury: 1 } })
      .hand(P1, KENNEN, "kennen")
      .deck(P1, [FLAME_CHOMPERS, CHEMTECH_ENFORCER], ["chompers", "burnedToo"])
      .build();
    expect(game.p1.deck().slice(0, 2)).toEqual(["chompers", "burnedToo"]);
    await game.p1.play("kennen", { to: "base" });
    await game.settle();
    expect(game.zoneOf("chompers")).toBe("trash"); // burned
    expect(game.zoneOf("burnedToo")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // no "you may pay [fury]"
    expect(game.p1.power("fury")).toBe(1); // nothing paid
    expect(game.p1.base()).not.toContain("chompers");
    expect(game.violations()).toEqual([]);
  });

  test("nor when it is KILLED: a Chompers on the board that dies goes to the trash with no play-from-trash offer", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { fury: 1 } })
      .unit(P1, "base", FLAME_CHOMPERS, "chompers")
      .hand(P1, SLAY, "slay")
      .build();
    await game.p1.cast("slay", { targets: "chompers" });
    await game.settle();
    expect(game.zoneOf("chompers")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.power("fury")).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
