/**
 * Ruling 38d3d4eea4d70022 — Nidalee, Cat Form (UNL-114 → unl-114-219) · Unit · Body · [3][body] · 4 Might
 *   "[Ambush]\nWhen I win a combat, draw 1. (I win if I remain after combat.)"
 *
 * Q: Nidalee dies in the combat but another friendly unit survives and takes the battlefield — do I still draw?
 * A: No. Her reminder text narrows "win" to herself: SHE must remain after combat. A surviving teammate
 *    wins the combat for you and conquers, but Nidalee's trigger never fires.
 * Rules: 466.3 (combat result is per player), 466.3.c (units inherit their controller's result),
 *        383.2 (the trigger's own condition — "I remain" — is what must be true).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NIDALEE = "unl-114-219";

/**
 * P2 holds bf1 with a 4-Might Brute. P1 attacks with Nidalee (4) + a 5-Might Ally: the Brute dies to the
 * 9 attacking damage, and P2 has exactly 4 damage to place — enough to kill Nidalee OR to bounce off the Ally.
 */
async function attackWithNidaleeAndAlly(): Promise<Game> {
  const game = await scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Brute" }, "brute")
    .unit(P1, "base", NIDALEE, "nidalee")
    .unit(P1, "base", { might: 5, name: "Ally" }, "ally")
    .build();
  await game.p1.move(["nidalee", "ally"], "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ kind: "distribute", seat: P2 });
  return game;
}

describe("Ruling 38d3d4eea4d70022 — Nidalee draws only if SHE remains after the combat", () => {
  test("Nidalee dies, the Ally survives and conquers — P1 wins the combat but there is NO draw", async () => {
    const game = await attackWithNidaleeAndAlly();
    const deck0 = game.p1.deck().length;

    await game.p2.distribute({ nidalee: 4 }); // all 4 onto Nidalee: lethal
    await game.settle();

    expect(game.zoneOf("nidalee")).toBe("trash");
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.locationOf("ally")).toBe("bf1");
    // P1 (and the Ally) won the combat and took the battlefield…
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    // …but Nidalee did not remain, so her trigger never fired.
    expect(game.p1.deck()).toHaveLength(deck0);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("same combat, damage sent at the Ally instead — Nidalee remains, so she draws 1", async () => {
    const game = await attackWithNidaleeAndAlly();
    const deck0 = game.p1.deck().length;

    await game.p2.distribute({ ally: 4 }); // 4 onto the 5-Might Ally: not lethal
    await game.settle();

    expect(game.locationOf("nidalee")).toBe("bf1");
    expect(game.locationOf("ally")).toBe("bf1");
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.p1.deck()).toHaveLength(deck0 - 1);
  });
});
