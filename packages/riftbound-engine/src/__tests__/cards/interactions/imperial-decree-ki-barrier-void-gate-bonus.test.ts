/**
 * Interaction: Imperial Decree (ogn-221-298) · Spell · Order · 5+[order][order] · Action
 *     "When any unit takes damage this turn, kill it."
 *   × Ki Barrier (ven-126-166) · Spell · Order · 2+[order] · Reaction
 *     "Choose a unit. Prevent the next 7 damage that would be dealt to it this turn."
 *   × Hextech Ray (ogn-009-298) · Spell · Fury · 1+[fury] · Action — "Deal 3 to a unit at a battlefield."
 *   @ Void Gate (ogn-296-298, battlefield) — "Spells and abilities deal 1 Bonus Damage to units here."
 *   on P2's Playful Phantom (ogn-049-298) · 5 Might vanilla.
 *
 * Rules: 715.1/715.4.a + 437.1.a.1 (Bonus Damage is added BEFORE prevention counts it — the CR's own
 * example is Hextech Ray at Void Gate into prevent 3), 437.2/437.3/437.3.a/437.3.b (Prevent Value is
 * tracked down by the prevented amount and expires at 0), 437.4 + 417.1.e/417.1.e.1 (fully prevented
 * damage = 0 = not Valid Damage = "not dealt at all", so "takes damage" triggers do not fire).
 *
 * Question: P1's turn. Decree resolved; P2's Phantom at Void Gate carries Ki Barrier (prevent next 7).
 * P1 Rays it twice. Does the bonus count toward what the Barrier absorbs, does a fully-prevented hit
 * count as "takes damage" for Decree, and on which Ray does Phantom die? Contrast: same line at a plain
 * battlefield — Phantom survives both Rays undamaged (PV 1 left); a third Ray deals 2 and Decree kills it.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const IMPERIAL_DECREE = "ogn-221-298";
const KI_BARRIER = "ven-126-166";
const HEXTECH_RAY = "ogn-009-298";
const PLAYFUL_PHANTOM = "ogn-049-298";
const VOID_GATE = "ogn-296-298";

/**
 * P1 to act with Decree (5+OO) and three Rays (1+F each): exactly 8 energy, order 2, fury 3.
 * P2's Phantom holds bf1 — a LIVE Void Gate or an inert plain battlefield — and P2 has Ki Barrier
 * plus exactly 2 energy + 1 order for it.
 */
function board(opts: { atGate: boolean }) {
  return scenario()
    .resources(P1, { energy: 8, power: { fury: 3, order: 2 } })
    .resources(P2, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", opts.atGate ? { controller: P2, def: VOID_GATE, inert: false, owner: P2 } : { controller: P2 })
    .unit(P2, "bf1", PLAYFUL_PHANTOM, "phantom")
    .unit(P1, "base", { might: 2, name: "Bystander" }, "bystander")
    .hand(P1, IMPERIAL_DECREE, "decree")
    .hand(P1, HEXTECH_RAY, "ray1")
    .hand(P1, HEXTECH_RAY, "ray2")
    .hand(P1, HEXTECH_RAY, "ray3")
    .hand(P2, KI_BARRIER, "kb");
}

const pv = (game: Game) => game.state("phantom").meta.damagePreventionShield;

/** P1 casts Decree; P2 answers with Ki Barrier on the Phantom (its only Reaction window); both resolve. */
async function decreeAndBarrierUp(atGate: boolean): Promise<Game> {
  const game = await board({ atGate }).build();
  await game.p1.cast("decree");
  await game.p1.passPriority();
  await game.p2.cast("kb", { targets: "phantom" });
  await game.settle();
  return game;
}

async function ray(game: Game, alias: "ray1" | "ray2" | "ray3"): Promise<void> {
  await game.p1.cast(alias, { targets: "phantom" });
  await game.settle();
}

describe("Imperial Decree × Ki Barrier × Void Gate bonus (Hextech Ray ×2)", () => {
  test("setup: Decree (5+[order][order]) resolves, Ki Barrier (2+[order]) resolves first by LIFO — Phantom tracks Prevent Value 7, nobody hurt, both spells in trash", async () => {
    const game = await board({ atGate: true }).build();
    await game.p1.cast("decree");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 3, order: 0 } });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "kb")).toBe(true);
    await game.p2.cast("kb", { targets: "phantom" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["decree", "kb"]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("decree")).toBe("trash");
    expect(game.zoneOf("kb")).toBe("trash");
    expect(game.zoneOf("phantom")).toBe("battlefield-bf1");
    expect(game.state("phantom")).toMatchObject({ damage: 0, might: 5 });
    expect(pv(game)).toBe(7);
    expect(game.zoneOf("bystander")).toBe("base"); // Decree alone kills nothing
  });

  test("at Void Gate, Ray #1 is 3+1 = 4 BEFORE prevention (715.4.a, 437.1.a.1): all 4 prevented, PV 7→3, 0 dealt — Decree does NOT trigger, Phantom alive and undamaged (437.4, 417.1.e.1)", async () => {
    const game = await decreeAndBarrierUp(true);
    await ray(game, "ray1");
    expect(game.zoneOf("ray1")).toBe("trash");
    expect(game.zoneOf("phantom")).toBe("battlefield-bf1");
    expect(game.state("phantom").damage).toBe(0);
    expect(pv(game)).toBe(3); // 4 came in, not 3
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("at Void Gate, Ray #2 = 4 → 3 prevented, 1 dealt: Ki Barrier is spent (437.3.a) and Decree kills the 5-Might Phantom off a single point of damage", async () => {
    const game = await decreeAndBarrierUp(true);
    await ray(game, "ray1");
    await ray(game, "ray2");
    expect(game.zoneOf("ray2")).toBe("trash");
    expect(game.zoneOf("phantom")).toBe("trash");
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.zoneOf("ray3")).toBe("hand"); // never needed a third
    expect(game.violations()).toEqual([]);
  });

  test("at Void Gate the kill is Decree's doing, not lethal damage: WITHOUT Decree the same two Rays leave Phantom alive on 1 damage with the Barrier gone", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 2 } })
      .resources(P2, { energy: 2, power: { order: 1 } })
      .battlefield("bf1", { controller: P2, def: VOID_GATE, inert: false, owner: P2 })
      .unit(P2, "bf1", PLAYFUL_PHANTOM, "phantom")
      .hand(P1, HEXTECH_RAY, "ray1")
      .hand(P1, HEXTECH_RAY, "ray2")
      .hand(P2, KI_BARRIER, "kb")
      .build();
    await game.p1.cast("ray1", { targets: "phantom" });
    await game.p1.passPriority();
    await game.p2.cast("kb", { targets: "phantom" }); // shield up in response to Ray #1
    await game.settle();
    expect(game.state("phantom").damage).toBe(0);
    expect(pv(game)).toBe(3);
    await ray(game, "ray2");
    expect(game.zoneOf("phantom")).toBe("battlefield-bf1");
    expect(game.state("phantom").damage).toBe(1);
    expect(pv(game) ?? 0).toBe(0);
  });

  test("contrast — plain battlefield: Ray #1 = 3 → PV 7→4, 0 dealt; Ray #2 = 3 → PV 4→1, 0 dealt; Decree never triggers, Phantom alive, undamaged, PV 1 left", async () => {
    const game = await decreeAndBarrierUp(false);
    await ray(game, "ray1");
    expect(game.zoneOf("phantom")).toBe("battlefield-bf1");
    expect(game.state("phantom").damage).toBe(0);
    expect(pv(game)).toBe(4);
    await ray(game, "ray2");
    expect(game.zoneOf("phantom")).toBe("battlefield-bf1");
    expect(game.state("phantom")).toMatchObject({ damage: 0, might: 5 });
    expect(pv(game)).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("contrast — plain battlefield: a THIRD Ray = 3 → 1 prevented, 2 dealt → now Phantom 'takes damage' and Decree kills it (2 < 5 Might is irrelevant)", async () => {
    const game = await decreeAndBarrierUp(false);
    await ray(game, "ray1");
    await ray(game, "ray2");
    await ray(game, "ray3");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, order: 0 } });
    expect(game.zoneOf("phantom")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("Decree is symmetric ('any unit') and lasts only this turn: next turn a Ray that gets through no longer kills a surviving 5-Might Phantom", async () => {
    const game = await decreeAndBarrierUp(false);
    await ray(game, "ray1");
    await ray(game, "ray2"); // PV 1 left, Phantom untouched
    await game.advanceTurn(); // → P2's turn: Decree and the Barrier both expire
    expect(game.turnPlayer()).toBe(P2);
    await game.advanceTurn(); // → back to P1
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.do("addResources", { energy: 1, power: { fury: 1 } });
    await ray(game, "ray3");
    expect(game.zoneOf("phantom")).toBe("battlefield-bf1");
    expect(game.state("phantom").damage).toBe(3); // full 3: no shield, and no Decree to finish it
  });
});
