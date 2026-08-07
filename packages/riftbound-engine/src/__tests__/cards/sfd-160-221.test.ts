/**
 * Zaun Punk — sfd-160-221 · Unit · Order · 3 energy · 3 Might
 *
 *   You may kill a friendly gear as an additional cost to play me.
 *   When you play me, if you paid the additional cost, kill a gear.
 *
 * Rules: 356.2 (an optional additional cost is chosen and paid as the card is played),
 * 428.1 (the kill is a real kill — the gear goes to trash).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "sfd-160-221";

function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .hand(P1, CARD, "punk")
    .gear(P1, { name: "My Gear" }, "mine")
    .gear(P2, { name: "Their Gear" }, "theirs");
}

describe("Zaun Punk (sfd-160-221)", () => {
  test("the optional additional cost offers each friendly gear as a sacrifice", async () => {
    const game = await board().build();
    const offered = game.p1
      .option("play", "punk")
      ?.fields.find((f) => f.arg === "sacrifice")?.options;
    // optional (rule 356.2) — both the unpaid variant and the friendly gear are offered
    expect(offered).toContain("mine");
    expect(offered).not.toContain("theirs");
  });

  test("paying the cost kills the friendly gear and the payoff kills a gear", async () => {
    const game = await board().build();
    await game.p1.play("punk", { sacrifice: "mine" });
    await game.settle();
    expect(game.zoneOf("punk")).toBe("base");
    expect(game.zoneOf("mine")).toBe("trash");
    // the payoff trigger fires (rule 356.2 — the cost was paid) and kills a gear
    expect(game.zoneOf("theirs")).toBe("trash");
  });

  test("the cost is optional — Zaun Punk can be played without paying, and the payoff does not fire", async () => {
    const game = await board().build();
    await game.p1.play("punk");
    await game.settle();
    expect(game.zoneOf("punk")).toBe("base");
    expect(game.zoneOf("mine")).toBe("base");
    expect(game.zoneOf("theirs")).toBe("base");
  });
});
