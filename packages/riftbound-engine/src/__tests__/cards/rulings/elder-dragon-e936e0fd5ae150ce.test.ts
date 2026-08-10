/**
 * Ruling e936e0fd5ae150ce — Elder Dragon (UNL-118 → unl-118-219) · [12]+[body]×4 · 10 Might
 *     "Any amount of your damage is enough to kill enemy units. When you play me, choose up to one enemy unit at each
 *      location. Deal 1 to them."
 *   × Janna, Savior (SFD-053 → sfd-053-221) · [3]+[calm] · [Reaction] "When you play me, heal your units here, then move up
 *     to one enemy unit from here to its base."
 *
 * Q: Does reacting to Elder Dragon with Janna save my unit?
 * A: No. You may play Janna in response to the Dragon's play trigger; she resolves first and heals, but then the trigger
 *    deals 1 — and under the Dragon's passive any damage from its controller is lethal, so the healed unit dies anyway.
 *    Healing removes existing damage; it does not prevent the later damage.
 * Rules: 340 (LIFO), 427 (heal), 428 + the passive's modified lethal threshold (363 statics).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ELDER_DRAGON = "unl-118-219";
const JANNA_SAVIOR = "sfd-053-221";

/** P2's turn with exactly [12]+[body]×4 and the Dragon. P1 holds bf1 with Veteran (4 Might, 1 damage marked) and has Janna + [3]+[calm]. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 12, power: { body: 4 } })
    .resources(P1, { energy: 3, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Veteran" }, "vet", { damage: 1 })
    .hand(P2, ELDER_DRAGON, "dragon")
    .hand(P1, JANNA_SAVIOR, "janna");
}

/** 1. P2 plays Elder Dragon; its trigger targets Veteran and P2 passes → 2. P1's reaction window. */
async function dragonTargetsVeteran(): Promise<Game> {
  const game = await board().build();
  await game.p2.play("dragon");
  expect(game.zoneOf("dragon")).toBe("base");
  const d = game.decision();
  if (d?.kind === "pick") {
    expect(d).toMatchObject({ seat: P2, timing: "FIN" });
    await game.p2.pick("vet");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dragon", controller: P2, targets: ["vet"], triggered: true })]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling e936e0fd5ae150ce — Janna's heal in response cannot save a unit from Elder Dragon's play trigger", () => {
  test("2. P1 has the window and Janna, Savior is a legal Reaction play to bf1; her play trigger lands on top of the Dragon's", async () => {
    const game = await dragonTargetsVeteran();
    expect(game.p1.can("play", "janna")).toBe(true);
    await game.p1.play("janna", { to: "bf1" });
    expect(game.zoneOf("janna")).toBe("battlefield-bf1");
    expect(game.chain().map((c) => c.cardId)).toEqual(["dragon", "janna"]);
    expect(game.state("vet").damage).toBe(1);
  });

  test("3a. Janna resolves first: Veteran is healed (1 → 0) and still on the battlefield; the Dragon's trigger still waits", async () => {
    const game = await dragonTargetsVeteran();
    await game.p1.play("janna", { to: "bf1" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("vet").damage).toBe(0);
    expect(game.zoneOf("vet")).toBe("battlefield-bf1");
    expect(game.chain().map((c) => c.cardId)).toEqual(["dragon"]);
  });

  test("3b–4. the Dragon's trigger then deals 1 to the full-health 4-Might Veteran — lethal under the passive: Veteran dies; Janna survives (never damaged)", async () => {
    const game = await dragonTargetsVeteran();
    await game.p1.play("janna", { to: "bf1" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("vet")).toBe("trash");
    expect(game.zoneOf("janna")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // Janna still holds it
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("control: without the Dragon's passive, 1 damage to a healed 4-Might unit is not lethal — it is the passive, not the heal timing, that decides", async () => {
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
      .unit(P1, "bf1", { might: 4, name: "Veteran" }, "vet")
      .hand(P2, PING, "ping")
      .build();
    await game.p2.cast("ping", { targets: "vet" });
    await game.settle();
    expect(game.zoneOf("vet")).toBe("battlefield-bf1");
    expect(game.state("vet").damage).toBe(1);
  });
});
