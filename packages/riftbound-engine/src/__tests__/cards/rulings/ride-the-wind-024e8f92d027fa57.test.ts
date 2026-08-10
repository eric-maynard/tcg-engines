/**
 * Ruling 024e8f92d027fa57 — Ride the Wind (OGN-173 → ogn-173-298) · Spell · Chaos · 2+[chaos] · [Action]
 *   "Move a friendly unit and ready it."
 *   × Stellacorn Herder (SFD-048 → sfd-048-221) · 3 Might "When I move, draw 1."
 *   × Thwonk! (SFD-040 → sfd-040-221) · [Action] [Repeat][2] "Stun an attacking unit."
 *
 * Q: Stellacorn is Ride-the-Winded into my opponent's battlefield (arriving READY), gets stunned by Thwonk!, loses and is
 *    recalled to base — is she still ready?
 * A: Yes. A recall does not change the permanent's state: it was Ready (and Stunned) at the battlefield, so it is Ready
 *    (and still Stunned until end of turn) back in base.
 * Rules: 453.1 / 458.1 (recall keeps damage/exhausted/ready state), 423.1.a.2 (stun lasts until the Ending Step),
 *        423.1.b (stunned unit deals no combat damage).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const STELLACORN = "sfd-048-221";
const THWONK = "sfd-040-221";

/**
 * P1's turn. P2 holds bf1 with a 2-Might Wall (can't kill the 3-Might Herder) and holds Thwonk! + [2]. P1: an EXHAUSTED
 * Stellacorn Herder in base, Ride the Wind + 2 + [chaos].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Wall" }, "wall")
    .unit(P1, "base", STELLACORN, "herder", { exhausted: true })
    .hand(P1, RIDE_THE_WIND, "rtw")
    .hand(P2, THWONK, "thwonk");
}

/** Ride the Wind the Herder to bf1; resolve everything up to the open showdown with P1 holding Focus. */
async function rideIn(): Promise<Game> {
  const game = await board().build();
  expect(game.state("herder").isExhausted).toBe(true);
  await game.p1.cast("rtw", { targets: "herder", answers: ["bf1"] });
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    await game.p1.pick("bf1");
  }
  // Drain the chain (Ride the Wind, then the Herder's "When I move, draw 1") until the showdown is open.
  for (let i = 0; i < 10; i++) {
    const x = game.decision();
    if (x?.kind === "action" && x.context === "chain") {
      await game.seat(x.seat).passPriority();
    } else if (x?.kind === "order") {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  expect(game.locationOf("herder")).toBe("bf1");
  expect(game.state("herder")).toMatchObject({ combatRole: "attacker", isReady: true }); // arrived READY (Ride the Wind)
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  return game;
}

describe("Ruling 024e8f92d027fa57 — a Ready+Stunned unit recalled from combat stays Ready (and Stunned)", () => {
  test("Ride the Wind moves the exhausted Herder to bf1 AND readies it; it is the attacker in the showdown there", async () => {
    const game = await rideIn();
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.state("herder").isReady).toBe(true);
  });

  test("P2 (with Focus) Thwonks the attacking Herder: it is now Ready AND Stunned at bf1", async () => {
    const game = await rideIn();
    if (game.decision()?.seat === P1) {
      await game.p1.passFocus();
    }
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "thwonk")).toBe(true);
    await game.p2.cast("thwonk", { targets: "herder" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("thwonk")).toBe("trash");
    expect(game.state("herder")).toMatchObject({ isReady: true, isStunned: true, location: "bf1" });
  });

  test("combat: the stunned Herder deals nothing, survives the Wall's 2, loses and is RECALLED — back in base it is still READY (and still Stunned, damage healed)", async () => {
    const game = await rideIn();
    if (game.decision()?.seat === P1) {
      await game.p1.passFocus();
    }
    await game.p2.cast("thwonk", { targets: "herder" });
    await game.settle();
    expect(game.state("wall")).toMatchObject({ damage: 0, zone: "battlefield-bf1" }); // stunned attacker dealt 0
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.locationOf("herder")).toBe("base"); // recalled
    expect(game.state("herder")).toMatchObject({ damage: 0, isExhausted: false, isReady: true, isStunned: true });
    // Being ready, it may take the Standard Move again this same turn.
    expect(game.p1.legal().some((o) => o.verb === "move")).toBe(true);
    await game.p1.move("herder", "bf1");
    expect(game.locationOf("herder")).toBe("bf1");
    expect(game.state("herder").isExhausted).toBe(true); // the Standard Move exhausts
    expect(game.violations()).toEqual([]);
  });

  test("the Stun wears off in the Ending Step: next turn the Herder is neither stunned nor exhausted", async () => {
    const game = await rideIn();
    if (game.decision()?.seat === P1) {
      await game.p1.passFocus();
    }
    await game.p2.cast("thwonk", { targets: "herder" });
    await game.settle();
    await game.advanceTurn();
    expect(game.state("herder")).toMatchObject({ isStunned: false, location: "base" });
  });
});
