/**
 * Ruling 2fb4e261557cc436 — Yuumi, Magical Cat (UNL-056 → unl-056-219) · Unit · Calm · 3 · 1 Might
 *   "When I attack or defend, give one of your other units here +3 [Might] and [Tank] this turn."
 *   × Ezreal, Dashing (sfd-082-221) · 3 Might "When I attack or defend, deal damage equal to my Might to an enemy unit here.
 *     I don't deal combat damage. …"
 *
 * Q: I attack a battlefield with Ezreal; my opponent has Yuumi there. Whose attack/defend trigger resolves first?
 * A: The attacker puts their triggers on the chain first, the defender last; LIFO ⇒ the DEFENDER's (Yuumi's) trigger
 *    resolves first and the attacker's (Ezreal's) resolves last.
 * Rules: 383.4 / 442.1.b.1 (attacker's triggers added before defender's), 338 (LIFO resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const YUUMI = "unl-056-219";
const EZREAL_DASHING = "sfd-082-221";

/** P1's turn. P2 holds bf1 with Yuumi (1) and Pal (2). P1's Ezreal (3) attacks from base. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", YUUMI, "yuumi")
    .unit(P2, "bf1", { might: 2, name: "Pal" }, "pal")
    .unit(P1, "base", EZREAL_DASHING, "ez");
}

/** Ezreal attacks; answer the finalization prompts: Ezreal aims at Pal, Yuumi's only "other unit here" is Pal. */
async function ezrealAttacks(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("ez", "bf1");
  // Finalization, oldest item first: P1 names Ezreal's target.
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["pal", "yuumi"]);
      await game.p1.pick("pal");
    } else if (d?.kind === "pick" && d.seat === P2) {
      await game.p2.pick("pal");
    } else if (d?.kind === "yes-no") {
      await game.seat(d.seat).yes();
    } else {
      break;
    }
  }
  return game;
}

describe("Ruling 2fb4e261557cc436 — attacker's trigger goes on the chain first, so the defender's (Yuumi's) resolves first", () => {
  test("both triggers are on ONE chain: Ezreal's (P1, attacker) at the bottom, Yuumi's (P2, defender) on top", async () => {
    const game = await ezrealAttacks();
    const items = game.chain();
    expect(items.map((c) => c.cardId)).toEqual(["ez", "yuumi"]);
    expect(items[0]).toMatchObject({ cardId: "ez", controller: P1, targets: ["pal"], triggered: true });
    expect(items[1]).toMatchObject({ cardId: "yuumi", controller: P2, triggered: true });
    expect(game.state("pal")).toMatchObject({ damage: 0, might: 2 });
  });

  test("LIFO: after both pass once, Yuumi's trigger has resolved (Pal is 5 Might with Tank) while Ezreal's is still waiting on the chain", async () => {
    const game = await ezrealAttacks();
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.chain().map((c) => c.cardId)).toEqual(["ez"]);
    expect(game.state("pal").might).toBe(5);
    expect(game.state("pal").grantedKeywords).toContainEqual(expect.objectContaining({ keyword: "Tank", duration: "turn" }));
    expect(game.state("pal").damage).toBe(0);
  });

  test("then Ezreal's resolves last: 3 damage to Pal — who survives only BECAUSE Yuumi's +3 landed first (2+3 = 5 > 3)", async () => {
    const game = await ezrealAttacks();
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("pal")).toMatchObject({ damage: 3, might: 5, zone: "battlefield-bf1" });
    expect(game.violations()).toEqual([]);
  });
});
