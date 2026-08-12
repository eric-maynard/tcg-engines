/**
 * Ruling c1edab45ab8d7f0f — Sunken Temple (SFD-218 → sfd-218-221, Battlefield) "When you conquer here with one or more [Mighty] units,
 *     you may pay [1] to draw 1. (A unit is Mighty while it has 5+ [Might].)"
 *   × Cleave (OGN-004 → ogn-004-298) · Action · [1] · "Give a unit [Assault 3] this turn. (+3 [Might] while it's an attacker.)"
 *
 * Q: Attacking Sunken Temple with Cleave — if a unit is only Mighty because of Assault +3, does the Temple's conquer ability trigger?
 * A (this ruling): No — it claims the Assault bonus goes away together with the attacker designation just before conquering.
 * A (CR, and riftjudge 8bf06d3d8b09e32c): YES, it triggers. Conquer happens at combat-resolution step 466.5/466.5.d, while
 *    466.7.a only removes the Attacker Designation at step 7 — so Assault is still live when the conquer trigger looks for
 *    Mighty units. See the RULING-CONFLICT note on the last facet; the engine implements the CR reading.
 * Rules: 807.1.c–d (Assault only while an attacker), 466.5/466.5.d (conquer) vs 466.7.a (designation removed), 776 (Mighty).
 * SETTLED — do not re-litigate: DESIGN.md § "Combat Resolution Step (466) — two settled adjudications".
 *     This ruling, 42b466db3f308240, c1e05840717871da and 7412ece9e8248139 all strip the designation before
 *     the Conquer and all describe the PRE-Unleashed rules (f04d5265ef4cdef8 states the change); riftfaq
 *     8bf06d3d8b09e32c cites 466.5.d vs 466.7.a. All four tests assert the CR reading, annotated RULING-CONFLICT.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SUNKEN_TEMPLE = "sfd-218-221";
const CLEAVE = "ogn-004-298";

/** P1's turn with exactly [2] (Cleave + the Temple's [1]). P2 holds the live Sunken Temple with a Guard (4). P1's Squire (2) in base, Cleave in hand. */
function board(attacker: { might: number; name: string } = { might: 2, name: "Squire" }) {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("temple", { controller: P2, def: SUNKEN_TEMPLE, inert: false, owner: P1 })
    .unit(P2, "temple", { might: 4, name: "Temple Guard" }, "guard")
    .unit(P1, "base", attacker, "squire")
    .hand(P1, CLEAVE, "cleave")
    .deck(P1, ["ogn-175-298"], ["d1"]);
}

/** Pass focus/priority until a real prompt or the open main phase. */
async function passOut(game: Game): Promise<void> {
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || (d.context !== "chain" && d.context !== "showdown") || !d.passKey) {
      return;
    }
    await game.seat(d.seat).pass();
  }
}

/** Squire attacks the Temple; with Focus, P1 Cleaves it (Assault 3 → 5 while attacking); combat resolves. */
async function cleaveAndConquer(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("squire", "temple");
  expect(game.state("squire").combatRole).toBe("attacker");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("cleave", { targets: "squire" });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("cleave")).toBe("trash");
  expect(game.state("squire")).toMatchObject({ combatRole: "attacker", might: 5 }); // 2 + Assault 3 — Mighty ONLY through Assault
  await passOut(game);
  return game;
}

describe("Ruling c1edab45ab8d7f0f — a conqueror Mighty only via Cleave's Assault (CR-corrected: it DOES trigger Sunken Temple)", () => {
  test("the attack itself works: 5 (with Assault) beats the 4-Might Guard, P1 conquers the Temple and scores; afterwards the Squire is a plain 2 again", async () => {
    const game = await cleaveAndConquer();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("squire")).toBe("battlefield-temple");
    expect(game.gameState.battlefields.temple?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    // finish whatever is pending without paying anything
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1) {
        await game.p1.no();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.state("squire")).toMatchObject({ combatRole: null, might: 2 });
  });

  test("control: a unit that is Mighty on its own (5 base) conquering the Temple DOES get the 'pay [1] to draw 1' offer, and paying draws", async () => {
    const game = await board({ might: 5, name: "Champion" }).build();
    await game.p1.move("squire", "temple");
    await passOut(game);
    expect(game.gameState.battlefields.temple?.controller).toBe(P1);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.hand()).toEqual(["cleave", "d1"]);
  });

  // RULING-CONFLICT: riftjudge c1edab45ab8d7f0f says the Assault bonus is gone before conquer abilities check for
  // Mighty units; riftjudge 8bf06d3d8b09e32c answers the same question the opposite way, and the CR sides with the
  // latter — rule 466.5/466.5.d Establishes Control (and so Conquers) at combat-resolution step 5, while rule 466.7.a
  // only removes the Attacker Designation at step 7. Assault (rule 807.1.c–d, "while it's an attacker") is therefore
  // still live at conquer, so the 5-Might Squire IS Mighty (rule 776) and Sunken Temple offers "pay [1] to draw 1".
  // The engine is correct; this facet asserts the engine's (and the CR's) behaviour.
  test("ruling c1edab45ab8d7f0f (CR-corrected): the Assault bonus is still live at conquer, so Sunken Temple sees a Mighty conqueror and offers the paid draw", async () => {
    const game = await cleaveAndConquer();
    expect(game.gameState.battlefields.temple?.controller).toBe(P1);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.p1.energy()).toBe(0); // [2] = Cleave [1] + the Temple's [1]
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.state("squire")).toMatchObject({ combatRole: null, might: 2 }); // Assault gone once combat ended
    expect(game.violations()).toEqual([]);
  });
});
