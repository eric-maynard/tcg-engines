/**
 * Ruling 40a1e4a5c457c154 — Elder Dragon (UNL-118 → unl-118-219) · 10 Might · [12][body]×4 · "Any amount of your damage is enough to
 *     kill enemy units. When you play me, choose up to one enemy unit at each location. Deal 1 to them."
 *   × Counter Strike (SFD-194 → sfd-194-221) — named only as the kind of pre-existing prevention that could matter.
 *
 * Q: What happens if Elder Dragon enters while an enemy unit is already damaged?
 * A: That unit dies the moment the Dragon hits the board: his PASSIVE redefines lethal for enemy units carrying any of YOUR
 *    damage, and the state check performed as he enters kills it at once — before anyone can react to his "When you play me"
 *    trigger. Limits: only your damage counts (the opponent's own damage on their unit does not).
 * Rules: 142.4.c (a static may lower the lethal threshold for its controller's damage), 361/522 (passives apply immediately),
 *        320–323 (cleanup / state-based lethal check after any game action), 383 (the play trigger uses the chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ELDER_DRAGON = "unl-118-219";

/** [1] Action "Deal 2 to a unit." — how P1 marks 'your damage' on an enemy earlier in the turn. */
const BOLT = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt (deal 2)",
  timing: "action",
} as const;

/**
 * P1's turn with [13] + body×4 (Bolt 1 + Dragon 12). P2: Scarred (6) at P2's bf1 — will carry 2 of P1's damage; SelfHurt (6)
 * in base carrying 1 damage P2 dealt to it itself; Healthy (6) in base undamaged.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 13, power: { body: 4 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 6, name: "Scarred" }, "scarred")
    .unit(P2, "base", { might: 6, name: "SelfHurt" }, "selfhurt", { damage: 1, lastDamagedBy: P2 })
    .unit(P2, "base", { might: 6, name: "Healthy" }, "healthy")
    .hand(P1, BOLT, "bolt")
    .hand(P1, ELDER_DRAGON, "dragon");
}

/** Bolt the Scarred unit (2 of P1's damage, survives at 6), then play Elder Dragon to base. */
async function scarThenDragon(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("bolt", { targets: "scarred" });
  await game.settle();
  expect(game.state("scarred")).toMatchObject({ damage: 2, zone: "battlefield-bf1" }); // 2 < 6: alive for now
  expect(game.state("selfhurt").damage).toBe(1);
  await game.p1.play("dragon");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  expect(game.zoneOf("dragon")).toBe("base");
  return game;
}

describe("Ruling 40a1e4a5c457c154 — an enemy unit already carrying your damage dies the moment Elder Dragon enters", () => {
  // The instant the Dragon is on the board the state check finds Scarred (2 of P1's damage ≥ "any amount") lethally damaged
  // and kills it — before the play trigger's targets are even chosen and before P2's first priority.
  test("the moment Elder Dragon hits the board the state check kills the pre-damaged Scarred (2 of P1's damage on a 6) — it is already in the trash when the play trigger asks for targets, and is not offered", async () => {
    const game = await scarThenDragon();
    // Whatever is asked first (the trigger's per-location choice), Scarred must already be gone.
    expect(game.zoneOf("scarred")).toBe("trash");
    const d = game.decision();
    if (d?.kind === "pick") {
      expect(d.options.map((o) => o.key)).not.toContain("scarred");
    }
  });

  test("'before reactions can be played to the trigger': at P2's first priority window (Dragon's trigger on the chain, no targets chosen) Scarred is in the trash while SelfHurt and Healthy are untouched", async () => {
    const game = await scarThenDragon();
    // Decline every "up to one enemy unit at each location" choice so the trigger itself deals no damage.
    for (let i = 0; i < 6 && game.decision()?.kind === "pick" && game.decision()?.seat === P1; i++) {
      await game.p1.decline();
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dragon", controller: P1, triggered: true })]);
    if (game.decision()?.seat === P1) {
      await game.p1.passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // P2's reaction window
    expect(game.zoneOf("scarred")).toBe("trash");
    expect(game.zoneOf("selfhurt")).toBe("base"); // limit 1: P2's own damage on its unit does not count
    expect(game.zoneOf("healthy")).toBe("base");
  });

  test("limit 1: the opponent's OWN damage never counts — SelfHurt (1 damage from P2) survives the Dragon's arrival and the whole chain when the trigger chooses nobody", async () => {
    const game = await scarThenDragon();
    for (let i = 0; i < 6 && game.decision()?.kind === "pick" && game.decision()?.seat === P1; i++) {
      await game.p1.decline();
    }
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("selfhurt")).toMatchObject({ damage: 1, zone: "base" });
    expect(game.zoneOf("healthy")).toBe("base");
  });

  test("the passive itself: once the Dragon is out, ONE point of P1's damage kills a 6-Might enemy — the play trigger's 'Deal 1' on Healthy (base) and on Scarred (bf1) kills both", async () => {
    const game = await scarThenDragon();
    // "choose up to one enemy unit at each location": answer each per-location prompt.
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (d?.kind !== "pick" || d.seat !== P1) {
        break;
      }
      const keys = d.options.map((o) => o.key);
      const want = keys.includes("healthy") ? "healthy" : keys.includes("scarred") ? "scarred" : undefined;
      if (want) {
        await game.p1.pick(want);
      } else {
        await game.p1.decline();
      }
    }
    await game.settle();
    expect(game.zoneOf("healthy")).toBe("trash"); // 1 damage, 6 Might — lethal because it is P1's damage
    expect(game.zoneOf("scarred")).toBe("trash");
    expect(game.zoneOf("selfhurt")).toBe("base"); // not chosen; its only damage is P2's own
    expect(game.zoneOf("dragon")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("contrast: WITHOUT the Dragon on the board, the same 1-then-nothing leaves a 2-damage 6-Might enemy alive", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 6, name: "Scarred" }, "scarred")
      .hand(P1, BOLT, "bolt")
      .build();
    await game.p1.cast("bolt", { targets: "scarred" });
    await game.settle();
    expect(game.state("scarred")).toMatchObject({ damage: 2, zone: "battlefield-bf1" });
  });
});
