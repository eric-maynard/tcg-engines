/**
 * Ruling 6c4cd0fa8f31ef82 — Flash (OGS-011 → ogs-011-024) · Reaction [2] "Move up to 2 friendly units to base."
 *   × Herald of the Arcane (Viktor legend, OGN-265 → ogn-265-298) "[1], [Exhaust]: Play a 1 [Might] Recruit unit token."
 *
 * Q: Can the opponent play the Reaction Flash in response to my Viktor legend's activated ability?
 * A: Yes. The activated ability goes on the chain (Closed state); the opponent gets priority and may play a Reaction such as
 *    Flash before it resolves. Then the ability resolves and makes the Recruit token (which itself opens no further window).
 * Rules: 381 (activated abilities use the chain), 330–337 (Closed state, priority, Reactions), 340 (token enters immediately).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HERALD = "ogn-265-298";
const FLASH = "ogs-011-024";

/** P1's turn with the Viktor legend (ready) and [1]. P2 has a Rover and an Anchor at P2's bf1, Flash in hand + [2]. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 2 })
    .legend(P1, HERALD, "viktor")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Rover" }, "rover")
    .unit(P2, "bf1", { might: 1, name: "Anchor" }, "anchor");
}

async function viktorActivated(): Promise<Game> {
  const game = await board().hand(P2, FLASH, "flash").build();
  expect(game.p1.can("activate", "viktor")).toBe(true);
  await game.p1.activate("viktor");
  expect(game.p1.energy()).toBe(0);
  expect(game.state("viktor").isExhausted).toBe(true);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "viktor", controller: P1, type: "ability" })]);
  return game;
}

const recruits = (game: Game) => game.p1.units("base").filter((u) => game.state(u).name === "Recruit");

describe("Ruling 6c4cd0fa8f31ef82 — Flash is playable in response to Viktor's activated legend ability", () => {
  test("activating the legend puts the ability on the chain (no token yet); after P1 passes, P2 holds priority and Flash is legal", async () => {
    const game = await viktorActivated();
    expect(recruits(game)).toEqual([]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "flash")).toBe(true);
  });

  test("P2 Flashes the Rover home in that window: Flash stacks above the ability and resolves first; THEN the ability makes the Recruit token and the chain is empty", async () => {
    const game = await viktorActivated();
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: ["rover"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["viktor", "flash"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Flash resolves
    expect(game.locationOf("rover")).toBe("base");
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["viktor"]);
    expect(recruits(game)).toEqual([]);
    await game.settle(); // Viktor's ability resolves
    expect(game.chain()).toEqual([]);
    const made = recruits(game);
    expect(made).toHaveLength(1);
    expect(game.state(made[0]!)).toMatchObject({ isToken: true, might: 1 });
    // The token's arrival opened no new window: straight back to P1's open main phase.
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
