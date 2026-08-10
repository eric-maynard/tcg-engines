/**
 * Ruling 4fcd289622050f79 — Herald of Spring (UNL-034 → unl-034-219) · Unit · Calm · [4][calm] · 4 Might
 *   "[Hunt] (When I conquer or hold, gain 1 XP.) When you play me, gain 2 XP."
 *   × Reckoner's Arena (OGN-286 → ogn-286-298) · Battlefield · "When you hold here, activate the conquer effects
 *     of units here."
 *
 * Q: If Herald of Spring holds Reckoner's Arena, does it gain the Hunt XP twice that turn?
 * A: Yes. Holding fires Hunt's own hold trigger (1 XP); the Arena's hold trigger then activates the conquer
 *    effects of units there, firing Hunt's conquer half as a separate chain item (1 XP) — 2 XP total. (The "when
 *    you play me, gain 2 XP" is unrelated to holding.)
 * Rules: 442 (Hold), Hunt keyword (conquer-or-hold), 383 (each trigger is its own chain item, LIFO).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HERALD_OF_SPRING = "unl-034-219";
const RECKONERS_ARENA = "ogn-286-298";

/** P2 is ending turn 2; P1 controls the (live, non-inert) Reckoner's Arena with Herald of Spring on it. 0 XP. */
function arenaBoard() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("arena", { controller: P1, def: RECKONERS_ARENA, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "arena", HERALD_OF_SPRING, "herald");
}

describe("Ruling 4fcd289622050f79 — Hunt at Reckoner's Arena: hold XP + Arena-activated conquer XP = 2 XP", () => {
  test("baseline at an ordinary battlefield: holding gives Herald exactly 1 Hunt XP (and P1 the hold point)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", HERALD_OF_SPRING, "herald")
      .build();
    expect(game.p1.xp()).toBe(0);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(1);
  });

  test("at Reckoner's Arena the hold produces TWO simultaneous P1 triggers — Herald's Hunt (hold) and the Arena's — and P1 is offered their order", async () => {
    const game = await arenaBoard().build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.p1.points()).toBe(1); // the hold point itself
    const d = game.decision();
    expect(d).toMatchObject({ kind: "order", seat: P1 });
    const items = d?.kind === "order" ? d.items.map((i) => i.card).toSorted() : [];
    expect(items).toEqual(["arena", "herald"]);
    expect(game.chain().map((c) => c.cardId).toSorted()).toEqual(["arena", "herald"]);
    expect(game.p1.xp()).toBe(0); // nothing resolved yet
  });

  test("resolution: the Arena trigger activates Herald's CONQUER effect as a second, separate Hunt item; both Hunt items resolve for 1 XP each → P1 ends the Beginning Phase with 2 XP", async () => {
    const game = await arenaBoard().build();
    await game.p2.endTurn();
    await game.acceptTriggerOrder(); // keep the listed order: Herald (bottom), Arena (top → resolves first)
    // Arena's trigger resolves → a second Herald (conquer-half Hunt) item appears above the pending hold-half one.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain().map((c) => c.cardId)).toEqual(["herald", "herald"]);
    expect(game.p1.xp()).toBe(0);
    await game.p1.passPriority();
    await game.p2.passPriority(); // conquer-half Hunt: +1 XP
    expect(game.p1.xp()).toBe(1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["herald"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // hold-half Hunt: +1 XP
    expect(game.chain()).toEqual([]);
    expect(game.p1.xp()).toBe(2);
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1); // activating conquer EFFECTS is not conquering: no extra point
    expect(game.violations()).toEqual([]);
  });

  test("Herald's 'When you play me, gain 2 XP' is a separate play trigger and has nothing to do with holding: playing Herald gives 2 XP on the spot", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { calm: 1 } })
      .battlefield("bf2", { controller: P2 })
      .hand(P1, HERALD_OF_SPRING, "herald")
      .build();
    await game.p1.play("herald");
    await game.settle();
    expect(game.zoneOf("herald")).toBe("base");
    expect(game.p1.xp()).toBe(2);
    expect(game.p1.points()).toBe(0);
  });
});
