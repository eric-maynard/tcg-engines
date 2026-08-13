/**
 * Ruling 380ea397a78c1022 — Moonfall (UNL-198 → unl-198-219) · Spell [3][rainbow] [Action]
 *   "Choose a battlefield where you have units. You may move up to one enemy unit to that battlefield. Then give enemy
 *    units there -2 [Might] this turn."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · Spell [2][chaos] [Action] "Move a friendly unit and ready it."
 *
 * Q: Moonfall was cast on a battlefield; afterwards a new enemy unit arrives there (Ambush / Ride the Wind). -2 too?
 * A: No. The -2 is applied once, at resolution, to the enemy units there at that moment; later arrivals are unaffected.
 * Rules: 359 (one-shot effect applied on resolution — not a continuous "units here have" static).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MOONFALL = "unl-198-219";
const RIDE_THE_WIND = "ogn-173-298";

function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { rainbow: 1 } })
    .resources(P2, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 5, name: "Holder" }, "holder")
    .unit(P2, "base", { might: 4, name: "Dragged" }, "dragged")
    .unit(P2, "base", { might: 4, name: "Latecomer" }, "late")
    .hand(P1, MOONFALL, "moonfall")
    .hand(P2, RIDE_THE_WIND, "ride");
}

/** P1 casts Moonfall on bf1 (the only battlefield with P1 units) and drags "dragged" there. */
async function moonfallResolved(): Promise<Game> {
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
  expect(game.chain().map((c) => c.cardId)).toEqual(["moonfall"]);
  await game.acting().passPriority();
  await game.acting().passPriority();
  // "You may move up to one enemy unit" — P1 chooses which (a real P1 decision).
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  if (d?.kind === "pick") {
    expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["dragged", "late"]);
  }
  await game.p1.pick("dragged");
  return game;
}

describe("Ruling 380ea397a78c1022 — Moonfall's -2 hits only the enemy units there when it resolves", () => {
  test("on resolution: the dragged enemy unit is at bf1 with -2 (4 → 2); the one still in base is untouched", async () => {
    const game = await moonfallResolved();
    expect(game.zoneOf("moonfall")).toBe("trash");
    expect(game.locationOf("dragged")).toBe("bf1");
    expect(game.state("dragged").might).toBe(2);
    expect(game.state("late").might).toBe(4);
    expect(game.state("holder").might).toBe(5); // friendly units unaffected
  });

  test("a unit that arrives AFTERWARDS (Ride the Wind in the ensuing showdown) keeps its full 4 Might — no -2", async () => {
    const game = await moonfallResolved();
    // The dragged unit now opposes Holder at bf1 → a showdown is open; P2 acts in it.
    if (game.actingSeat() === P1) {
      await game.p1.passFocus();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.cast("ride", { targets: "late" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ride"]);
    await game.acting().passPriority();
    await game.acting().passPriority();
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      await game.p2.pick("bf1");
    }
    // Check the moment the Latecomer stands at bf1 (before combat damage muddles the picture).
    expect(game.zoneOf("ride")).toBe("trash");
    expect(game.locationOf("late")).toBe("bf1");
    expect(game.state("late").might).toBe(4);
    expect(game.state("late").mightModifier).toBe(0);
    expect(game.state("dragged").might).toBe(2); // the snapshot -2 persists on the original victim
    expect(game.violations()).toEqual([]);
  });
});
