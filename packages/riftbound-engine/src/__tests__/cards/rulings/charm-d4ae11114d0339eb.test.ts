/**
 * Ruling d4ae11114d0339eb — Charm (OGN-043 → ogn-043-298) · Spell · Calm · 1 + [calm] · "Move an enemy unit."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · Spell · [Action] · Chaos · 2 + [chaos] · "Move a friendly unit and ready it."
 *
 * Q: Does moving a READY unit with an effect like Charm or Ride the Wind exhaust it?
 * A: No. Only the Standard Move (every unit's implicit "exhaust: move me to or from your base") has the exhaust cost.
 *    Effect moves just do what they say — Charm leaves the unit's ready/exhausted state alone; Ride the Wind additionally
 *    readies it (so an exhausted unit ends ready). They work regardless of the unit's exhaust state.
 * Rules: 144 / 144.2 (Standard Move is an inherent ability whose cost is exhausting the unit), 447 (moves by effects),
 *        426 (Ready).
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";
const RIDE_THE_WIND = "ogn-173-298";

/**
 * P1's turn. Open bf1 and bf2 (uncontrolled, empty). P1: Walker (2, ready) and Napper (2, EXHAUSTED) in base; Charm + Ride the
 * Wind and exactly 1+[calm] + 2+[chaos]. P2: Target (2, ready) and Dozer (2, exhausted) in base.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { calm: 1, chaos: 1 } })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: null })
    .unit(P1, "base", { might: 2, name: "Walker" }, "walker")
    .unit(P1, "base", { might: 2, name: "Napper" }, "napper", { exhausted: true })
    .unit(P2, "base", { might: 2, name: "Target" }, "target")
    .unit(P2, "base", { might: 2, name: "Dozer" }, "dozer", { exhausted: true })
    .hand(P1, CHARM, "charm")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

/** Cast `spell` on `unit`, send it to bf1, resolve the chain (and pass through the non-combat showdown at empty bf1). */
async function moveByEffect(game: Game, spell: string, unit: string): Promise<void> {
  await game.p1.cast(spell, { targets: unit });
  const d = game.decision() as PickDecision;
  expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
  await game.p1.pick("battlefield-bf1");
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf(spell)).toBe("trash");
  expect(game.locationOf(unit)).toBe("bf1");
}

describe("Ruling d4ae11114d0339eb — only the Standard Move exhausts; Charm / Ride the Wind do exactly what they say", () => {
  test("control — the Standard Move DOES exhaust: Walker walks to bf1 and is exhausted", async () => {
    const game = await board().build();
    expect(game.state("walker").isReady).toBe(true);
    await game.p1.move("walker", "bf1");
    expect(game.locationOf("walker")).toBe("bf1");
    expect(game.state("walker").isExhausted).toBe(true);
    // and an exhausted unit has no Standard Move at all
    expect(game.p1.can("move")).toBe(false); // only Napper (exhausted) is left in base
  });

  test("Charm on a READY enemy unit moves it and it stays READY — no implicit exhaust", async () => {
    const game = await board().build();
    expect(game.state("target").isReady).toBe(true);
    await moveByEffect(game, "charm", "target");
    expect(game.state("target").isReady).toBe(true);
    expect(game.state("target").isExhausted).toBe(false);
    await game.settle();
    expect(game.state("target").isReady).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("Charm on an EXHAUSTED enemy unit works just the same and leaves it exhausted (Charm says nothing about readying)", async () => {
    const game = await board().build();
    await moveByEffect(game, "charm", "dozer");
    expect(game.state("dozer").isExhausted).toBe(true);
  });

  test("Ride the Wind on a READY friendly unit: moved and (still) ready — it can even Standard-Move again afterwards", async () => {
    const game = await board().build();
    await moveByEffect(game, "rtw", "walker");
    expect(game.state("walker").isReady).toBe(true);
    await game.settle(); // empty bf1: the non-combat showdown is handed back once …
    await game.settle(); // … then both pass → P1 conquers
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("walker").isReady).toBe(true);
    expect(game.p1.can("move")).toBe(true); // Walker may still use its Standard Move (back to base)
    await game.p1.move("walker", "base");
    expect(game.locationOf("walker")).toBe("base");
    expect(game.state("walker").isExhausted).toBe(true); // THAT move exhausts
  });

  test("Ride the Wind on an EXHAUSTED friendly unit: moved regardless of being exhausted, 'and ready it' → it ends READY", async () => {
    const game = await board().build();
    expect(game.state("napper").isExhausted).toBe(true);
    await moveByEffect(game, "rtw", "napper");
    expect(game.state("napper").isReady).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
