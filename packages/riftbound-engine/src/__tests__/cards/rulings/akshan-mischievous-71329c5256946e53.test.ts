/**
 * Ruling 71329c5256946e53 — Akshan, Mischievous (SFD-109 → sfd-109-221) · Unit · Body · [4] · 4 Might
 *   "You may pay [body][body] as an additional cost to play me.
 *    When you play me, if you paid the additional cost, move an enemy gear to your base. You control it until I
 *    leave the board. …"
 *
 * Q: I steal a TAPPED (exhausted) gear with Akshan. Does it arrive tapped or untapped?
 * A: Tapped. Gaining control of a permanent never changes its exhausted/ready status; only an effect that says so
 *    does. Akshan only moves it and changes its controller.
 * Rules: 424 (change of control keeps the object's state), 429 (exhaust/ready are separate game actions),
 *        375 (a permanent keeps damage, counters and status across a control change).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const AKSHAN = "sfd-109-221";
/** A non-Equipment gear, so the trailing "if it's an Equipment, attach it to me" clause stays out of the way. */
const TRINKET = { cardType: "gear", name: "Trinket" } as const;

/** P1's turn with Akshan's [4] plus the [body][body] additional cost in the pool; P2 owns the gear. */
function board(exhausted: boolean) {
  return scenario()
    .resources(P1, { energy: 4, power: { body: 2 } })
    .gear(P2, TRINKET, "trinket", { exhausted })
    .hand(P1, AKSHAN, "akshan");
}

describe("Ruling 71329c5256946e53 — Akshan's steal preserves the gear's tapped/ready status", () => {
  test("a TAPPED gear is still tapped after the steal — only its controller and location changed", async () => {
    const game = await board(true).build();
    expect(game.state("trinket")).toMatchObject({ controller: P2, isExhausted: true });
    await game.p1.play("akshan", { payOptional: true });
    await game.settle();
    expect(game.state("trinket")).toMatchObject({ controller: P1, isExhausted: true, isReady: false, owner: P2 });
    expect(game.p1.gear()).toEqual(["trinket"]);
    expect(game.p2.gear()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("the mirror — a READY gear arrives ready; nothing in the steal exhausts or readies it", async () => {
    const game = await board(false).build();
    expect(game.state("trinket")).toMatchObject({ controller: P2, isExhausted: false });
    await game.p1.play("akshan", { payOptional: true });
    await game.settle();
    expect(game.state("trinket")).toMatchObject({ controller: P1, isExhausted: false, isReady: true, owner: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("no additional cost paid ⇒ no steal at all, so the tapped gear never moves", async () => {
    const game = await board(true).build();
    await game.p1.play("akshan");
    await game.settle();
    expect(game.state("trinket")).toMatchObject({ controller: P2, isExhausted: true });
    expect(game.p1.gear()).toEqual([]);
  });
});
