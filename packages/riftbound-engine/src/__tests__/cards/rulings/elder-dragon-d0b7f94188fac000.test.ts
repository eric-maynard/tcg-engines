/**
 * Ruling d0b7f94188fac000 — Elder Dragon (UNL-118 → unl-118-219) · Unit · Body · 12 + [body]×4 · 10 Might
 *     "Any amount of your damage is enough to kill enemy units. When you play me, choose up to one enemy unit at each
 *      location. Deal 1 to them."
 *   × Janna, Savior (SFD-053 → sfd-053-221) · Champion Unit · Calm · 3 + [calm] · [Reaction] "When you play me, heal your
 *     units here, then move up to one enemy unit from here to its base."
 *
 * Q: My opponent plays Elder Dragon (choosing my unit). Can I respond with Janna, Savior so my unit survives?
 * A: No. You may play Janna in response and her heal resolves first, but then the Dragon's trigger deals 1 — and with the
 *    Dragon's passive any amount of its controller's damage is lethal, so the (freshly healed) unit dies anyway.
 * Rules: 340 (LIFO — the response resolves first), 428 / lethal damage as modified by the Dragon's passive (363),
 *        427 (Heal removes damage; it does not prevent future damage).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ELDER_DRAGON = "unl-118-219";
const JANNA_SAVIOR = "sfd-053-221";

/**
 * P2's turn. P2: Elder Dragon + exactly 12 + 4 body. P1 holds bf1 with Pal (3 Might, already 2 damage) and has Janna,
 * Savior + 3 + [calm].
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 12, power: { body: 4 } })
    .resources(P1, { energy: 3, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Pal" }, "pal", { damage: 2 })
    .hand(P2, ELDER_DRAGON, "dragon")
    .hand(P1, JANNA_SAVIOR, "janna");
}

/** P2 plays the Dragon and chooses Pal (the only enemy unit anywhere); priority passes to P1 with the trigger pending. */
async function dragonChoosesPal(): Promise<Game> {
  const game = await board().build();
  await game.p2.play("dragon");
  expect(game.zoneOf("dragon")).toBe("base");
  expect(game.p2.resources()).toEqual({ energy: 0, power: { body: 0 } });
  const d = game.decision();
  if (d?.kind === "pick") {
    expect(d.seat).toBe(P2); // the Dragon's controller chooses
    await game.p2.pick("pal");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dragon", targets: ["pal"], triggered: true })]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling d0b7f94188fac000 — Janna's heal in response does not save a unit from Elder Dragon's 1 damage", () => {
  test("P1 does get the window: with the Dragon's trigger on the chain, Janna, Savior ([Reaction]) is playable to bf1 and her trigger goes on top", async () => {
    const game = await dragonChoosesPal();
    expect(game.p1.can("play", "janna")).toBe(true);
    await game.p1.play("janna", { to: "bf1" });
    expect(game.zoneOf("janna")).toBe("battlefield-bf1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["dragon", "janna"]);
    expect(game.state("pal").damage).toBe(2); // nothing resolved yet
  });

  test("Janna resolves first and heals Pal (2 → 0 damage); the Dragon's trigger is still pending", async () => {
    const game = await dragonChoosesPal();
    await game.p1.play("janna", { to: "bf1" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("pal").damage).toBe(0);
    expect(game.zoneOf("pal")).toBe("battlefield-bf1");
    expect(game.chain().map((c) => c.cardId)).toEqual(["dragon"]);
  });

  test("then the Dragon deals 1 to the healthy 3-Might Pal — and 1 is lethal under 'any amount of your damage is enough': Pal dies anyway; Janna and the Dragon remain", async () => {
    const game = await dragonChoosesPal();
    await game.p1.play("janna", { to: "bf1" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("pal")).toBe("trash");
    expect(game.zoneOf("janna")).toBe("battlefield-bf1");
    expect(game.zoneOf("dragon")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("control — the passive is what kills: 1 damage from a player WITHOUT Elder Dragon leaves a 3-Might unit alive", async () => {
    const PING = {
      abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
      cardType: "spell",
      domain: "fury",
      energyCost: 1,
      name: "Ping",
      timing: "action",
    } as const;
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Pal" }, "pal")
      .hand(P2, PING, "ping")
      .build();
    await game.p2.cast("ping", { targets: "pal" });
    await game.settle();
    expect(game.zoneOf("pal")).toBe("battlefield-bf1");
    expect(game.state("pal").damage).toBe(1);
  });
});
