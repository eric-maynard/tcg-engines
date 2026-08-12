/**
 * Ruling 7c7de024a0a95e9c — Stalking Wolf (UNL-166 → unl-166-219) · 6 Might · "[Ambush] As an additional cost to play me, kill a
 *   Bird, Cat, Dog, or Poro you control. You may play me to its battlefield (even if you don't have other units there)."
 *   × Stalwart Poro (OGN-052 → ogn-052-298) · 2 Might · Poro · [Shield]   (Bird token unl-t02 = another eligible pet)
 *
 * Q: I start a showdown with my Stalwart Poro and, holding Focus, want to bring in Stalking Wolf — must I kill the Poro?
 * A: Only if you choose to play the Wolf. The kill is an additional COST of playing it: you are never forced to play the Wolf
 *    (you may pass or do something else), but if you do play it you must pay, and with the Poro as your only pet it dies.
 * Rules: 356.2.a.1 (mandatory additional cost, paid only when the card is played), 822 (Ambush), 355.10.c (cost ≠ target).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STALKING_WOLF = "unl-166-219";
const STALWART_PORO = "ogn-052-298";

/**
 * P1's turn 3. P2 holds bf1 with a 1-Might Guard. P1: ready Stalwart Poro in base, Stalking Wolf in hand, 4 + [order].
 * `spare` adds a SECOND Poro in base, so the pet-kill can be paid without emptying the destination.
 */
function board(spare = false) {
  const s = scenario()
    .turn(3)
    .resources(P1, { energy: 4, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 1, name: "Guard" }, "guard")
    .unit(P1, "base", STALWART_PORO, "poro")
    .unit(P1, "base", { might: 3, name: "Untagged" }, "plain") // not a pet: never an eligible sacrifice
    .hand(P1, STALKING_WOLF, "wolf");
  return spare ? s.unit(P1, "base", STALWART_PORO, "poro2") : s;
}

const sacrificeMenu = (game: Game) =>
  ((game.p1.option("play", "wolf")?.fields.find((f) => f.arg === "sacrifice")?.options as string[] | undefined) ?? []).toSorted();

async function poroAttacks(game: Game): Promise<void> {
  await game.p1.move("poro", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.state("poro").combatRole).toBe("attacker");
}

describe("Ruling 7c7de024a0a95e9c — Stalking Wolf's pet-kill is a cost of PLAYING it, never an obligation by itself", () => {
  // RULING-CONFLICT (adjudicated 2026-08-12 — item f52b2c46ed62; PREVIOUSLY these three facets asserted the
  // opposite, that the Wolf may be played to the battlefield its own cost just emptied. Do not flip them back).
  // riftjudge 7c7de024a0a95e9c reads "You may play me to its battlefield (even if you don't have other units
  // there)" as also granting the TIMING to do it. It does not. The card's clause grants LOCATION validity only;
  // the Reaction speed that lets a unit be played while a showdown is running comes from [Ambush], which is a
  // CONDITIONAL permissive keyword — 813.4 ("the card does not have the Reaction keyword unless and until those
  // circumstances are true"), 813.4.a/813.4.b (the condition may be fulfilled while the item is on the chain, but
  // if it is not fulfilled by step 5 Check Legality the play is undone), and 822.3 ("if there are no units at the
  // location chosen before Finalization completes FOR ANY REASON, then it is no longer a valid location by
  // Ambush's reasoning") with 822.3.a ("other effects and permissions may still enable this Unit to be played to
  // the selected location, but Ambush's permission will not be valid"). Killing the lone friendly unit at the
  // destination as the play's additional cost empties it before Finalization completes, so the Reaction is void
  // and the play is rolled back. Official ruling 57b3e2849ef0109a ("it is not legal on the battlefield you are
  // attacking") says the same thing, and cards/unl-166-219.test.ts,
  // interactions/stalking-wolf-lone-poro-ambush-rollback.test.ts and core-rules/play-options-parity.test.ts all
  // pin it. Engine follows the CR + 57b3e2849ef0109a.
  test("the pet-kill is never an obligation: with the Poro alone at bf1 the Wolf is not even on the menu, P1 simply passes and the Poro wins its combat", async () => {
    const game = await board().build();
    await poroAttacks(game);
    expect(game.p1.can("play", "wolf")).toBe(false); // 822.3/813.4.b — the only payable kill would empty bf1
    expect(game.decision()).toMatchObject({ kind: "action", passKey: expect.any(String) });
    await game.p1.passFocus();
    expect(game.zoneOf("poro")).toBe("battlefield-bf1"); // nothing forced a kill
    expect(game.zoneOf("wolf")).toBe("hand");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.resources()).toEqual({ energy: 4, power: { order: 1 } });
  });

  test("with a SPARE pet in base the play becomes legal, and the attacking Poro is never offered as the sacrifice", async () => {
    const game = await board(true).build();
    await poroAttacks(game);
    expect(game.p1.can("play", "wolf")).toBe(true);
    expect(sacrificeMenu(game)).toEqual(["poro2"]); // not "poro": killing it would empty bf1 (822.3)
    const variants = game.p1.option("play", "wolf")?.variants ?? [];
    expect(variants.length).toBeGreaterThan(0);
    expect(variants.every((v) => v.params.sacrificeId === "poro2")).toBe(true); // no "skip the kill" variant
    expect(variants.every((v) => v.params.location === "battlefield-bf1")).toBe(true);
  });

  test("… playing it that way: 4 + [order] paid, the spare Poro dies as the cost, the Wolf joins the attack at bf1 and conquers", async () => {
    const game = await board(true).build();
    await poroAttacks(game);
    await game.p1.play("wolf", { sacrifice: "poro2", to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.zoneOf("poro2")).toBe("trash");
    await game.settle();
    expect(game.locationOf("wolf")).toBe("bf1");
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.zoneOf("plain")).toBe("base");
    expect(game.violations()).toEqual([]);
  });
});
