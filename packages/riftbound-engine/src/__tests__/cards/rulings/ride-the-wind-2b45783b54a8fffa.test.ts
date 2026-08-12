/**
 * Ruling 2b45783b54a8fffa — Ride the Wind (OGN-173 → ogn-173-298) · [2][chaos] [Action] "Move a friendly unit and ready it."
 *   × Blood Rush (SFD-003 → sfd-003-221) · [1] Action, "Give a unit [Assault 2] this turn."
 *
 * Q: If I "attack" a battlefield with no units on it, does [Assault] still give +Might?
 * A: No. You move TO a battlefield; combat only happens if an opponent's unit is there. Attacker and
 *    defender designations — which is what [Assault] keys off — exist only in a combat showdown, so a
 *    unit walking onto an empty battlefield gets no bonus.
 *    Nuance: if the opponent then rides a unit in during that showdown, a combat is staged — you stay the
 *    attacker (surprise defense), because you applied Contested first, and then [Assault] does apply.
 * Rules: 801 ([Assault] = +N while I'm an attacker), 316.8.b.1 (empty battlefield ⇒ non-combat showdown),
 *        460.1 (attacker = the player who first applied Contested).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const BLOOD_RUSH = "sfd-003-221";

const stack = (game: Game) => (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active);

/** P1's turn: Scout (3) in base with Blood Rush + [1]; bfX empty/uncontrolled, bf1 held by P2 with a 1-Might Sentry. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 2, power: { chaos: 1 } })
    .battlefield("bfX", { controller: null })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 1, name: "Sentry" }, "sentry")
    .unit(P1, "base", { might: 3, name: "Scout" }, "scout")
    .unit(P2, "base", { might: 4, name: "Rider" }, "rider")
    .hand(P1, BLOOD_RUSH, "rush")
    .hand(P2, RIDE_THE_WIND, "rtw");
}

/** Give the Scout [Assault 2] and let it resolve. */
async function assaultedScout(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("rush", { targets: "scout" });
  await game.settle();
  expect(game.state("scout").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 2 }]);
  expect(game.state("scout").might).toBe(3);
  return game;
}

describe("Ruling 2b45783b54a8fffa — [Assault] needs an attacker designation, which an empty battlefield never creates", () => {
  test("ruling: moving onto the empty bfX gives no attacker role and no [Assault] bonus — the Scout stays at 3", async () => {
    const game = await assaultedScout();
    await game.p1.move("scout", "bfX");
    expect(stack(game)[0]).toMatchObject({ battlefieldId: "bfX", isCombatShowdown: false });
    expect(game.state("scout").combatRole).toBeNull();
    expect(game.state("scout").might).toBe(3); // NOT 5
  });

  test("contrast: moving into the enemy-occupied bf1 makes it an attacker, and [Assault 2] applies (3 → 5)", async () => {
    const game = await assaultedScout();
    await game.p1.move("scout", "bf1");
    expect(stack(game)[0]).toMatchObject({ battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.state("scout").combatRole).toBe("attacker");
    expect(game.state("scout").might).toBe(5);
  });

  test("nuance: P2 rides a unit into bfX during the showdown — P1 stays the ATTACKER (surprise defense) and [Assault] now counts", async () => {
    const game = await assaultedScout();
    await game.p1.move("scout", "bfX");
    await game.p1.passFocus();
    await game.p2.cast("rtw", { targets: "rider" });
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("battlefield-bfX");
    }
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.locationOf("rider")).toBe("bfX");
    expect(game.state("scout").combatRole).toBe("attacker"); // moved there first
    expect(game.state("rider").combatRole).toBe("defender"); // arrived second
    expect(game.state("scout").might).toBe(5); // 3 + [Assault 2]
    await game.settle();
    expect(game.zoneOf("rider")).toBe("trash"); // 5 attacking Might beats the 4-Might Rider
    expect(game.gameState.battlefields.bfX?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
