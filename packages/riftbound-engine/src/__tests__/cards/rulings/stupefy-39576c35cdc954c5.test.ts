/**
 * Ruling 39576c35cdc954c5 — Stupefy (OGN-095 → ogn-095-298) · Spell · Mind · 1 · [Reaction]
 *   "Give a unit -1 [Might] this turn, to a minimum of 1 [Might]. Draw 1."
 *   × Gangplank, Naval (VEN-181 → ven-181-166) · Unit · 6 Might · "[Empowered] If a spell or ability that chooses me would
 *     stun me, give me -[Might], or return me to hand, give me +3 [Might] instead."
 *   × Mel, Newly Awakened (ven-069-166) · "[Empowered] … If a spell or ability you control would give -[Might] to a unit it
 *     chooses, it gives an additional -1 [Might]."
 *
 * Q: With my Mel empowered, I Stupefy my own empowered Gangplank — does he get −1, −2, or what?
 * A: +3: he ends the turn at 9 (6 + 3). Gangplank's replacement swaps the ENTIRE reduction for +3; Mel's extra −1 is never
 *    applied on top and the "minimum 1" floor never matters — whichever order the two effects are applied in. Stupefy still
 *    draws 1, and the +3 wears off at end of turn.
 * Rules: 372 (replacement effects; ordering), 371 (modification of an effect), FAQ #11914.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STUPEFY = "ogn-095-298";
const GANGPLANK = "ven-181-166";
const MEL = "ven-069-166";

/** P1's turn, 1 energy. P1 controls Mel and Gangplank in base (empowered per flags) and holds Stupefy; known top card. */
function board(melEmpowered: boolean, gpEmpowered: boolean) {
  return scenario()
    .resources(P1, { energy: 1 })
    .unit(P1, "base", MEL, "mel", { empowered: melEmpowered })
    .unit(P1, "base", GANGPLANK, "gp", { empowered: gpEmpowered })
    .hand(P1, STUPEFY, "stupefy")
    .deck(P1, ["ogn-175-298"], ["topcard"]);
}

/** Cast Stupefy on Gangplank and resolve it; if the engine asks P1 to order replacement effects (372), take `orderIdx`. */
async function stupefyGangplank(game: Game, orderIdx = 0): Promise<void> {
  await game.p1.cast("stupefy", { targets: "gp" });
  expect(game.p1.energy()).toBe(0);
  expect(game.chain().map((c) => c.cardId)).toEqual(["stupefy"]);
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "action") {
      await game.seat(d.seat).passPriority();
    } else if (d.kind === "pick" && d.seat === P1) {
      // Only a rule-372 ordering choice would be acceptable here.
      expect(d.semantics).toBe("replacement-order");
      await game.p1.pick(d.options[Math.min(orderIdx, d.options.length - 1)]?.key as string);
    } else {
      break;
    }
  }
  expect(game.zoneOf("stupefy")).toBe("trash");
}

describe("Ruling 39576c35cdc954c5 — Stupefy on your own empowered Gangplank with empowered Mel: +3, not −1/−2", () => {
  test("premise: both are Empowered and Gangplank starts at 6 Might", async () => {
    const game = await board(true, true).build();
    expect(game.state("mel").isEmpowered).toBe(true);
    expect(game.state("gp").isEmpowered).toBe(true);
    expect(game.state("gp").might).toBe(6);
    expect(game.p1.can("cast", "stupefy")).toBe(true); // own unit is a legal "a unit"
  });

  test("Stupefy resolves: the whole reduction is REPLACED by +3 → Gangplank is 9 (Mel's extra −1 never lands, no floor involved); Stupefy still draws 1", async () => {
    const game = await board(true, true).build();
    await stupefyGangplank(game, 0);
    expect(game.state("gp").might).toBe(9);
    expect(game.state("gp").mightModifier).toBe(3);
    expect(game.state("gp").isEmpowered).toBe(true);
    expect(game.p1.hand()).toEqual(["topcard"]); // "Draw 1" still happens
    expect(game.state("mel").might).toBe(4); // Mel untouched
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("ordering the two effects the other way (if the engine even asks) gives the same +3 → 9", async () => {
    const game = await board(true, true).build();
    await stupefyGangplank(game, 99);
    expect(game.state("gp").might).toBe(9);
  });

  test("the +3 is 'this turn': after the turn passes Gangplank is back to 6", async () => {
    const game = await board(true, true).build();
    await stupefyGangplank(game);
    expect(game.state("gp").might).toBe(9);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("gp").might).toBe(6);
    expect(game.state("gp").mightModifier).toBe(0);
  });

  test("contrast — Gangplank NOT empowered (Mel empowered): no replacement, so Mel's modifier applies and Stupefy gives −2 → 4", async () => {
    const game = await board(true, false).build();
    await stupefyGangplank(game);
    expect(game.state("gp").might).toBe(4);
    expect(game.p1.hand()).toEqual(["topcard"]);
  });

  test("contrast — neither empowered: plain Stupefy, −1 → 5", async () => {
    const game = await board(false, false).build();
    await stupefyGangplank(game);
    expect(game.state("gp").might).toBe(5);
  });
});
