/**
 * Ruling 052a12012319ea06 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · [2]
 *     "[Hidden] … If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *
 * Q: Played from hidden, must the Hourglass "target" a unit at the battlefield where it was hidden?
 * A: No. The hidden-"here" restriction applies only to cards that TARGET; the Hourglass targets nothing (it is gear with a
 *    replacement effect), so it can save a friendly unit anywhere.
 * Rules: 811.1.d.2 (restriction is about choosing targets), 372 ff. (replacement effects do not target).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";

/**
 * P2's turn. P1 controls bf1 (Sentinel 4 + facedown Hourglass) and bf2 (Pawn 2). P2's Raider (5) will attack bf2 — the
 * OTHER battlefield — where the Pawn would die.
 */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Sentinel" }, "sentinel")
    .facedown(P1, "bf1", ZHONYAS, "zh")
    .unit(P1, "bf2", { might: 2, name: "Pawn" }, "pawn")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider");
}

/** Raider attacks bf2; P2 passes Focus; P1 flips the Hourglass hidden at bf1. */
async function flipDuringBf2Showdown(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf2");
  expect(game.state("pawn").combatRole).toBe("defender");
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("reveal", "zh")).toBe(true);
  // No target is asked for: the reveal option carries no `targets` field at all.
  expect(game.p1.option("reveal", "zh")?.fields.some((f) => f.name === "targets") ?? false).toBe(false);
  await game.p1.reveal("zh");
  expect(game.decision()?.kind).not.toBe("pick");
  for (let i = 0; i < 4 && game.zoneOf("zh") !== "base"; i++) {
    await game.acting().passPriority();
  }
  expect(game.zoneOf("zh")).toBe("base");
  expect(game.p1.gear()).toContain("zh");
  return game;
}

describe("Ruling 052a12012319ea06 — a hidden Zhonya's Hourglass is not bound to 'here': it targets nothing", () => {
  test("flipped at bf1 during a showdown at bf2: it is played with no target prompt and simply becomes gear in P1's base", async () => {
    await flipDuringBf2Showdown();
  });

  test("it then saves the Pawn dying at bf2 — a DIFFERENT battlefield from where it was hidden: Hourglass killed instead, Pawn healed, exhausted and recalled to base; the Raider conquers the emptied bf2", async () => {
    const game = await flipDuringBf2Showdown();
    await game.settle(); // both pass Focus → combat: 5 into the 2-Might Pawn
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.state("pawn")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.zoneOf("raider")).toBe("battlefield-bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast (control): without flipping it, the Pawn just dies at bf2 and the Hourglass stays facedown at bf1", async () => {
    const game = await board().build();
    await game.p2.move("raider", "bf2");
    await game.settle();
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.zoneOf("zh")).toBe("facedown-bf1");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
  });
});
