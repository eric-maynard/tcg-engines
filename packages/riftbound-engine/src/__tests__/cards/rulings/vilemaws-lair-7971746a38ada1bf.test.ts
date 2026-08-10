/**
 * Ruling 7971746a38ada1bf — Vilemaw's Lair (OGN-295 → ogn-295-298, Battlefield) "Units can't move from here to base."
 *   (the ruling is filed under Vilemaw unl-060-219, but the question is about the LAIR)
 *   × Flash (OGS-011 → ogs-011-024, Reaction [2]) "Move up to 2 friendly units to base."
 *   × Ride the Wind (OGN-173 → ogn-173-298, Action [2]) "Move a friendly unit and ready it."
 *   × Zenith Blade (OGN-262 → ogn-262-298, Action [3]+[calm][order]) "Stun an enemy unit at a battlefield. You may move a friendly unit
 *     to that enemy unit's battlefield."
 *   × The Syren (OGN-184 → ogn-184-298, Gear) "[1], [Exhaust]: Move a friendly unit at a battlefield to its base."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) / The Boss (ogn-269-298, Sett) — recall savers.
 *
 * Q: Does Vilemaw's Lair stop ALL forms of movement (Zenith Blade, Flash, Ride the Wind…), not just the standard move?
 * A: Yes — its "can't" beats any effect that would move a unit from there to base (spells and abilities alike; The Syren fails
 *    too). Recalls (Zhonya's, Sett) are not moves and still take the unit to base.
 *    [Zenith Blade never moves anything TO BASE, so the Lair's printed text cannot interact with it — the literal "prevents Zenith
 *    Blade" claim is recorded below as a disagreement with the engine (and with the card text / ruling d06969c7bc59f38c).]
 * Rules: 105 (can't beats can), 359.3.e.6 (impossible instruction ignored; the rest still resolves), 446 (move) vs 456 (recall).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VILEMAWS_LAIR = "ogn-295-298";
const FLASH = "ogs-011-024";
const RIDE_THE_WIND = "ogn-173-298";
const ZENITH_BLADE = "ogn-262-298";
const THE_SYREN = "ogn-184-298";
const ZHONYAS = "ogn-077-298";
const THE_BOSS = "ogn-269-298";
/** Inline enemy Reaction: deal 3 to a unit (the "would die" event for the recall savers). */
const BOLT = { abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }], cardType: "spell", domain: "fury", energyCost: 1, name: "Test Bolt", timing: "reaction" };

/** P1's turn. P1 holds Vilemaw's Lair (live text) with an exhausted 3-Might Spider on it; P2 holds bf2 with a 4-Might Foe. */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { calm: 1, chaos: 1, order: 1 } })
    .battlefield("lair", { controller: P1, def: VILEMAWS_LAIR, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "lair", { might: 3, name: "Spider" }, "spider", { exhausted: true })
    .unit(P2, "bf2", { might: 4, name: "Foe" }, "foe")
    .hand(P1, FLASH, "flash")
    .hand(P1, RIDE_THE_WIND, "ride")
    .hand(P1, ZENITH_BLADE, "zenith")
    .gear(P1, THE_SYREN, "syren");
}

describe("Ruling 7971746a38ada1bf — Vilemaw's Lair blocks every move-to-base EFFECT; recalls are not moves", () => {
  test("premise: the Spider at the Lair carries the restriction and has no standard move to base", async () => {
    const game = await board().build();
    expect(game.state("spider").keywords).toContain("NoMoveToBase");
    expect((await game.p1.try((p) => p.move("spider", "base"))).ok).toBe(false);
    expect(game.locationOf("spider")).toBe("lair");
  });

  test("Flash (spell: move up to 2 friendly units to base) resolves but the Spider stays at the Lair", async () => {
    const game = await board().build();
    await game.p1.cast("flash", { targets: ["spider"] });
    await game.settle();
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.locationOf("spider")).toBe("lair");
    expect(game.gameState.unitsMovedThisTurn?.[P1] ?? 0).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("Ride the Wind choosing base: the move is ignored (Spider stays) — the independent 'ready it' still happens", async () => {
    const game = await board().build();
    await game.p1.cast("ride", { answers: ["base"], targets: "spider" });
    await game.settle();
    expect(game.zoneOf("ride")).toBe("trash");
    expect(game.locationOf("spider")).toBe("lair");
    expect(game.state("spider").isReady).toBe(true);
  });

  test("The Syren (gear ability: move a friendly unit at a battlefield to its base): cost paid, ability resolves, Spider stays at the Lair", async () => {
    const game = await board().build();
    expect(game.p1.can("activate", "syren")).toBe(true);
    await game.p1.activate("syren", 0, { targets: "spider" });
    await game.settle();
    expect(game.state("syren").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(7);
    expect(game.locationOf("spider")).toBe("lair");
    expect(game.gameState.unitsMovedThisTurn?.[P1] ?? 0).toBe(0);
  });

  // RULING-CONFLICT (ruling 7971746a38ada1bf, read literally): the ruling's blanket "prevents all forms of movement,
  // including Zenith Blade" does not survive the printed text. Vilemaw's Lair restricts movement "from here to base" only
  // (keyword NoMoveToBase); rule 105 makes that "can't" absolute, but only over the restriction it states. Zenith Blade moves
  // a friendly unit to the STUNNED ENEMY's battlefield and never to base, so no part of its instruction is impossible and
  // 359.3.e.6 never fires — rule 446 movement to bf2 resolves normally. This matches ruling d06969c7bc59f38c. Engine
  // behaviour recorded here deliberately; the earlier "BUG" framing was wrong.
  test("RULING-CONFLICT: Zenith Blade moves the Spider Lair → the stunned enemy's battlefield — the Lair only forbids moves TO BASE (105, 446)", async () => {
    const game = await board().build();
    await game.p1.cast("zenith", { targets: ["foe", "spider"] });
    const stop = await game.settle();
    if (stop.reason === "unanswered" && game.decision()?.kind === "pick") {
      await game.p1.pick("battlefield-bf2");
    }
    expect(game.state("foe").isStunned).toBe(true);
    expect(game.locationOf("spider")).toBe("bf2");
  });

  test("Zhonya's Hourglass: a Spider that would die at the Lair is RECALLED to base — not a move, so the Lair does not stop it", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .battlefield("lair", { controller: P1, def: VILEMAWS_LAIR, inert: false })
      .unit(P1, "lair", { might: 3, name: "Spider" }, "spider")
      .gear(P1, ZHONYAS, "zhonyas")
      .hand(P2, BOLT, "bolt")
      .build();
    await game.p2.cast("bolt", { targets: "spider" });
    await game.settle();
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.zoneOf("spider")).toBe("base");
    expect(game.state("spider")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.gameState.unitsMovedThisTurn?.[P1] ?? 0).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("The Boss (Sett): a buffed Spider that would die at the Lair is healed, exhausted and RECALLED to base once P1 pays — the Lair does not stop it", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { power: { body: 1 } })
      .resources(P2, { energy: 1 })
      .legend(P1, THE_BOSS, "boss")
      .battlefield("lair", { controller: P1, def: VILEMAWS_LAIR, inert: false })
      .unit(P1, "lair", { might: 2, name: "Spider" }, "spider", { buffed: true }) // 2+1 = 3 → Bolt's 3 is lethal
      .hand(P2, BOLT, "bolt")
      .build();
    await game.p2.cast("bolt", { targets: "spider" });
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "boss" } });
    await game.p1.yes();
    await game.settle();
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.p1.power("body")).toBe(0);
    expect(game.zoneOf("spider")).toBe("base");
    expect(game.state("spider")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true });
    expect(game.gameState.unitsMovedThisTurn?.[P1] ?? 0).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
