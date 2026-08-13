/**
 * Ruling 0551e61ed36936fa — Moonfall (UNL-198 → unl-198-219) · Spell · Mind/Chaos · 3 · [Action]
 *   "Choose a battlefield where you have units. You may move up to one enemy unit to that battlefield. Then
 *    give enemy units there -2 [Might] this turn."
 *   (Thousand-Tailed Watcher ogn-116-298 / Smoke Screen ogn-093-298 are cited as analogous one-shot debuffs.)
 *
 * Q: Does Moonfall's -2 [Might] affect enemy units that are played at / moved to that battlefield AFTER it
 *    resolves?
 * A: No. The debuff is applied once, on resolution, to the enemy units there at that moment (a snapshot);
 *    units that arrive later this turn are untouched.
 * Rules: 358 (one-shot effects apply on resolution), 468–470 (continuous effects from resolved spells lock
 *        their affected set), 355.4 (move destination).
 *
 * Line used: P1 (turn player) holds bf1 with a 5-Might unit; P2 has Foe A and Foe B (4 Might each) in base
 * and Ride the Wind in hand. Moonfall drags Foe A to bf1 (-2 → 2). That opens a combat at bf1; in the
 * showdown P2 Rides the Wind Foe B to bf1 — Foe B arrives AFTER Moonfall resolved and stays 4.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MOONFALL = "unl-198-219";
const RIDE_THE_WIND = "ogn-173-298";

function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { mind: 1 } })
    .resources(P2, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 5, name: "Holder" }, "holder")
    .unit(P2, "base", { might: 4, name: "Foe A" }, "foeA")
    .unit(P2, "base", { might: 4, name: "Foe B" }, "foeB")
    .hand(P1, MOONFALL, "moonfall")
    .hand(P2, RIDE_THE_WIND, "rtw");
}

/** Pass chain priority for whoever holds it while `card` is on the chain. */
async function passWhileOnChain(game: Game, card: string): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context !== "chain" || !game.chain().some((c) => c.cardId === card)) {
      return;
    }
    await game.seat(d.seat).pass();
  }
}

describe("Ruling 0551e61ed36936fa — Moonfall debuffs the enemy units there when it resolves; later arrivals are unaffected", () => {
  test("Moonfall resolves: P1 picks Foe A to be moved to bf1 and it gets -2 (4 → 2); Foe B in base is untouched", async () => {
    const game = await board().build();
    await game.p1.cast("moonfall");
    {
        // rule 355.10.b (unl-198-219) — the anchor battlefield is a target of the
        // spell, chosen as it is played: answer it before the pull is offered.
        const anchor = game.decision();
        if (
          anchor?.kind === "pick" &&
          anchor.options.every((o) => game.gameState.battlefields[o.key] !== undefined)
        ) {
          await game.p1.pick(anchor.options[0]?.key as string);
        }
      }
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await passWhileOnChain(game, "moonfall");
    // "You may move up to one enemy unit" — P1 chooses which (a real decision for P1).
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["foeA", "foeB"]);
    await game.p1.pick("foeA");
    expect(game.zoneOf("moonfall")).toBe("trash");
    expect(game.locationOf("foeA")).toBe("bf1");
    expect(game.state("foeA").might).toBe(2);
    expect(game.locationOf("foeB")).toBe("base");
    expect(game.state("foeB").might).toBe(4);
    expect(game.state("holder").might).toBe(5); // friendly units are not touched
  });

  test("ruling 0551e61ed36936fa — Foe B moved to bf1 AFTER Moonfall resolved (P2's Ride the Wind in the ensuing showdown) keeps its full 4 Might; Foe A stays at 2", async () => {
    const game = await board().build();
    await game.p1.cast("moonfall");
    {
        // rule 355.10.b (unl-198-219) — the anchor battlefield is a target of the
        // spell, chosen as it is played: answer it before the pull is offered.
        const anchor = game.decision();
        if (
          anchor?.kind === "pick" &&
          anchor.options.every((o) => game.gameState.battlefields[o.key] !== undefined)
        ) {
          await game.p1.pick(anchor.options[0]?.key as string);
        }
      }
    await passWhileOnChain(game, "moonfall");
    await game.p1.pick("foeA");
    expect(game.state("foeA")).toMatchObject({ location: "bf1", might: 2 });
    // Foe A arriving at P1's battlefield opened a combat there; P2 (attacker) has Focus.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.state("foeA").combatRole).toBe("attacker");
    await game.p2.cast("rtw", { targets: "foeB" });
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 }); // P2 chooses the destination
    await game.p2.pick("battlefield-bf1");
    await passWhileOnChain(game, "rtw");
    expect(game.zoneOf("rtw")).toBe("trash");
    // The crux: Foe B is now an enemy unit at the Moonfall battlefield, but arrived after resolution → still 4.
    expect(game.locationOf("foeB")).toBe("bf1");
    expect(game.state("foeB").might).toBe(4);
    expect(game.state("foeB").isReady).toBe(true); // Ride the Wind readied it
    expect(game.state("foeA").might).toBe(2); // the snapshot debuff persists on the original unit
    expect(game.state("holder").might).toBe(5);
    expect(game.violations()).toEqual([]);
  });
});
