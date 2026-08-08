/**
 * Mystic Vortex — ven-160-166 · Battlefield
 *
 *   During showdowns here, cards with [Reaction] cost [rainbow] more to play.
 *   (Hidden cards have [Reaction].)
 *
 * Rules: 363/364 (a battlefield passive; it names no "you", so 190.6.d does not switch it off when
 * uncontrolled — it simply applies while a showdown is in progress HERE); 356.3 (cost increases are
 * applied after base-cost modifications, so 356.1.b "ignoring its base cost" — the facedown play of
 * a Hidden card, 811.1.b — still ends up costing the extra [rainbow], 356.1.b.3); 811.6 (a Hidden
 * card has [Reaction] while facedown / played from facedown → it IS a "card with [Reaction]");
 * "cards" = any player's cards (not "enemy"), spells AND permanents; an [Action]-only card is not
 * affected; activated abilities are not cards.
 *
 * Engine note: a [rainbow] pip is paid from `power.rainbow` in this engine.
 *
 * Head-judge corner cases for THIS card:
 *   1. Scope is the SHOWDOWN'S location, not the card's: any Reaction card anyone plays while a
 *      showdown is open at the Vortex pays +[rainbow] — attacker and defender alike — including a
 *      Hidden card flipped at ANOTHER battlefield during that showdown.
 *   2. Hidden interplay (the reminder text): flipping a facedown card here during a showdown here is
 *      no longer free — it costs exactly [rainbow]; with no power it cannot be flipped at all.
 *   3. Negative space that must stay untouched by a fix: an [Action] spell in the same showdown; a
 *      Reaction spell during a showdown at a DIFFERENT battlefield; a Reaction spell in an open main
 *      phase; a Reaction spell after the showdown here has ended ("during").
 *   4. Uncontrolled Vortex: stepping onto it empty opens a (non-combat) showdown here — the
 *      opponent's Reaction answer still pays the surcharge.
 *   5. Affordability gate: 2 energy and no power → Discipline (2) is NOT playable inside a showdown
 *      here, but is playable in the same position at another battlefield.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-160-166";
const DISCIPLINE = "ogn-058-298"; // Reaction spell, 2 calm: give a unit +2 Might this turn, draw 1
const CLEAVE = "ogn-004-298"; // Action spell, 1 fury: give a unit Assault 3 this turn
const CONSULT_THE_PAST = "ogn-083-298"; // Hidden + Reaction spell, 4 mind: draw 2

/** P2 controls the Vortex (defender "def") and an inert bf2; P1 attacks with a 3-Might unit. */
function board(p1Power: Record<string, number> = { rainbow: 1 }, p2Power: Record<string, number> = { rainbow: 1 }) {
  return scenario()
    .resources(P1, { energy: 3, power: p1Power })
    .resources(P2, { energy: 2, power: p2Power })
    .battlefield("mv", { controller: P2, def: CARD, inert: false, owner: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "mv", { might: 2, name: "Vortex Keeper" }, "def")
    .unit(P2, "bf2", { might: 2, name: "Outrider" }, "def2")
    .unit(P1, "base", { might: 3, name: "Raider" }, "atk")
    .hand(P1, DISCIPLINE, "disc")
    .hand(P1, CLEAVE, "cleave")
    .hand(P2, DISCIPLINE, "disc2")
    .facedown(P2, "mv", CONSULT_THE_PAST, "hiddenHere")
    .facedown(P2, "bf2", CONSULT_THE_PAST, "hiddenThere");
}

describe("Mystic Vortex (ven-160-166)", () => {
  test.failing("BUG: registry payload — no ability is parsed at all; expected a static cost-increase of [rainbow] on Reaction cards conditioned on a showdown here", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Mystic Vortex" });
    const abilities = (def?.abilities ?? []) as { type?: string }[];
    expect(abilities.length).toBeGreaterThan(0);
    expect(abilities[0]?.type).toBe("static");
    const json = JSON.stringify(abilities[0]);
    expect(json).toContain("cost-increase");
    expect(json).toContain("Reaction");
    expect(json.toLowerCase()).toContain("showdown");
  });

  test.failing("BUG: attacker's Reaction spell during the showdown HERE should cost 2 energy + [rainbow] (Discipline: 3/1 → 1/0); the surcharge is not applied", async () => {
    const game = await board().build();
    await game.p1.move("atk", "mv");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.cast("disc", { targets: "atk" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { rainbow: 0 } });
  });

  test.failing("BUG: affordability — with 2 energy and NO power, Discipline must not be playable inside a showdown at the Vortex", async () => {
    const game = await board({}).resources(P1, { energy: 2 }).build();
    await game.p1.move("atk", "mv");
    expect(game.p1.can("cast", "disc")).toBe(false);
  });

  test.failing("BUG: 'cards' means everyone's — the DEFENDER's own Reaction spell during the showdown here also pays +[rainbow] (P2: 2/1 → 0/0)", async () => {
    const game = await board().build();
    await game.p1.move("atk", "mv");
    await game.p1.passFocus();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.cast("disc2", { targets: "def" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  });

  test.failing("BUG: Hidden interplay (811.6 + 356.1.b.3) — flipping the facedown card HERE during the showdown here costs exactly [rainbow] instead of being free", async () => {
    const game = await board().build();
    await game.p1.move("atk", "mv");
    await game.p1.passFocus();
    await game.p2.reveal("hiddenHere");
    expect(game.chain().map((i) => i.cardId)).toEqual(["hiddenHere"]);
    expect(game.p2.resources()).toEqual({ energy: 2, power: { rainbow: 0 } });
  });

  test.failing("BUG: with no power at all the facedown card here cannot be flipped during a showdown here (the [rainbow] surcharge is unpayable)", async () => {
    const game = await board({ rainbow: 1 }, {}).build();
    await game.p1.move("atk", "mv");
    await game.p1.passFocus();
    expect(game.p2.can("reveal", "hiddenHere")).toBe(false);
  });

  test.failing("BUG: the scope is the SHOWDOWN's location — a Hidden card flipped at ANOTHER battlefield while the showdown is open here still pays +[rainbow]", async () => {
    const game = await board().build();
    await game.p1.move("atk", "mv");
    await game.p1.passFocus();
    await game.p2.reveal("hiddenThere");
    expect(game.p2.resources()).toEqual({ energy: 2, power: { rainbow: 0 } });
  });

  test("negative space: an [Action] spell (no [Reaction]) in the very same showdown costs only its printed 1 energy — power untouched", async () => {
    const game = await board().build();
    await game.p1.move("atk", "mv");
    await game.p1.cast("cleave", { targets: "atk" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 1 } });
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
  });

  test("negative space: a Reaction spell during a showdown at a DIFFERENT battlefield costs its printed 2 — and is affordable there with no power at all", async () => {
    const game = await board().build();
    await game.p1.move("atk", "bf2");
    await game.p1.cast("disc", { targets: "atk" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { rainbow: 1 } });
    const noPower = await board({}).resources(P1, { energy: 2 }).build();
    await noPower.p1.move("atk", "bf2");
    expect(noPower.p1.can("cast", "disc")).toBe(true);
    // …and the facedown card there flips for free.
    await noPower.p1.passFocus();
    await noPower.p2.reveal("hiddenThere");
    expect(noPower.p2.resources()).toEqual({ energy: 2, power: { rainbow: 1 } });
  });

  test("negative space: no showdown at all (P1's open main phase) → a Reaction spell costs its printed 2, no power", async () => {
    const game = await board().unit(P1, "base", { might: 1, name: "Squire" }, "squire").build();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    await game.p1.cast("disc", { targets: "squire" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { rainbow: 1 } });
  });

  test("'DURING showdowns here': once the combat here is over, a Reaction spell in the main phase is back to its printed cost", async () => {
    const game = await board().build();
    await game.p1.move("atk", "mv");
    await game.settle(); // 3 vs 2 → P1 conquers the Vortex
    expect(game.gameState.battlefields.mv?.controller).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    await game.p1.cast("disc", { targets: "atk" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { rainbow: 1 } });
  });

  test.failing("BUG: uncontrolled Vortex — stepping onto it empty opens a showdown here; the opponent's Reaction answer should pay +[rainbow] (P2: 2/1 → 0/0)", async () => {
    const game = await scenario()
      .resources(P2, { energy: 2, power: { rainbow: 1 } })
      .battlefield("mv", { controller: null, def: CARD, inert: false, owner: P2 })
      .unit(P1, "base", { might: 3, name: "Raider" }, "atk")
      .unit(P2, "base", { might: 2, name: "Bystander" }, "by")
      .hand(P2, DISCIPLINE, "disc2")
      .build();
    await game.p1.move("atk", "mv");
    expect(game.decision()).toMatchObject({ context: "showdown", seat: P1 });
    await game.p1.passFocus();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.cast("disc2", { targets: "atk" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  });
});
