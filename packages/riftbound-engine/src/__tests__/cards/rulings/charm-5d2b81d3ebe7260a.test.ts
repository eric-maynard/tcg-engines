/**
 * Ruling 5d2b81d3ebe7260a — Charm (OGN-043 → ogn-043-298) · Spell · [1][calm] · "Move an enemy unit."
 *   × Vilemaw's Lair (OGN-295 → ogn-295-298) · Battlefield · "Units can't move from here to base."
 *   (unl-060-219 Vilemaw is listed by the scrape; the answer is about the Lair.)
 *
 * Q: Where can Charm move a unit? Is it bound by the unit's standard-move limits (e.g. needs Ganking to go battlefield→battlefield)?
 * A: To either battlefield or to the unit's OWN base, regardless of standard-move restrictions (those only govern the exhaust-to-move
 *    action) — so no Ganking needed, and exhausted units can be Charmed. Never to another player's base or a non-location. External
 *    "can't" effects still apply: a unit at Vilemaw's Lair cannot be Charmed to base.
 * Rules: 446–447 (move effects vs the Standard Move; valid destinations), 141 (Standard Move costs exhaust), 105 ("can't" beats "can").
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";
const VILEMAWS_LAIR = "ogn-295-298";

type PickD = Extract<Decision, { kind: "pick" }>;

/** P1's turn with [1][calm] and Charm. P2's EXHAUSTED, Ganking-less Spider sits at bf1; bf2 is empty/uncontrolled. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 3, name: "Spider" }, "spider", { exhausted: true })
    .unit(P1, "base", { might: 2, name: "Homebody" }, "homebody")
    .hand(P1, CHARM, "charm");
}

async function charmSpider(): Promise<{ game: Game; dest: PickD }> {
  const game = await board().build();
  expect(game.state("spider")).toMatchObject({ isExhausted: true, keywords: [] });
  await game.p1.cast("charm", { targets: "spider" });
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  expect((d as PickD).prompt).toMatch(/destination/i);
  return { dest: d as PickD, game };
}

describe("Ruling 5d2b81d3ebe7260a — Charm moves an enemy unit to any battlefield or its own base, ignoring standard-move limits", () => {
  test("the destination menu for the exhausted, non-Ganking Spider at bf1 is exactly: the other battlefield or (its owner's) base — no trash, no bf1, nothing else", async () => {
    const { dest } = await charmSpider();
    expect(dest.options.map((o) => o.key).toSorted()).toEqual(["base", "battlefield-bf2"]);
  });

  test("battlefield → battlefield without Ganking and while exhausted: Spider goes to bf2 (still exhausted — Charm pays no exhaust cost)", async () => {
    const { game } = await charmSpider();
    await game.p1.pick("battlefield-bf2");
    await game.settle();
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.locationOf("spider")).toBe("bf2");
    expect(game.state("spider").isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("'base' means the unit's OWN (P2's) base — never the caster's", async () => {
    const { game } = await charmSpider();
    await game.p1.pick("base");
    await game.settle();
    expect(game.zoneOf("spider")).toBe("base");
    expect(game.p2.base()).toContain("spider");
    expect(game.p1.base()).not.toContain("spider");
    expect(game.state("spider")).toMatchObject({ controller: P2, owner: P2 });
  });

  test("external 'can't' still wins: a Spider at Vilemaw's Lair Charmed 'to base' stays at the Lair (bf2 would have been fine)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { calm: 1 } })
      .battlefield("lair", { controller: P2, def: VILEMAWS_LAIR, inert: false })
      .battlefield("bf2", { controller: null })
      .unit(P2, "lair", { might: 3, name: "Spider" }, "spider")
      .hand(P1, CHARM, "charm")
      .build();
    expect(game.state("spider").keywords).toContain("NoMoveToBase");
    await game.p1.cast("charm", { targets: "spider" });
    await game.settle();
    const d = game.decision() as PickD;
    expect(d.kind).toBe("pick");
    expect(d.options.map((o) => o.key)).toContain("battlefield-bf2");
    if (d.options.some((o) => o.key === "base")) {
      await game.p1.pick("base");
      await game.settle();
      expect(game.zoneOf("spider")).toBe("battlefield-lair"); // the move to base simply doesn't happen
    } else {
      // Equally acceptable: base is not even offered.
      expect(d.options.map((o) => o.key)).toEqual(["battlefield-bf2"]);
      await game.p1.pick("battlefield-bf2");
      await game.settle();
      expect(game.locationOf("spider")).toBe("bf2");
    }
    expect(game.zoneOf("charm")).toBe("trash");
  });
});
