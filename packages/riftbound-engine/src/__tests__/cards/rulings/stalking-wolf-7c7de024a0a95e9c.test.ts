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

/** P1's turn 3. P2 holds bf1 with a 1-Might Guard. P1: ready Stalwart Poro in base, Stalking Wolf in hand, 4 + [order]. */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 4, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 1, name: "Guard" }, "guard")
    .unit(P1, "base", STALWART_PORO, "poro")
    .unit(P1, "base", { might: 3, name: "Untagged" }, "plain") // not a pet: never an eligible sacrifice
    .hand(P1, STALKING_WOLF, "wolf");
}

const sacrificeMenu = (game: Game) =>
  ((game.p1.option("play", "wolf")?.fields.find((f) => f.arg === "sacrifice")?.options as string[] | undefined) ?? []).toSorted();

async function poroAttacks(game: Game): Promise<void> {
  await game.p1.move("poro", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.state("poro").combatRole).toBe("attacker");
}

describe("Ruling 7c7de024a0a95e9c — Stalking Wolf's pet-kill is a cost of PLAYING it, never an obligation by itself", () => {
  // BUG — this ruling (7c7de024a0a95e9c: "you may play me to its battlefield even if you don't have other units
  // there") conflicts with ruling 57b3e2849ef0109a, which the engine implements: an Ambush play whose additional
  // cost kills the lone friendly unit at the destination empties it before Finalization, so the granted [Reaction]
  // is void at Check Legality (822.1.b / 822.3 / 813.4.b). Until the conflict is resolved the Wolf's whole line is
  // unavailable here, so all three facets are tracked as failing.
  // RULING-CONFLICT: riftjudge 7c7de024a0a95e9c would make the Wolf playable to the emptied battlefield at
  // Reaction speed; official ruling 57b3e2849ef0109a ("It is not legal on the battlefield you are attacking")
  // and 822.3 / 813.4.b say the card's "its battlefield" clause grants LOCATION validity, not TIMING — engine
  // follows 57b3e2849ef0109a, which `cards/unl-166-219.test.ts`, `interactions/stalking-wolf-lone-poro-ambush-
  // rollback.test.ts` and `core-rules/play-options-parity.test.ts` all pin.
  test.failing("BUG: holding Focus after the Poro attacks, playing the Wolf is merely an OPTION next to passing — P1 may simply pass, the Poro is not killed and wins its combat", async () => {
    const game = await board().build();
    await poroAttacks(game);
    expect(game.p1.can("play", "wolf")).toBe(true); // available (Ambush: bf1 has my Poro) …
    expect(game.decision()).toMatchObject({ kind: "action", passKey: expect.any(String) }); // … but so is passing
    await game.p1.passFocus();
    expect(game.zoneOf("poro")).toBe("battlefield-bf1"); // nothing forced a kill
    expect(game.zoneOf("wolf")).toBe("hand");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.resources()).toEqual({ energy: 4, power: { order: 1 } });
  });

  test.failing("BUG: if P1 DOES play the Wolf, the cost is mandatory and the Poro is the only eligible pet: every play variant sacrifices the Poro (the untagged unit is never offered)", async () => {
    const game = await board().build();
    await poroAttacks(game);
    expect(sacrificeMenu(game)).toEqual(["poro"]);
    const variants = game.p1.option("play", "wolf")?.variants ?? [];
    expect(variants.length).toBeGreaterThan(0);
    expect(variants.every((v) => v.params.sacrificeId === "poro")).toBe(true); // no "skip the kill" variant
  });

  test.failing("BUG: … playing it: 4 + [order] paid, the Poro is killed as the cost, the Wolf enters ITS battlefield (bf1) even with no other unit there, takes over the attack and conquers", async () => {
    const game = await board().build();
    await poroAttacks(game);
    await game.p1.play("wolf", { sacrifice: "poro", to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.zoneOf("poro")).toBe("trash");
    await game.settle();
    expect(game.locationOf("wolf")).toBe("bf1");
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.zoneOf("plain")).toBe("base");
    expect(game.violations()).toEqual([]);
  });
});
