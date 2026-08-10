/**
 * Ruling 79a918a7e823741b — Pit Rookie (OGN-136 → ogn-136-298) · 2 · 2 Might "When you play me, buff another friendly unit."
 *   × Gust (OGN-169 → ogn-169-298) · Reaction · 1 "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *
 * Q: Pit Rookie is played and its buff ability targets a unit. Does bouncing the Rookie with Gust stop the buff?
 * A: No. The when-played ability is already a chain item with its target chosen (so the opponent knows the target before they
 *    can Gust); once on the chain its source no longer matters. Gust resolves first (Rookie to hand), then the buff still
 *    resolves onto its (still valid) target.
 * Rules: 376–378 (triggered ability becomes a chain item; target chosen then), 340 (LIFO), 359 (resolves independently of source).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PIT_ROOKIE = "ogn-136-298";
const GUST = "ogn-169-298";

/** P1's turn. P1 controls bf1 with a Veteran (3) there and a Pal (2) in base; Pit Rookie in hand + [2]. P2: Gust + [1]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Veteran" }, "vet")
    .unit(P1, "base", { might: 2, name: "Pal" }, "pal")
    .hand(P1, PIT_ROOKIE, "rookie")
    .hand(P2, GUST, "gust")
    .resources(P2, { energy: 1 });
}

/** Play the Rookie to bf1 and aim its when-played buff at the Veteran; stop with the trigger on the chain and P2 holding priority. */
async function rookieTargetsVet(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("rookie", { answers: ["vet"], to: "bf1" });
  if (game.decision()?.kind === "pick") {
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("vet");
  }
  expect(game.locationOf("rookie")).toBe("bf1");
  // The buff ability is a chain item whose target is already public — before P2 can do anything.
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rookie", controller: P1, targets: ["vet"], triggered: true })]);
  expect(game.state("vet").isBuffed).toBe(false);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 79a918a7e823741b — Gusting Pit Rookie in response does not stop its buff", () => {
  test("P2 Gusts the Rookie (2 Might, at a battlefield) in response; LIFO — Gust resolves first and the Rookie is back in P1's hand while the buff trigger still waits", async () => {
    const game = await rookieTargetsVet();
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "rookie" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["rookie", "gust"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("rookie")).toBe("hand");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rookie", targets: ["vet"], triggered: true })]);
    expect(game.state("vet").isBuffed).toBe(false);
  });

  test("the buff ability then resolves regardless of its source being gone: the Veteran is buffed (3 → 4)", async () => {
    const game = await rookieTargetsVet();
    await game.p2.cast("gust", { targets: "rookie" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("rookie")).toBe("hand");
    expect(game.state("vet")).toMatchObject({ isBuffed: true, might: 4 });
    expect(game.state("pal").isBuffed).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: unanswered, the Rookie stays and the Veteran is buffed just the same", async () => {
    const game = await rookieTargetsVet();
    await game.settle();
    expect(game.locationOf("rookie")).toBe("bf1");
    expect(game.state("vet")).toMatchObject({ isBuffed: true, might: 4 });
  });
});
