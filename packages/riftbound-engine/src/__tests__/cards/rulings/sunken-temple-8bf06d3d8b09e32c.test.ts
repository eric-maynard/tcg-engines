/**
 * Ruling 8bf06d3d8b09e32c — Sunken Temple (sfd-218-221, Battlefield)
 *   "When you conquer here with one or more [Mighty] units, you may pay [1] to draw 1. (Mighty = 5+ Might.)"
 *   × Laurent Duelist (sfd-156-221) · Unit · 3 Might · "[Assault 2] (+2 [Might] while I'm an attacker.)"
 *
 * Q: Does Sunken Temple trigger if I conquer with a unit that is only Mighty because of Assault?
 * A: Yes. Assault is "+X Might while I am an attacker" (807.1.c) and lasts as long as the attacker
 *    designation does (807.1.d.1). Control is established and the conquer happens (466.5.d) — and its
 *    triggers resolve (466.6) — BEFORE designations are removed at "combat ends" (466.7.a), so the unit is
 *    still an attacker, still 5 Might, still Mighty when the conquer trigger is evaluated.
 *
 * Setup: P2 holds Sunken Temple with a 4-Might defender; P1 (1 energy) attacks with Laurent Duelist alone.
 * 3 + Assault 2 = 5 beats 4 only because Assault is live, so the win itself shows the designation timing.
 */
import { describe, expect, test } from "bun:test";
import type { Seat } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SUNKEN_TEMPLE = "sfd-218-221";
const LAURENT_DUELIST = "sfd-156-221";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1's turn with exactly [1]. Sunken Temple is controlled by P2 (battlefield card owned by `owner`) and
 * defended by a vanilla unit of `defenderMight`. P1's lone attacker waits in base.
 */
function board(opts: { attacker: string | { might: number; name: string }; defenderMight: number; owner: Seat }) {
  return scenario()
    .resources(P1, { energy: 1 })
    .battlefield("temple", { controller: P2, def: SUNKEN_TEMPLE, inert: false, owner: opts.owner })
    .unit(P1, "base", opts.attacker, "attacker")
    .unit(P2, "temple", { might: opts.defenderMight, name: "Temple Guard" }, "guard");
}

/** Attack the temple and pass focus/priority until a real prompt or the open main phase. */
async function attackAndConquer(game: Game): Promise<void> {
  await game.p1.move("attacker", "temple");
  expect(game.state("attacker").combatRole).toBe("attacker");
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || (d.context !== "chain" && d.context !== "showdown") || !d.passKey) {
      return;
    }
    await game.seat(d.seat).pass();
  }
}

describe("Ruling 8bf06d3d8b09e32c — Sunken Temple counts a conqueror that is Mighty only through Assault", () => {
  test("Laurent Duelist (3 + Assault 2) beats a 4-Might defender and conquers; Sunken Temple offers P1 'pay [1] to draw 1'; paying draws a card (P1's own temple card retaken from P2)", async () => {
    const game = await board({ attacker: LAURENT_DUELIST, defenderMight: 4, owner: P1 }).build();
    const hand = game.p1.hand().length;
    await attackAndConquer(game);
    // Assault was live during combat: 5 vs 4 ⇒ the guard died, the Duelist survived (healed) and P1 conquered.
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("attacker")).toBe("battlefield-temple");
    expect(game.gameState.battlefields.temple?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    // The conquer trigger saw a Mighty conqueror ⇒ P1 decides whether to pay.
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.hand()).toHaveLength(hand + 1);
    // Back in the open state the designation is gone and so is Assault's bonus: plain 3 Might again.
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("attacker").combatRole).not.toBe("attacker");
    expect(game.state("attacker").might).toBe(3);
  });

  test.failing("BUG: ruling 8bf06d3d8b09e32c — same conquer at the OPPONENT's Sunken Temple card: 'you' is whoever conquers here, so P1 is still offered pay-[1]-draw-1; engine only fires the trigger for the battlefield card's owner", async () => {
    // Expected: identical to the previous test. Actual: no trigger at all when P2 owns the battlefield card.
    const game = await board({ attacker: LAURENT_DUELIST, defenderMight: 4, owner: P2 }).build();
    const hand = game.p1.hand().length;
    await attackAndConquer(game);
    expect(game.gameState.battlefields.temple?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.hand()).toHaveLength(hand + 1);
  });

  test.failing("BUG: ruling 8bf06d3d8b09e32c — contrast: a conqueror that is NOT Mighty (plain 3 Might, no Assault) conquers but gets no Sunken Temple offer; engine offers the pay/draw regardless of Might", async () => {
    // Expected: conquer scores the point and play returns straight to P1's main phase — no yes/no, hand and
    // energy unchanged. Actual: the "one or more Mighty units" qualifier is not checked; P1 is offered the draw.
    const game = await board({ attacker: { might: 3, name: "Plain Squire" }, defenderMight: 1, owner: P1 }).build();
    const hand = game.p1.hand().length;
    await attackAndConquer(game);
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.temple?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand);
  });
});
