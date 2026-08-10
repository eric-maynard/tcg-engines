/**
 * Corrupted Dragon — ven-091-166 · Unit · Body · 10 energy · 2 power · 10 might
 *
 *   If your score is not within 3 points of the Victory Score, I enter ready.
 *   When I attack, you may move any number of enemy units here each with
 *   5 [Might] or less to their base.
 *
 * rule-id: ven-091-166 — the conditional enter-ready static is evaluated at
 * play time (rule 143.4 override only when the score condition holds).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ven-091-166";

describe("Corrupted Dragon (ven-091-166)", () => {
  test("attack trigger: may move chosen enemy units here with 5 Might or less to their base", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3 }, "small")
      .unit(P2, "bf1", { might: 6 }, "big")
      .unit(P1, "base", CARD, "dragon")
      .autoProcedures(false)
      .build();

    await game.p1.move("dragon", "bf1");
    await game.p1.yes(); // rule 402 (finalization): the opt-in is asked before priority …
    const d = game.decision();
    expect(d?.timing).toBe("FIN"); // … and so is the "any number of enemy units" set (402.2 / 355.13)
    expect(d?.kind).toBe("pick");
    const keys = (d as { options?: { key: string }[] } | undefined)?.options?.map((o) => o.key) ?? [];
    expect(keys).toContain("small");
    expect(keys).not.toContain("big");
    await game.p1.pick("small");
    await game.acting().passPriority();
    await game.acting().passPriority();

    expect(game.zoneOf("small")).toBe("base");
    expect(game.locationOf("big")).toBe("bf1");
    expect(game.locationOf("dragon")).toBe("bf1");
  });

  test("attack trigger: declining every pick moves nothing (not the Dragon itself)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3 }, "small")
      .unit(P1, "base", CARD, "dragon")
      .autoProcedures(false)
      .build();

    await game.p1.move("dragon", "bf1");
    await game.p1.yes(); // rule 402 (finalization)
    await game.p1.decline();
    await game.acting().passPriority();
    await game.acting().passPriority();

    expect(game.locationOf("small")).toBe("bf1");
    expect(game.locationOf("dragon")).toBe("bf1");
  });

  test("enters ready when your score is more than 3 below the Victory Score", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 4)
      .resources(P1, { energy: 10, power: { body: 2 } })
      .hand(P1, CARD, "dragon")
      .build();
    await game.p1.play("dragon", { to: "base" });
    await game.settle();
    expect(game.zoneOf("dragon")).toBe("base");
    expect(game.state("dragon").isExhausted).toBe(false);
  });

  test("enters exhausted when your score is within 3 points of the Victory Score", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 5)
      .resources(P1, { energy: 10, power: { body: 2 } })
      .hand(P1, CARD, "dragon")
      .build();
    await game.p1.play("dragon", { to: "base" });
    await game.settle();
    expect(game.zoneOf("dragon")).toBe("base");
    expect(game.state("dragon").isExhausted).toBe(true);
  });
});
