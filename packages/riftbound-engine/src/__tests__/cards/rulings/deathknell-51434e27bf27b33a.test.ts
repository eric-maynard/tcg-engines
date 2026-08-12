/**
 * Ruling 51434e27bf27b33a — (Deathknell vs the combat heal; no specific card named)
 *   Stand-in: Kog'Maw, Caustic (OGN-190 → ogn-190-298) · [3][chaos] · 1 [Might] · "[Deathknell] — Deal 4 to all
 *   units at my battlefield. (When I die, get the effect.)"
 *
 * Q: In a Combat Cleanup, does a Deathknell effect resolve before or after the units are healed?
 * A: After. The Deathknell trigger is only QUEUED while the Cleanup kills the unit; the Cleanup then heals every
 *    surviving unit, and only afterwards does the chain (with the Deathknell on it) resolve. So a survivor's
 *    combat damage is already wiped and the Deathknell cannot "finish it off" with what combat had done.
 * Rules: 466.1.a.1 (Combat Cleanup inserts "Heal all Units"), 323.4-323.5 (triggers are queued as the Cleanup
 *        kills), 466.2 (the chain from the damage step and the Cleanup resolves after it), 808.1.d ([Deathknell]).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KOGMAW_CAUSTIC = "ogn-190-298";

/** P1's turn. P2 holds bf1 with a big Keeper (8). P1 attacks with Kog'Maw (1) and a Brute (5): 6 damage in, 8 back. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 8, name: "Keeper" }, "keeper")
    .unit(P1, "base", KOGMAW_CAUSTIC, "kogmaw")
    .unit(P1, "base", { might: 5, name: "Brute" }, "brute");
}

async function combatResolved(): Promise<Game> {
  const game = await board().build();
  await game.p1.move(["kogmaw", "brute"], "bf1");
  await game.settle();
  return game;
}

describe("Ruling 51434e27bf27b33a — the combat heal happens first; the Deathknell resolves on healed units", () => {
  test("both attackers die to the Keeper's 8; Kog'Maw's Deathknell then deals its 4 to a Keeper that has ALREADY been healed of the 6 combat damage — so it survives on 4", async () => {
    const game = await combatResolved();
    expect(game.zoneOf("kogmaw")).toBe("trash");
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.zoneOf("keeper")).toBe("battlefield-bf1");
    // 6 (combat) + 4 (Deathknell) would be 10 ≥ 8 and lethal; healing first leaves exactly the Deathknell's 4.
    expect(game.state("keeper")).toMatchObject({ damage: 4, might: 8 });
    expect(game.violations()).toEqual([]);
  });

  test("the defender therefore keeps the battlefield and P1 scores nothing", async () => {
    const game = await combatResolved();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.chain()).toEqual([]);
  });

  test("the Deathknell damage is real, though: against a 4-Might Keeper the same post-heal 4 is lethal and kills it", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Keeper" }, "keeper")
      .unit(P2, "bf1", { might: 4, name: "Second" }, "second")
      .unit(P1, "base", KOGMAW_CAUSTIC, "kogmaw")
      .build();
    // 8 defending Might kills the 1-Might Kog'Maw; its Deathknell then deals 4 to every unit at bf1.
    await game.p1.move("kogmaw", "bf1");
    await game.settle();
    expect(game.zoneOf("kogmaw")).toBe("trash");
    expect(game.zoneOf("keeper")).toBe("trash");
    expect(game.zoneOf("second")).toBe("trash");
  });
});
