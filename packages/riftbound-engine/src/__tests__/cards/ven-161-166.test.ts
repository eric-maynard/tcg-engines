/**
 * Piltovan Forge — ven-161-166 · Battlefield · no domain · no cost
 *
 *   While you control this battlefield, the first friendly gear activated ability played each turn
 *   costs [1] less.
 *
 * Rules: 190.6.d ("you" = the battlefield's controller), 204/356 (costs of activated abilities are
 * paid like card costs; [1] is one ENERGY — power pips are untouched), 356.6 (a cost can't be
 * reduced below 0), 383/402 (an ability is "played" when it is activated and finalized — a free
 * [Exhaust] ability is still "the first gear activated ability played" and eats the discount),
 * "each turn" (resets every turn, yours and the opponent's alike).
 *
 * Head-judge notes — the tricky situations for THIS card:
 *  1. Affordability is checked at the DISCOUNTED price: [2] Empower with exactly 1 energy is legal;
 *     The Syren's [1] becomes free and is legal at 0 energy.
 *  2. Only the FIRST: Empower (2→1) then The Syren pays its full 1.
 *  3. The wasted discount: opening the turn with a costless [Exhaust] gear ability consumes "first",
 *     so a later [2] Empower pays 2.
 *  4. Reset: next turn the first gear ability is cheap again.
 *  5. Negative space: not while the OPPONENT (or nobody) controls the Forge; not for UNIT/legend
 *     activated abilities (Renekton's [1]); not for the opponent's gear; not for PLAYING a gear.
 *
 * Engine status: the card has no parsed abilities at all, so every positive clause is a BUG test.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-161-166";
const TOOLS_OF_EMPIRE = "ven-077-166"; // Gear · Body · 4 · #0 "[2]: Empower this" · #1 "[Exhaust]: Give a unit +2 Might this turn"
const THE_SYREN = "ogn-184-298"; // Gear · Chaos · 2 · "[1], [Exhaust]: Move a friendly unit at a battlefield to its base."
const RENEKTON = "ven-177-166"; // Unit · Body · #0 "[1]: Give me +1 Might this turn."

type Built = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;
const canActivate = (game: Built, seat: "p1" | "p2", card: string, index: number) => game[seat].legal().some((o) => o.key === `activateAbility:${card}#${index}`);

/** P1 controls the Forge (a keeper stands on it) with Tools of Empire in base and `energy` floating. */
function forge(energy: number) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("forge", { controller: P1, def: CARD, inert: false, owner: P1 })
    .unit(P1, "forge", { might: 2, name: "Keeper" }, "keeper")
    .gear(P1, TOOLS_OF_EMPIRE, "tools");
}

describe("Piltovan Forge (ven-161-166)", () => {
  test("registry payload — the printed static ('first friendly gear activated ability each turn costs [1] less while you control this') is not parsed at all", async () => {
    // Expected: exactly one static ability carrying a 1-energy cost reduction scoped to friendly gear activated abilities, first per turn.
    // Actual: the pool entry has no `abilities`.
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Piltovan Forge" });
    const abilities = (def?.abilities ?? []) as { type?: string }[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]?.type).toBe("static");
    const json = JSON.stringify(abilities[0]);
    expect(json).toContain("gear");
    expect(json).toMatch(/"amount":1|"energy":1/);
  });

  test("Tools of Empire's [2] Empower costs 1 while you control the Forge (2 energy → 1 left, gear Empowered)", async () => {
    // Expected: energy 1 after the activation resolves. Actual: full 2 is charged → 0.
    const game = await forge(2).build();
    await game.p1.activate("tools", 0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "tools", triggered: false })]);
    await game.settle();
    expect(game.state("tools").isEmpowered).toBe(true);
    expect(game.p1.energy()).toBe(1);
  });

  test("affordability at the discounted price — with exactly 1 energy the [2] Empower is legal and leaves 0", async () => {
    // Expected: activateAbility:tools#0 offered at 1 energy. Actual: not offered (needs the printed 2).
    const game = await forge(1).build();
    expect(canActivate(game, "p1", "tools", 0)).toBe(true);
    await game.p1.activate("tools", 0);
    await game.settle();
    expect(game.state("tools").isEmpowered).toBe(true);
    expect(game.p1.energy()).toBe(0);
  });

  test("reduced to zero (356.6) — The Syren's '[1], [Exhaust]' is free as the first gear ability: legal at 0 energy, the unit goes home, the Syren exhausts", async () => {
    // Expected: legal with an empty pool; keeper moved to base; energy stays 0. Actual: not legal at 0 energy.
    const game = await scenario()
      .resources(P1, { energy: 0 })
      .battlefield("forge", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "forge", { might: 2, name: "Keeper" }, "keeper")
      .unit(P1, "forge", { might: 2, name: "Buddy" }, "buddy") // keeps control of the Forge after the keeper leaves
      .gear(P1, THE_SYREN, "syren")
      .build();
    expect(canActivate(game, "p1", "syren", 0)).toBe(true);
    await game.p1.activate("syren", 0, { targets: "keeper" });
    game.script(P1, [(d) => (d.kind === "pick" ? "keeper" : undefined)]);
    await game.settle();
    expect(game.locationOf("keeper")).toBe("base");
    expect(game.state("syren").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(0);
  });

  test("only the FIRST each turn — Empower pays 1, then The Syren pays its full [1]: 3 energy → 1", async () => {
    // Expected: 3 − 1 (discounted Empower) − 1 (full Syren) = 1. Actual: 3 − 2 − 1 = 0.
    const game = await forge(3).unit(P1, "forge", { might: 2, name: "Buddy" }, "buddy").gear(P1, THE_SYREN, "syren").build();
    await game.p1.activate("tools", 0);
    await game.settle();
    expect(game.p1.energy()).toBe(2);
    await game.p1.activate("syren", 0, { targets: "buddy" });
    game.script(P1, [(d) => (d.kind === "pick" ? "buddy" : undefined)]);
    await game.settle();
    expect(game.locationOf("buddy")).toBe("base");
    expect(game.p1.energy()).toBe(1);
  });

  test("the wasted discount: opening with the costless [Exhaust] ability makes IT the first gear ability played, so the later [2] Empower pays full price (2 → 0)", async () => {
    const game = await forge(2).build();
    await game.p1.activate("tools", 1, { targets: "keeper" });
    game.script(P1, [(d) => (d.kind === "pick" ? "keeper" : undefined)]);
    await game.settle();
    expect(game.state("keeper").might).toBe(4);
    expect(game.state("tools").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(2); // nothing to discount below 0, nothing charged
    expect(canActivate(game, "p1", "tools", 0)).toBe(true); // Empower needs no exhaust
    await game.p1.activate("tools", 0);
    await game.settle();
    expect(game.state("tools").isEmpowered).toBe(true);
    expect(game.p1.energy()).toBe(0);
  });

  test("'each turn' resets — after using the discount, on P1's NEXT turn the first gear ability is discounted again (Syren free at 0 energy)", async () => {
    // Expected: turn N Empower for 1 (1 → 0); two turns later, with an empty pool, the Syren is legal and free. Actual: neither discount exists.
    const game = await forge(1).unit(P1, "forge", { might: 2, name: "Buddy" }, "buddy").gear(P1, THE_SYREN, "syren").build();
    await game.p1.activate("tools", 0);
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    await game.advanceTurn(); // P2
    await game.advanceTurn(); // P1 again — pool emptied at the start of the Main Phase; runes untapped
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.energy()).toBe(0);
    expect(game.gameState.battlefields.forge?.controller).toBe(P1);
    expect(canActivate(game, "p1", "syren", 0)).toBe(true);
    await game.p1.activate("syren", 0, { targets: "buddy" });
    game.script(P1, [(d) => (d.kind === "pick" ? "buddy" : undefined)]);
    await game.settle();
    expect(game.locationOf("buddy")).toBe("base");
    expect(game.p1.energy()).toBe(0);
  });

  test("negative space — 'while YOU control this battlefield': with P2 holding the Forge, P1's Empower costs the printed 2 and is illegal at 1 energy", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("forge", { controller: P2, def: CARD, inert: false, owner: P1 })
      .unit(P2, "forge", { might: 2 }, "squatter")
      .gear(P1, TOOLS_OF_EMPIRE, "tools")
      .build();
    await game.p1.activate("tools", 0);
    await game.settle();
    expect(game.state("tools").isEmpowered).toBe(true);
    expect(game.p1.energy()).toBe(0);
    const poor = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("forge", { controller: P2, def: CARD, inert: false, owner: P1 })
      .unit(P2, "forge", { might: 2 }, "squatter")
      .gear(P1, TOOLS_OF_EMPIRE, "tools")
      .build();
    expect(canActivate(poor, "p1", "tools", 0)).toBe(false);
  });

  test("negative space — an UNCONTROLLED Forge helps nobody: Empower is illegal at 1 energy", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("forge", { controller: null, def: CARD, inert: false, owner: P1 })
      .gear(P1, TOOLS_OF_EMPIRE, "tools")
      .build();
    expect(canActivate(game, "p1", "tools", 0)).toBe(false);
  });

  test("negative space — GEAR abilities only: Renekton's unit ability '[1]: +1 Might' still costs 1 with the Forge controlled (1 → 0), and is illegal with an empty pool", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("forge", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "forge", RENEKTON, "renekton")
      .build();
    const before = game.state("renekton").might;
    await game.p1.activate("renekton", 0);
    await game.settle();
    expect(game.state("renekton").might).toBe(before + 1);
    expect(game.p1.energy()).toBe(0);
    expect(canActivate(game, "p1", "renekton", 0)).toBe(false);
  });

  test("negative space — FRIENDLY gear only: P2's Tools of Empire on P2's turn pays the printed 2 while P1 controls the Forge", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2 })
      .battlefield("forge", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "forge", { might: 2 }, "keeper")
      .gear(P2, TOOLS_OF_EMPIRE, "theirs")
      .build();
    await game.p2.activate("theirs", 0);
    await game.settle();
    expect(game.state("theirs").isEmpowered).toBe(true);
    expect(game.p2.energy()).toBe(0);
  });

  test("negative space — activated abilities, not plays: PLAYING Tools of Empire from hand costs its full 4 with the Forge controlled", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .battlefield("forge", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "forge", { might: 2 }, "keeper")
      .hand(P1, TOOLS_OF_EMPIRE, "tools")
      .build();
    await game.p1.play("tools");
    await game.settle();
    expect(game.zoneOf("tools")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    const short = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("forge", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "forge", { might: 2 }, "keeper")
      .hand(P1, TOOLS_OF_EMPIRE, "tools")
      .build();
    expect(short.p1.can("play", "tools")).toBe(false);
  });
});
