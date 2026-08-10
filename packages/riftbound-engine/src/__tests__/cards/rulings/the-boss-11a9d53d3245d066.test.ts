/**
 * Ruling 11a9d53d3245d066 — The Boss (OGN-269 → ogn-269-298, Sett legend) × Hidden Blade (OGN-213 → ogn-213-298)
 *   The Boss: "If a buffed unit you control would die, you may pay [rainbow], exhaust me, and spend its buff to
 *   heal it, exhaust it, and recall it instead. When you conquer, ready me."
 *   Hidden Blade: 2 + [order] [Action] "Kill a unit at a battlefield. Its controller draws 2."
 *
 * Q: When The Boss saves a buffed unit from dying, can the opponent respond with removal (e.g. Hidden Blade)
 *    after the cost is paid but before the unit is recalled?
 * A: No. It is a replacement effect (errata), not a triggered ability: it never uses the chain. Once the cost is
 *    paid the unit is immediately healed, exhausted and recalled with its buff spent — no window in between.
 * Rules: 369–372 (replacement effects don't use the chain), 371.2 (optional costed replacement), 702.2.b (spend buff).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const THE_BOSS = "ogn-269-298";
const HIDDEN_BLADE = "ogn-213-298";

/** Inline 1-cost action spell: deal 4 to a unit — lethal for the buffed 2(+1)-Might ally. */
const BOLT = {
  abilities: [{ effect: { amount: 4, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
};

/**
 * P2's turn. P1: The Boss + a BUFFED 2-Might ally at bf1 and exactly one power for [rainbow]. P2: a lethal bolt
 * (1) and Hidden Blade (2 + [order]) in hand with the resources for both.
 */
function board() {
  return scenario()
    .active(P2)
    .legend(P1, THE_BOSS, "boss")
    .resources(P1, { energy: 0, power: { body: 1 } })
    .resources(P2, { energy: 3, power: { order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Buffed Ally" }, "ally", { buffed: true })
    .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
    .hand(P2, BOLT, "bolt")
    .hand(P2, HIDDEN_BLADE, "blade");
}

/** P2 bolts the ally; everyone passes; the ally WOULD die → The Boss's offer is put to P1. */
async function allyAboutToDie(): Promise<Game> {
  const game = await board().build();
  expect(game.state("ally")).toMatchObject({ isBuffed: true, might: 3 });
  await game.p2.cast("bolt", { targets: "ally" });
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  return game;
}

describe("Ruling 11a9d53d3245d066 — The Boss's save is a chain-less replacement: no response window between paying and the recall", () => {
  test("the 'would die' moment: P1 gets a yes/no offer (not a chain item), the ally has not died, and nothing of The Boss is on the chain", async () => {
    const game = await allyAboutToDie();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(game.zoneOf("ally")).toBe("battlefield-bf1");
    expect(game.chain().some((c) => c.cardId === "boss")).toBe(false);
    // While the replacement question is open P2 has no action window at all.
    expect(game.actingSeat()).toBe(P1);
    expect(game.p2.can("cast", "blade")).toBe(false);
  });

  test("P1 accepts: in that same step the cost is paid ([rainbow] + Boss exhausted + buff spent) AND the ally is already healed, exhausted and in base — the chain is empty, no Boss item ever appeared", async () => {
    const game = await allyAboutToDie();
    await game.p1.yes();
    // Immediately after the answer — before anybody could act:
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.state("ally")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true, might: 2, zone: "base" });
    expect(game.chain().some((c) => c.cardId === "boss")).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.p1.trash()).not.toContain("ally");
  });

  test("so P2's very next opportunity to act is an open Main Phase with the ally ALREADY in base: Hidden Blade ('a unit at a battlefield') has no legal shot at it", async () => {
    const game = await allyAboutToDie();
    await game.p1.yes();
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.zoneOf("ally")).toBe("base");
    const offered = (game.p2.option("cast", "blade")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).not.toContain("ally");
    expect(game.p2.can("cast", "blade")).toBe(false); // no unit at any battlefield at all now
    const r = await game.p2.try((p) => p.cast("blade", { targets: "ally" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.violations()).toEqual([]);
  });
});
