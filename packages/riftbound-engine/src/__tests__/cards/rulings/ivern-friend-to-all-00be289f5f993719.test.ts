/**
 * Ruling 00be289f5f993719 — Ivern, Friend to All (UNL-177 → unl-177-219) · Unit · Order · 6 · 6 Might
 *   "As you play me, choose Bird, Cat, Dog, or Poro. I gain that tag. When I conquer or hold, score 1 point
 *    if your units have all of the following tags among them — Bird, Cat, Dog, and Poro."
 *   × Bird token (unl-t02).
 *
 * Q: Must the Bird/Cat/Dog/Poro units be at Ivern's battlefield, or anywhere in play (e.g. Bird, Poro, Cat
 *    with Ivern at the battlefield and the Dog in base)?
 * A: Anywhere in play under your control — the ability says "your units", not "here". A Dog in base counts
 *    exactly like one next to Ivern.
 * Rules: 383.4.d (Hold effects), 467 (scoring), 740.1.a ("your"/friendly = controlled by you).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const IVERN = "unl-177-219";
const BIRD_TOKEN = "unl-t02";

/**
 * P2 is finishing turn 2; P1 controls bf1 with Ivern + Bird token + Cat + Poro there. The Dog (if any) sits
 * in P1's base. Advancing the turn makes P1 hold bf1 in their Beginning Phase.
 */
function board(opts: { dogAt: "base" | "bf1" | "none" }) {
  const b = scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", IVERN, "ivern")
    .unit(P1, "bf1", BIRD_TOKEN, "bird")
    .unit(P1, "bf1", { might: 2, name: "Test Cat", tags: ["Cat"] }, "cat")
    .unit(P1, "bf1", { might: 1, name: "Test Poro", tags: ["Poro"] }, "poro");
  if (opts.dogAt === "none") {
    return b;
  }
  return b.unit(P1, opts.dogAt, { might: 3, name: "Test Dog", tags: ["Dog"] }, "dog");
}

describe("Ruling 00be289f5f993719 — Ivern's tag check counts your units anywhere in play, not just at his battlefield", () => {
  test("ruling 00be289f5f993719 — Bird/Cat/Poro with Ivern at bf1 and the Dog in BASE: holding bf1 scores 1 (hold) + 1 (Ivern) = 2", async () => {
    const game = await board({ dogAt: "base" }).build();
    expect(game.p1.points()).toBe(0);
    expect(game.locationOf("dog")).toBe("base");
    expect(game.locationOf("ivern")).toBe("bf1");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(2);
    expect(game.p2.points()).toBe(0);
  });

  test("same result when the Dog is at Ivern's battlefield — location is irrelevant either way (2 points)", async () => {
    const game = await board({ dogAt: "bf1" }).build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(2);
  });

  test("contrast — no Dog anywhere: the condition fails, only the hold point is scored (1 point)", async () => {
    const game = await board({ dogAt: "none" }).build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("contrast — an ENEMY Dog does not count ('your units'): still only 1 point", async () => {
    const game = await board({ dogAt: "none" }).unit(P2, "base", { might: 3, name: "Enemy Dog", tags: ["Dog"] }, "enemyDog").build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});
