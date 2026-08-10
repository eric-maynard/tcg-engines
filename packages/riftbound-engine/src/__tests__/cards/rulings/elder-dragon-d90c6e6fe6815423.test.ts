/**
 * Ruling d90c6e6fe6815423 — Elder Dragon (UNL-118 → unl-118-219) · Unit · Body · [12]+[body]×4 · 10 Might
 *     "Any amount of your damage is enough to kill enemy units. When you play me, choose up to one enemy unit at each location.
 *      Deal 1 to them."
 *   × Unyielding Spirit (OGN-145 → ogn-145-298) · Reaction · Body · 1+[body] · "Prevent all spell and ability damage this turn."
 *
 * Q: Does Elder Dragon's "any amount of your damage kills" still kill if the damage is prevented by Unyielding Spirit?
 * A: No. Fully prevented damage is not considered dealt at all, so there is no damage for Elder Dragon's passive to make lethal —
 *    the enemy unit survives untouched.
 * Rules: 437.4 (fully prevented damage was never dealt), 142.4.c (Elder Dragon lowers the lethal threshold of damage actually dealt).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ELDER_DRAGON = "unl-118-219";
const UNYIELDING_SPIRIT = "ogn-145-298";
/** A 1-cost spell of P1's: "Deal 1 to a unit." — 1 damage that Elder Dragon would make lethal. */
const PING = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "body",
  energyCost: 1,
  name: "Ping",
  timing: "action",
} as const;

/** P1's turn: Elder Dragon already on P1's board, Ping in hand + [1]. P2: a 6-Might Brute at P2's bf1, Unyielding Spirit + exactly 1+[body]. */
function boardWithDragonOut() {
  return scenario()
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 1, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", ELDER_DRAGON, "elder")
    .unit(P2, "bf1", { might: 6, name: "Brute" }, "brute")
    .hand(P1, PING, "ping")
    .hand(P2, UNYIELDING_SPIRIT, "spirit");
}

/** P2 answers the top chain item with Unyielding Spirit and everything resolves. */
async function spiritInResponse(game: Game): Promise<void> {
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "spirit")).toBe(true);
  await game.p2.cast("spirit");
  expect(game.p2.resources()).toEqual({ energy: 0, power: { body: 0 } });
  await game.settle();
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("spirit")).toBe("trash");
}

describe("Ruling d90c6e6fe6815423 — prevented damage is never dealt, so Elder Dragon's 'any amount kills' has nothing to work with", () => {
  test("premise: with Elder Dragon out, P1's 1-damage Ping on the 6-Might Brute is lethal (any amount of P1's damage kills)", async () => {
    const game = await boardWithDragonOut().build();
    await game.p1.cast("ping", { targets: "brute" });
    await game.settle();
    expect(game.zoneOf("brute")).toBe("trash");
  });

  test("Unyielding Spirit in response: the 1 spell damage is prevented → NOT dealt → the Brute takes 0 and does not die despite Elder Dragon", async () => {
    const game = await boardWithDragonOut().build();
    await game.p1.cast("ping", { targets: "brute" });
    await spiritInResponse(game);
    expect(game.zoneOf("ping")).toBe("trash"); // it resolved — its damage was simply prevented
    expect(game.zoneOf("brute")).toBe("battlefield-bf1");
    expect(game.state("brute")).toMatchObject({ damage: 0, might: 6 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("same for ABILITY damage — Elder Dragon's own play trigger (deal 1 to the Brute) answered by Unyielding Spirit: prevented, Brute unharmed and alive", async () => {
    const game = await scenario()
      .resources(P1, { energy: 12, power: { body: 4 } })
      .resources(P2, { energy: 1, power: { body: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 6, name: "Brute" }, "brute")
      .hand(P1, ELDER_DRAGON, "elder")
      .hand(P2, UNYIELDING_SPIRIT, "spirit")
      .build();
    await game.p1.play("elder");
    expect(game.zoneOf("elder")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    // The trigger's "up to one enemy unit at each location" choice: take the Brute when asked.
    for (let i = 0; i < 4 && game.decision()?.kind === "pick" && game.decision()?.seat === P1; i++) {
      await game.p1.pick("brute");
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "elder", controller: P1, triggered: true })]);
    await game.p1.passPriority();
    await game.p2.cast("spirit");
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick" && d.seat === P1) {
        await game.p1.pick("brute");
      } else if (d.kind === "action") {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("brute")).toBe("battlefield-bf1");
    expect(game.state("brute").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("control: the play trigger WITHOUT Unyielding Spirit — 1 damage from Elder Dragon's controller kills the 6-Might Brute", async () => {
    const game = await scenario()
      .resources(P1, { energy: 12, power: { body: 4 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 6, name: "Brute" }, "brute")
      .hand(P1, ELDER_DRAGON, "elder")
      .build();
    await game.p1.play("elder");
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick" && d.seat === P1) {
        await game.p1.pick("brute");
      } else if (d.kind === "action") {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(game.zoneOf("brute")).toBe("trash");
  });
});
