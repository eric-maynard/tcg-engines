/**
 * Playful Phantom — ogn-049-298 · Unit · Calm · 5 energy (no power) · 5 Might
 *
 *   (no rules text — a vanilla unit)
 *
 * Head-judge checklist for a textless body (what can still go wrong):
 *  1. Cost is exactly [5] and NO power pip: 5 energy of any provenance pays it, 4 does not, and a
 *     pool full of calm power with 4 energy is still short. Runes tapped for energy first make up a
 *     shortfall — 3 energy + 2 runes is enough.
 *  2. Where it may be played (806.3 / 813.3.a): your base or a battlefield YOU control — never an
 *     enemy or uncontrolled battlefield. It enters EXHAUSTED either way.
 *  3. Timing: a unit with no [Action]/[Reaction] is Neutral-Open-only — not on the opponent's turn,
 *     not while a showdown is open, not while a chain is pending.
 *  4. Combat as a plain 5: attacking a 4 kills it and survives (damage healed at combat cleanup,
 *     143.3.b.2) and conquers; into a 5 both die and nothing is conquered; a 6 kills it.
 *  5. Natural Fury answers: Disintegrate's 3 leaves it alive (3 < 5) and the damage heals at end of
 *     turn (143.3.b.1); Falling Star's 3 + 3 on the same unit is exactly lethal.
 *  6. Registry payload: no abilities, no keywords, no power cost — a parser must not invent any.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ogn-049-298";
const DISINTEGRATE = "ogn-005-298"; // [Action] 4: Deal 3 to a unit at a battlefield.
const FALLING_STAR = "ogn-029-298"; // Deal 3 to a unit. Deal 3 to a unit.

describe("Playful Phantom (ogn-049-298)", () => {
  test("registry payload: a 5-cost, 5-Might calm unit with no abilities, keywords or power cost", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "calm", energyCost: 5, might: 5, name: "Playful Phantom" });
    expect(def?.abilities ?? []).toEqual([]);
    expect(def?.keywords ?? []).toEqual([]);
    expect(def?.powerCost ?? []).toEqual([]);
  });

  test("costs exactly 5 energy and no power: played to base it enters EXHAUSTED as a 5-Might unit; nothing goes on the chain but the play itself", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { calm: 1 } }).hand(P1, CARD, "pp").build();
    await game.p1.play("pp");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 1 } });
    await game.settle();
    expect(game.zoneOf("pp")).toBe("base");
    expect(game.state("pp")).toMatchObject({ baseMight: 5, damage: 0, isExhausted: true, keywords: [], might: 5 });
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("unaffordable: 4 energy is one short, and calm power cannot stand in for energy", async () => {
    const four = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "pp").build();
    expect(four.p1.can("play", "pp")).toBe(false);
    const powerRich = await scenario().resources(P1, { energy: 4, power: { calm: 3 } }).hand(P1, CARD, "pp").build();
    expect(powerRich.p1.can("play", "pp")).toBe(false);
  });

  test("runes cover the shortfall: 3 energy + tapping 2 calm runes (1 energy each) plays it and leaves both runes exhausted", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).runes(P1, "calm", 2).hand(P1, CARD, "pp").build();
    await game.p1.tapRunes(2);
    expect(game.p1.energy()).toBe(5);
    await game.p1.play("pp");
    await game.settle();
    expect(game.zoneOf("pp")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
  });

  test("may be played to a battlefield you control (enters exhausted there) — never to an enemy or uncontrolled one", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5 })
      .battlefield("mine", { controller: P1 })
      .battlefield("theirs", { controller: P2 })
      .battlefield("nobodys", { controller: null })
      .unit(P1, "mine", { might: 1 }, "flag")
      .hand(P1, CARD, "pp")
      .build();
    const to = game.p1.option("play", "pp")?.fields.find((f) => f.arg === "to")?.options ?? [];
    expect([...to].map((z) => String(z).replace(/^battlefield-/, "")).sort()).toEqual(["base", "mine"]);
    expect((await game.p1.try((p) => p.play("pp", { to: "theirs" }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.play("pp", { to: "nobodys" }))).ok).toBe(false);
    await game.p1.play("pp", { to: "mine" });
    await game.settle();
    expect(game.zoneOf("pp")).toBe("battlefield-mine");
    expect(game.state("pp").isExhausted).toBe(true);
  });

  test("timing: not playable on the opponent's turn, nor while a showdown is open on your own turn", async () => {
    const opp = await scenario().active(P2).resources(P1, { energy: 5 }).hand(P1, CARD, "pp").build();
    expect(opp.p1.can("play", "pp")).toBe(false);
    const game = await scenario()
      .resources(P1, { energy: 5 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2 }, "scout")
      .unit(P2, "bf1", { might: 2 }, "guard")
      .hand(P1, CARD, "pp")
      .build();
    expect(game.p1.can("play", "pp")).toBe(true);
    await game.p1.move("scout", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("play", "pp")).toBe(false);
  });

  test("combat as a plain 5: attacking a 4-Might defender kills it, survives (damage healed at combat cleanup) and conquers for a point", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "pp")
      .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
      .build();
    await game.p1.move("pp", "bf1");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("pp")).toBe("battlefield-bf1");
    expect(game.state("pp").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("combat negative space: into a 5 both die — nobody is left so P1 conquers nothing and the emptied battlefield goes uncontrolled (190.4.c); into a 6 only the Phantom dies", async () => {
    const trade = await scenario().battlefield("bf1", { controller: P2 }).unit(P1, "base", CARD, "pp").unit(P2, "bf1", { might: 5 }, "twin").build();
    await trade.p1.move("pp", "bf1");
    await trade.settle();
    expect(trade.zoneOf("pp")).toBe("trash");
    expect(trade.zoneOf("twin")).toBe("trash");
    expect(trade.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(trade.p1.points()).toBe(0);
    expect(trade.p2.points()).toBe(0);
    const wall = await scenario().battlefield("bf1", { controller: P2 }).unit(P1, "base", CARD, "pp").unit(P2, "bf1", { might: 6 }, "wall").build();
    await wall.p1.move("pp", "bf1");
    await wall.settle();
    expect(wall.zoneOf("pp")).toBe("trash");
    expect(wall.zoneOf("wall")).toBe("battlefield-bf1");
  });

  test("holding: a Phantom sitting on a controlled battlefield scores the hold point at the start of its controller's turn", async () => {
    const game = await scenario().turn(2).active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "pp").build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("pp").isReady).toBe(true); // awakened with the rest of the board
  });

  test("vs Disintegrate (deal 3): 3 < 5 so it survives with 3 damage, which heals at end of turn (143.3.b.1)", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 4 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "pp")
      .hand(P2, DISINTEGRATE, "dis")
      .build();
    await game.p2.cast("dis", { targets: "pp" });
    await game.settle();
    expect(game.zoneOf("pp")).toBe("battlefield-bf1");
    expect(game.state("pp").damage).toBe(3);
    await game.advanceTurn();
    expect(game.state("pp").damage).toBe(0);
    expect(game.zoneOf("pp")).toBe("battlefield-bf1");
  });

  test("vs Falling Star (3 + 3 on the same unit): exactly lethal on a 5 — the Phantom dies", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 8, power: { fury: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "pp")
      .hand(P2, FALLING_STAR, "star")
      .build();
    await game.p2.cast("star", { targets: ["pp", "pp"] });
    await game.settle();
    expect(game.zoneOf("pp")).toBe("trash");
  });
});
