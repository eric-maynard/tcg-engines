/**
 * Ruling 314bd1dbd62b82c1 — Challenge (OGN-128 → ogn-128-298) · Spell · Body · 2+[body] · [Action]
 *   "Choose a friendly unit and an enemy unit. They deal damage equal to their Mights to each other."
 *   × Star-Crossed (UNL-128 → unl-128-219) · Spell · Chaos · 3+[chaos] · [Reaction]
 *   "Return a friendly unit and an enemy unit to their owners' hands."
 *
 * Q: Can Challenge be played during the chain of Star-Crossed?
 * A: No. Challenge is an [Action]; Actions need an Open State (no chain). While Star-Crossed is on the chain the game
 *    is in a Closed State and only [Reaction]s may be played. Once the chain is gone, Challenge is legal again.
 * Rules: 309.1.a / 331.1.a (Closed State: Reactions only), 336/343 (Action timing), FAQ #4454.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CHALLENGE = "ogn-128-298";
const STAR_CROSSED = "unl-128-219";
/** A cheap slow spell for P1 to open a chain the opponent can react to. */
const PEBBLE = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, type: "spell" }],
  cardType: "spell",
  domain: "body",
  energyCost: 1,
  name: "Pebble",
} as const;

/** P1's turn. Each side has two units at bf1. P1: Challenge + Star-Crossed + Pebble with mana for all; P2: Star-Crossed. */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { body: 1, chaos: 1 } })
    .resources(P2, { energy: 3, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Ally A" }, "a1")
    .unit(P1, "bf1", { might: 4, name: "Ally B" }, "a2")
    .unit(P2, "bf2", { might: 3, name: "Foe A" }, "b1")
    .unit(P2, "bf2", { might: 2, name: "Foe B" }, "b2")
    .hand(P1, CHALLENGE, "challenge")
    .hand(P1, STAR_CROSSED, "sc1")
    .hand(P1, PEBBLE, "pebble")
    .hand(P2, STAR_CROSSED, "sc2");
}

describe("Ruling 314bd1dbd62b82c1 — Challenge (Action) is not playable while Star-Crossed is on the chain", () => {
  test("premise: in P1's open main phase Challenge IS legal", async () => {
    const game = await board().build();
    expect(game.chain()).toEqual([]);
    expect(game.p1.can("cast", "challenge")).toBe(true);
  });

  test("opponent's Star-Crossed: P1 casts Pebble, P2 reacts with Star-Crossed; with Star-Crossed on the chain and P1 holding priority, Challenge is NOT offered and an attempt is rejected", async () => {
    const game = await board().build();
    await game.p1.cast("pebble", { targets: "b1" });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "sc2")).toBe(true); // a Reaction is fine in the closed state
    await game.p2.cast("sc2", { targets: ["b2", "a1"] });
    await game.p2.passPriority();
    expect(game.chain().map((c) => c.cardId)).toEqual(["pebble", "sc2"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "challenge")).toBe(false);
    const r = await game.p1.try((p) => p.cast("challenge", { targets: ["a2", "b1"] }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("challenge")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 5, power: { body: 1, chaos: 1 } }); // nothing spent on Challenge
  });

  test("own Star-Crossed: even the caster, keeping priority on their own turn, cannot follow up with Challenge while the chain exists", async () => {
    const game = await board().build();
    await game.p1.cast("sc1", { targets: ["a1", "b2"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["sc1"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "challenge")).toBe(false);
    const r = await game.p1.try((p) => p.cast("challenge", { targets: ["a2", "b1"] }));
    expect(r.ok).toBe(false);
  });

  test("once the chain has fully resolved (open state again, still P1's turn) Challenge becomes legal and works: Ally B (4) and Foe A (3) trade damage", async () => {
    const game = await board().build();
    await game.p1.cast("sc1", { targets: ["a1", "b2"] });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("a1")).toBe("hand");
    expect(game.zoneOf("b2")).toBe("hand");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "challenge")).toBe(true);
    await game.p1.cast("challenge", { targets: ["a2", "b1"] });
    await game.settle();
    expect(game.zoneOf("challenge")).toBe("trash");
    expect(game.zoneOf("b1")).toBe("trash"); // 4 into a 3
    expect(game.state("a2")).toMatchObject({ damage: 3, zone: "battlefield-bf1" });
    expect(game.violations()).toEqual([]);
  });
});
