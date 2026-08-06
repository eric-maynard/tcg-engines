/**
 * Guerilla Warfare — ogn-264-298 · Spell · Mind/Chaos · 2 energy + 1 power
 *
 *   Return up to two cards with [Hidden] from your trash to your hand.
 *   You can hide cards ignoring costs this turn.
 *
 * Rules: 811 (Hidden: hide = pay [rainbow] to put the card facedown at a battlefield
 * you control; 811.5 having Hidden is a characteristic checkable in any zone),
 * 355.6 ("up to two" → 0, 1 or 2 choices).
 * Engine note: the [rainbow] pip is paid from `power.rainbow`.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, scenario } from "../../harness";

const CARD = "ogn-264-298";
const HIDDEN_BLADE = "ogn-213-298"; // spell with [Hidden]
const BLASTCONE_FAE = "ogn-097-298"; // unit with [Hidden]
const FILLER = "ogn-175-298"; // no Hidden

function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .trash(P1, HIDDEN_BLADE, "blade")
    .trash(P1, BLASTCONE_FAE, "fae")
    .trash(P1, FILLER, "junk")
    .hand(P1, CARD, "gw");
}

/** Cast Guerilla Warfare choosing `wanted` from the trash, whichever way the engine asks (at cast or on resolution). */
async function castReturning(game: Game, wanted: string[]) {
  const offered = game.p1.option("cast", "gw")?.fields.find((f) => f.arg === "targets")?.options ?? [];
  const atCast = offered.some((o) => Array.isArray(o) && o.length > 0);
  await game.p1.cast("gw", atCast ? { targets: wanted } : {});
  await game.settle();
  if (!atCast && game.decision()?.kind === "pick") {
    await game.p1.pick(...wanted);
    await game.settle();
  }
}

describe("Guerilla Warfare (ogn-264-298)", () => {
  test("costs 2 energy + 1 power; goes to trash after resolving; unaffordable short of either", async () => {
    const game = await board().build();
    await game.p1.cast("gw", { targets: [] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await game.settle();
    expect(game.zoneOf("gw")).toBe("trash");
    const noPower = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "gw").build();
    expect(noPower.p1.can("cast", "gw")).toBe(false);
    const lowEnergy = await scenario().resources(P1, { energy: 1, power: { rainbow: 1 } }).hand(P1, CARD, "gw").build();
    expect(lowEnergy.p1.can("cast", "gw")).toBe(false);
  });

  test("returns two chosen [Hidden] cards from your trash to your hand; the non-Hidden card stays", async () => {
    // Expected: blade + fae → hand, junk stays in trash. Actual: the spell offers no trash choices at all
    // (only an empty target set) and resolves doing nothing.
    const game = await board().build();
    await castReturning(game, ["blade", "fae"]);
    expect(game.zoneOf("blade")).toBe("hand");
    expect(game.zoneOf("fae")).toBe("hand");
    expect(game.zoneOf("junk")).toBe("trash");
    expect(game.zoneOf("gw")).toBe("trash");
  });

  test("'up to two' — you may take just one", async () => {
    // Expected: only blade returns; fae stays. Actual: nothing can be chosen (see above).
    const game = await board().build();
    await castReturning(game, ["blade"]);
    expect(game.zoneOf("blade")).toBe("hand");
    expect(game.zoneOf("fae")).toBe("trash");
  });

  test("only cards WITH [Hidden] are eligible: a vanilla unit in the trash is never offered", async () => {
    const game = await board().build();
    const atCast = game.p1.option("cast", "gw")?.fields.find((f) => f.arg === "targets")?.options ?? [];
    expect(atCast.flat()).not.toContain("junk");
    await game.p1.cast("gw", { targets: [] });
    await game.settle();
    const d = game.decision();
    const onResolve = d?.kind === "pick" ? d.options.map((o) => o.card) : [];
    expect(onResolve).not.toContain("junk");
    if (d?.kind === "pick") {
      await game.p1.decline();
      await game.settle();
    }
    expect(game.zoneOf("junk")).toBe("trash");
  });

  test.failing("BUG: this turn you can hide [Hidden] cards ignoring the [rainbow] cost; the licence ends with the turn", async () => {
    // Expected: after resolving (0 power left) P1 can still hide the Fae at bf1 for free; next turn, with no
    // power, hiding is illegal again. Actual: no free-hide effect is created — hide is illegal at 0 power.
    const game = await scenario()
      .resources(P1, { energy: 2, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .hand(P1, BLASTCONE_FAE, "fae")
      .hand(P1, HIDDEN_BLADE, "blade")
      .hand(P1, CARD, "gw")
      .build();
    await game.p1.cast("gw", { targets: [] });
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.p1.can("hide", "fae")).toBe(true);
    await game.p1.hide("fae", "bf1");
    expect(game.zoneOf("fae")).toBe("facedown-bf1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await game.advanceTurn();
    await game.advanceTurn(); // back to P1, pools emptied at end of turn
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.power()).toBe(0);
    expect(game.p1.can("hide", "blade")).toBe(false);
  });
});
