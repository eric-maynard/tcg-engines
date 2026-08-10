/**
 * Ruling 3a767243c8d87c0b — Gust (OGN-169 → ogn-169-298) · Reaction · Chaos · 1
 *     "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   × Viktor, Leader (OGN-246 → ogn-246-298) "When another non-Recruit unit you control dies, play a 1 [Might]
 *     Recruit unit token into your base."   (token under test: Sprite, ogn-274-298, 3 Might [Temporary])
 *
 * Q: If I Gust a token, does that count as dying for (yellow) Viktor's ability?
 * A: No. A token returned to hand does not die — it simply ceases to exist. No death trigger.
 * Rules: 186.1 (a token leaving the board ceases to exist), 421 (dying = killed, board → trash), 383.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const VIKTOR_LEADER = "ogn-246-298";
const SPRITE = "ogn-274-298";

/** P2's turn with exactly 1 energy for Gust. P1 holds bf1 with Viktor, Leader and a 3-Might Sprite token there. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", VIKTOR_LEADER, "viktor")
    .unit(P1, "bf1", SPRITE, "sprite")
    .hand(P2, GUST, "gust");
}

describe("Ruling 3a767243c8d87c0b — a token bounced by Gust ceases to exist; it did not die, so Viktor, Leader does not trigger", () => {
  test("Gust can choose the 3-Might Sprite token at a battlefield (Viktor at 4 Might cannot be chosen)", async () => {
    const game = await board().build();
    expect(game.state("sprite")).toMatchObject({ isToken: true, might: 3, zone: "battlefield-bf1" });
    const offered = (game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toContain("sprite");
    expect(offered).not.toContain("viktor");
  });

  test("Gust resolves: the Sprite leaves the board and ceases to exist (not in any hand, not in the trash); no Viktor trigger, no Recruit", async () => {
    const game = await board().build();
    const p1Hand = game.p1.hand().length;
    await game.p2.cast("gust", { targets: "sprite" });
    expect(game.p2.energy()).toBe(0);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("sprite")).toBe("gone"); // 186.1 — ceased to exist
    expect(game.has("sprite")).toBe(false);
    expect(game.p1.hand()).toHaveLength(p1Hand); // a token never reaches the hand
    expect(game.p1.trash()).not.toContain("sprite"); // and it was not killed
    // Nothing died: Viktor's ability is not on the chain and no Recruit exists.
    expect(game.chain()).toEqual([]);
    const stop = await game.settle();
    expect(stop.reason).toBe("open");
    expect(game.findAll({ name: "Recruit" })).toEqual([]);
    expect(game.p1.units().toSorted()).toEqual(["viktor"]);
    expect(game.violations()).toEqual([]);
  });

  test("control: when the same Sprite is KILLED instead, Viktor does trigger and a Recruit token appears in P1's base", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", VIKTOR_LEADER, "viktor")
      .unit(P1, "bf1", SPRITE, "sprite")
      .hand(P2, { abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }], cardType: "spell", domain: "fury", energyCost: 1, name: "Bolt", timing: "action" }, "bolt")
      .build();
    await game.p2.cast("bolt", { targets: "sprite" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("sprite")).toBe("gone");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "viktor", triggered: true })]);
    await game.settle();
    const recruits = game.findAll({ name: "Recruit" });
    expect(recruits).toHaveLength(1);
    expect(game.state(recruits[0] as string)).toMatchObject({ controller: P1, zone: "base" });
  });
});
