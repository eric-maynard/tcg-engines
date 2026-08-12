/**
 * Ruling 83f35fd8e1ab4f2e — Solari Chief (OGN-225 → ogn-225-298) · Unit · Order · [5][order] · 4 Might
 *     "When you play me, choose an enemy unit. If it is stunned, kill it. Otherwise, stun it."
 *   × Leona, Determined (ogn-238-298) "[Shield] · When I attack, stun an enemy unit here."
 *
 * Q: An attacking Leona stuns the defending Miss Fortune but neither unit dies in combat — what happens?
 * A: Nobody won the combat, so the attackers are recalled to base (keeping their ready/exhausted state) and all marked
 *    damage is cleared. Miss Fortune stays STUNNED for the rest of the turn, which is exactly what lets a freshly
 *    played Solari Chief kill her outright.
 * Rules: 466.5 (combat result; attackers with no result go home), 461.1.a.1 (Combat Cleanup clears marked damage),
 *        445 (moves do not change ready/exhausted state), 830.1 ([Stun] lasts until end of turn).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LEONA_DETERMINED = "ogn-238-298";
const SOLARI_CHIEF = "ogn-225-298";

/**
 * P1's turn with [5][order] for the Solari Chief. P2 holds bf1 with a big "Miss Fortune" (9 Might) — Leona's 4 will not
 * kill her, and stunned she deals nothing back, so both survive.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 9, name: "Miss Fortune" }, "mf")
    .unit(P1, "base", LEONA_DETERMINED, "leona")
    .hand(P1, SOLARI_CHIEF, "chief");
}

/** Leona attacks bf1 alone; her "when I attack" stun is aimed at Miss Fortune; the combat then runs to completion. */
async function attackAndSurvive(): Promise<{ exhaustedOnArrival: boolean; game: Game }> {
  const game = await board().build();
  expect(game.state("leona").isExhausted).toBe(false);
  await game.p1.move("leona", "bf1");
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("mf");
  }
  const exhaustedOnArrival = game.state("leona").isExhausted; // the MOVE is what exhausts her, not the recall
  await game.settle();
  return { exhaustedOnArrival, game };
}

describe("Ruling 83f35fd8e1ab4f2e — neither unit dies: the attacker goes home, the stun outlives the combat", () => {
  test("both survive, so Leona is recalled to base in exactly the state she left in, and Miss Fortune stays at bf1 with her damage cleared", async () => {
    const { exhaustedOnArrival, game } = await attackAndSurvive();
    expect(game.zoneOf("mf")).toBe("battlefield-bf1");
    expect(game.state("mf").damage).toBe(0); // cleared at Combat Cleanup
    expect(game.locationOf("leona")).toBe("base"); // recalled
    // The recall itself changes nothing: she comes home in exactly the state she attacked in.
    expect(game.state("leona")).toMatchObject({ damage: 0, isExhausted: exhaustedOnArrival });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("Miss Fortune is still STUNNED after the combat ends — the stun lasts the turn, unlike the damage", async () => {
    const { game } = await attackAndSurvive();
    expect(game.state("mf").isStunned).toBe(true);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("ruling 83f35fd8e1ab4f2e — that lingering stun is lethal: Solari Chief played afterwards chooses her and KILLS her instead of stunning her", async () => {
    const { game } = await attackAndSurvive();
    await game.p1.play("chief", { to: "base" });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("mf");
    }
    await game.settle();
    expect(game.zoneOf("mf")).toBe("trash");
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — against an UNSTUNNED enemy the Chief only stuns it", async () => {
    const game = await board().unit(P2, "base", { might: 3, name: "Fresh" }, "fresh").build();
    await game.p1.play("chief", { to: "base" });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("fresh");
    }
    await game.settle();
    expect(game.zoneOf("fresh")).toBe("base");
    expect(game.state("fresh").isStunned).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
