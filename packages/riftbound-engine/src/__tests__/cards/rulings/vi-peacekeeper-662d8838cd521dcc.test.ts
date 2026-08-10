/**
 * Ruling 662d8838cd521dcc — Vi, Peacekeeper (UNL-176 → unl-176-219) · Unit · Order · [5][order] · 5 Might · [Ambush]
 *   "When I attack, [Stun] an enemy unit here."
 *   × Star-Crossed (UNL-128 → unl-128-219) · Reaction · Chaos · [3][chaos]
 *     "Return a friendly unit and an enemy unit to their owners' hands."
 *
 * Q: Vi attacks; in response to her "When I attack, stun an enemy unit here" the opponent plays Star-Crossed
 *    returning Vi. Does the stun still resolve?
 * A: No. Star-Crossed resolves first (LIFO) and returns Vi to hand; when Vi's ability resolves, "here" needs its
 *    source at the battlefield — Vi is gone, so the ability does nothing.
 * Rules: 340 (LIFO), 359.3.e.12 / 359.3.f.4 (location-relative "here" fails when the source left).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VI = "unl-176-219";
const STAR_CROSSED = "unl-128-219";

/** P1's turn. P2 holds bf1 with Grunt (2) and Pal (2); P2: Star-Crossed + [3][chaos]. Vi ready in P1's base. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Grunt" }, "grunt")
    .unit(P2, "bf1", { might: 2, name: "Pal" }, "pal")
    .hand(P2, STAR_CROSSED, "starx")
    .resources(P2, { energy: 3, power: { chaos: 1 } })
    .unit(P1, "base", VI, "vi");
}

/** Vi attacks bf1 and P1 aims her stun at Grunt; stops at the first priority window with P2 to act. */
async function viAttacksTargetingGrunt(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("vi", "bf1");
  for (let i = 0; i < 6; i++) {
    const d: Decision | null = game.decision();
    if (!d || d.kind === "action") {
      break;
    }
    if (d.kind === "pick" && d.seat === P1) {
      expect(d.source?.cardId).toBe("vi");
      await game.p1.pick("grunt");
    } else if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  expect(game.state("vi").combatRole).toBe("attacker");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vi", controller: P1, targets: ["grunt"], triggered: true })]);
  if (game.actingSeat() === P1) {
    await game.p1.passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 662d8838cd521dcc — Star-Crossed bounces Vi in response: her 'stun an enemy unit here' no longer resolves", () => {
  test("P2 may respond to Vi's attack trigger with Star-Crossed choosing [Pal (theirs), Vi (enemy)]; chain = [Vi trigger, Star-Crossed]", async () => {
    const game = await viAttacksTargetingGrunt();
    expect(game.p2.can("cast", "starx")).toBe(true);
    await game.p2.cast("starx", { targets: ["pal", "vi"] });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["vi", "starx"]);
    expect(game.state("grunt").isStunned).toBe(false);
  });

  test("LIFO: Star-Crossed resolves first — Vi returns to P1's hand, Pal to P2's hand — with Vi's trigger still waiting", async () => {
    const game = await viAttacksTargetingGrunt();
    await game.p2.cast("starx", { targets: ["pal", "vi"] });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("vi")).toBe("hand");
    expect(game.p1.hand()).toContain("vi");
    expect(game.zoneOf("pal")).toBe("hand");
    expect(game.p2.hand()).toContain("pal");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vi", triggered: true })]);
    expect(game.state("grunt").isStunned).toBe(false);
  });

  test("Vi's ability then resolves without its source 'here': Grunt is NOT stunned; the attack is over and bf1 stays P2's", async () => {
    const game = await viAttacksTargetingGrunt();
    await game.p2.cast("starx", { targets: ["pal", "vi"] });
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("grunt").isStunned).toBe(false);
    await game.settle();
    expect(game.state("grunt").isStunned).toBe(false);
    expect(game.zoneOf("grunt")).toBe("battlefield-bf1");
    expect(game.zoneOf("vi")).toBe("hand");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — no response: the trigger resolves and Grunt IS stunned", async () => {
    const game = await viAttacksTargetingGrunt();
    await game.p2.passPriority();
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.state("grunt").isStunned).toBe(true);
  });
});
