/**
 * Ruling b7784d987397ef61 — Ruined Rex (UNL-067 → unl-067-219) · 6 Might
 *     "[Deathknell][>] Deal 4 to an enemy unit. (When I die, get the effect.)"
 *
 * Q: Does Ruined Rex's Deathknell damage happen BEFORE the combat healing step?
 * A: No — healing comes first. Combat Cleanup runs: damage dealt → Rex is marked lethal and his Deathknell
 *    becomes a pending chain item → lethal units are trashed → ALL units are healed → only then does the
 *    pending Deathknell resolve and deal its 4. So the survivor's combat damage is already wiped when the 4
 *    lands, and a unit that survived combat on the brink is not finished off by the earlier damage.
 * Rules: 461.1.a.1 (Combat Cleanup heals all units), 808.1 ([Deathknell] is a trigger, queued at the death and
 *        resolved through the normal chain afterwards), 143.3.b (damage stays marked until end of turn).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RUINED_REX = "unl-067-219";

/**
 * P2's turn 3. P1 holds bf1 with a 7-Might Bulwark; P2's Ruined Rex (6) attacks out of base. Combat: Rex takes 7
 * (lethal, dies), the Bulwark takes Rex's 6 and lives at 7 Might.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 7, name: "Bulwark" }, "bulwark")
    .unit(P2, "base", RUINED_REX, "rex");
}

/** Fight it out, then walk the chain, aiming any Deathknell pick at the Bulwark. */
async function fight(game: Game): Promise<Decision[]> {
  await game.p2.move("rex", "bf1");
  await game.p2.passFocus();
  await game.p1.passFocus();
  const seen: Decision[] = [];
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    seen.push(d);
    if (d.kind === "pick") {
      await game.seat(d.seat).pick("bulwark");
    } else if (d.kind === "order") {
      await game.acceptTriggerOrder();
    } else if (d.kind === "action") {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
  return seen;
}

describe("Ruling b7784d987397ef61 — the combat heal happens BEFORE Ruined Rex's Deathknell resolves", () => {
  test("intermediate fact: Rex dies in the combat and his Deathknell is a pending chain item while the survivor is still on the board", async () => {
    const game = await board().build();
    await game.p2.move("rex", "bf1");
    await game.p2.passFocus();
    await game.p1.passFocus();
    expect(game.zoneOf("rex")).toBe("trash");
    expect(game.zoneOf("bulwark")).toBe("battlefield-bf1");
    expect(game.chain().map((c) => `${c.cardId}:${String(c.triggered)}`)).toEqual(["rex:true"]);
  });

  test("ruling: when the Deathknell finally resolves the Bulwark carries EXACTLY 4 — its 6 combat damage was healed away first", async () => {
    const game = await board().build();
    await fight(game);
    expect(game.state("bulwark").damage).toBe(4);
    expect(game.state("bulwark").might).toBe(7);
    expect(game.violations()).toEqual([]);
  });

  test("…and that is why it lives: 6 (combat) + 4 (Deathknell) would have been lethal on a 7-Might unit if the 4 had landed first", async () => {
    const game = await board().build();
    await fight(game);
    expect(game.zoneOf("bulwark")).toBe("battlefield-bf1");
    expect(6 + 4).toBeGreaterThanOrEqual(game.state("bulwark").might); // the counterfactual that did NOT happen
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // P1 defended successfully
  });

  test("the 4 is real damage that stays marked for the rest of the turn (no second heal follows the Deathknell)", async () => {
    const game = await board().build();
    await fight(game);
    expect(game.state("bulwark").damage).toBe(4);
    await game.settle();
    expect(game.state("bulwark").damage).toBe(4);
  });
});
