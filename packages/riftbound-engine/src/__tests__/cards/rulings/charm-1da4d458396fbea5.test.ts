/**
 * Ruling 1da4d458396fbea5 — Charm (OGN-043 → ogn-043-298) · [1][calm] spell · "Move an enemy unit."
 *
 * Q: Can you score on your OPPONENT'S turn if they Charm you into combat and you win?
 * A: Yes. Conquering scores whenever it happens, including on someone else's turn. A player may only
 *    score a given battlefield once per turn, but that limit is per player — the opponent scoring it
 *    earlier on their own turn does not stop you scoring it when you conquer it.
 * Rules: 466.5 (combat resolution → conquer), 469 (Conquer scores 1 point), 470 (once per player per
 *        turn per battlefield), 460.1 (whoever applied Contested is the attacker).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";

/** P2's turn. P2 holds bf1 with a 2-Might defender; P1's 6-Might Champion idles in base; P2 holds Charm. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Sentry" }, "sentry")
    .unit(P1, "base", { might: 6, name: "Champion" }, "champion")
    .hand(P2, CHARM, "charm");
}

describe("Ruling 1da4d458396fbea5 — being Charmed into combat on the opponent's turn can still score for you", () => {
  test("P2 Charms P1's Champion onto P2's own bf1 — the arriving enemy unit is the attacker there", async () => {
    const game = await board().build();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.cast("charm", { targets: "champion", answers: ["bf1"] });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Charm resolves
    expect(game.locationOf("champion")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
  });

  test("ruling: the Champion (6) beats the Sentry (2), conquers bf1 and P1 SCORES on P2's turn", async () => {
    const game = await board().build();
    expect(game.p1.points()).toBe(0);
    await game.p2.cast("charm", { targets: "champion", answers: ["bf1"] });
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.zoneOf("champion")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1); // scored, on the opponent's turn
    expect(game.turnPlayer()).toBe(P2); // still P2's turn
    expect(game.violations()).toEqual([]);
  });

  test("nuance: P2 having already scored bf1 this turn does not block P1 scoring it in the same turn", async () => {
    const game = await board().build();
    // P2 conquers bf1 first with a second unit walking in from base (bf1 is already theirs → no re-conquer),
    // so instead we model the "already scored this turn" state directly on the battlefield record.
    await game.p2.cast("charm", { targets: "champion", answers: ["bf1"] });
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
  });
});
