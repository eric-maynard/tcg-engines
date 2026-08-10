/**
 * Ruling 0dd417fff400af80 — Hostile Takeover (SFD-202 → sfd-202-221) × Ferrous Forerunner (SFD-021 → sfd-021-221)
 *                           × Hidden Blade (OGN-213 → ogn-213-298) (× Rumble, Hotheaded — Mech synergy, not needed)
 *   Hostile Takeover: 5 + [rainbow][rainbow] Action — "Take control of an enemy unit at a battlefield. Ready it.
 *   (Start a combat if other enemies are there. Otherwise, conquer.) Lose control of that unit and recall it
 *   at end of turn."
 *   Ferrous Forerunner: 6 Might — "[Deathknell] — Play two 3 [Might] Mech unit tokens to your base."
 *   Hidden Blade: 2 + [order] Action — "Kill a unit at a battlefield. Its controller draws 2."
 *
 * Q: I Hostile Takeover the opponent's Forerunner, fight with it, then Hidden Blade it — do I keep the Mech
 *    tokens and draw the 2?
 * A: Yes to both. The Deathknell triggers under MY control (tokens are played to my base and nothing ever hands
 *    them back — Hostile Takeover only returns the unit itself), and Hidden Blade looks back at the controller
 *    at the time of death: me.
 * Rules: 477.1.a (controller), Deathknell ("your base" = controller's), 359 look-back, 317.1 (end-of-turn rider
 *        has nothing to return once the unit is gone).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HOSTILE_TAKEOVER = "sfd-202-221";
const FERROUS_FORERUNNER = "sfd-021-221";
const HIDDEN_BLADE = "ogn-213-298";
const SKULKER = "ogn-175-298";

/** P1's turn. P2 holds bf1 with Ferrous Forerunner + a 2-Might Guard. P1: exactly 7 energy / 3 order for HT (5+2) and Blade (2+1). */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { order: 3 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", FERROUS_FORERUNNER, "fore")
    .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 1, name: "Homebody" }, "home")
    .deck(P1, [SKULKER, SKULKER, SKULKER], ["d1", "d2", "d3"])
    .deck(P2, [SKULKER, SKULKER, SKULKER], ["e1", "e2", "e3"])
    .hand(P1, HOSTILE_TAKEOVER, "ht")
    .hand(P1, HIDDEN_BLADE, "blade");
}

const mechs = (game: Game, seat: "p1" | "p2") => game[seat].base().filter((id) => game.state(id).name === "Mech");

/** Cast Hostile Takeover on the Forerunner and let the resulting combat at bf1 resolve. */
async function takeover(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("ht", { targets: "fore" });
  expect(game.p1.resources()).toEqual({ energy: 2, power: { order: 1 } });
  await game.settle();
  return game;
}

describe("Ruling 0dd417fff400af80 — a stolen Forerunner killed by my Hidden Blade: I keep the Mechs and I draw 2", () => {
  test("steps 1–3: Hostile Takeover takes and readies the Forerunner; the combat it starts at bf1 is won (Guard dies) and P1 conquers bf1 with it", async () => {
    const game = await takeover();
    expect(game.state("fore")).toMatchObject({ controller: P1, owner: P2, zone: "battlefield-bf1" });
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("step 4–5: Hidden Blade on the (still stolen) Forerunner kills it — its Deathknell resolves under P1's control: two 3-Might Mech tokens land in P1's base, none in P2's", async () => {
    const game = await takeover();
    await game.p1.cast("blade", { targets: "fore" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("fore")).toBe("trash");
    expect(game.p2.trash()).toContain("fore"); // the card itself goes to its OWNER's trash
    const mine = mechs(game, "p1");
    expect(mine).toHaveLength(2);
    for (const m of mine) {
      expect(game.state(m)).toMatchObject({ controller: P1, isToken: true, might: 3, owner: P1 });
    }
    expect(mechs(game, "p2")).toEqual([]);
  });

  test("step 6: Hidden Blade's 'its controller draws 2' looks back at the controller when it died — P1 draws 2 (d1, d2); P2 draws nothing", async () => {
    const game = await takeover();
    const p1Hand = game.p1.hand().length; // blade only
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("blade", { targets: "fore" });
    await game.settle();
    expect(game.p1.hand()).toHaveLength(p1Hand - 1 + 2);
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]);
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.p2.deck()[0]).toBe("e1");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("nuance: nothing ever returns the tokens — Hostile Takeover's end-of-turn 'lose control and recall' concerned only the (now dead) unit; two turns later both Mechs are still P1's", async () => {
    const game = await takeover();
    await game.p1.cast("blade", { targets: "fore" });
    await game.settle();
    const mine = mechs(game, "p1");
    await game.advanceTurn(); // end of P1's turn passes: the rider finds no unit to hand back
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("fore")).toBe("trash");
    for (const m of mine) {
      expect(game.state(m)).toMatchObject({ controller: P1, zone: "base" });
    }
    expect(mechs(game, "p2")).toEqual([]);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(mechs(game, "p1").sort()).toEqual([...mine].sort());
    expect(mechs(game, "p2")).toEqual([]);
  });
});
