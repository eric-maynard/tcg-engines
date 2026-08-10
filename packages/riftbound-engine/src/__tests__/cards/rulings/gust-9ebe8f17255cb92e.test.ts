/**
 * Ruling 9ebe8f17255cb92e — Gust (OGN-169 → ogn-169-298) · Reaction · [1][chaos] · "Return a unit at a battlefield with
 *     3 [Might] or less to its owner's hand."
 *   × Harnessed Dragon (OGN-234 → ogn-234-298) · 6 Might · "When you play me, kill an enemy unit."
 *   (Shakedown ogn-033-298, Reaction "Choose an enemy unit. Deal 6 to it unless its controller has you draw 2." is the
 *    reaction used to kill the Dragon in response.)
 *
 * Q: Can you Gust (or any Reaction) immediately after a unit is played, or in response to a unit moving?
 * A: Not to the play or the move ITSELF — those open no chain. Only if the play/move triggers an ability do you get
 *    a window, and then you are reacting to that ability. Even if you kill the unit in response (Harnessed Dragon),
 *    its triggered ability still resolves.
 * Rules: 339–340 (playing a permanent / a Standard Move is not a chain item), 383.4.b (play triggers go on the chain
 *        and open priority), 327/332 (LIFO), 383.6 (a triggered ability resolves independently of its source).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";

type Pick = Extract<Decision, { kind: "pick" }>;
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const HARNESSED_DRAGON = "ogn-234-298";
const SHAKEDOWN = "ogn-033-298";

/**
 * P1's turn: [8][order][order] for the Dragon; a 0-cost vanilla in hand; Walker (2) in base; Holder (2) at P1's bf2.
 * P2: Scout (3) at P2's bf1; Gust + Shakedown in hand with [3][chaos][fury].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { order: 2 } })
    .resources(P2, { energy: 3, power: { chaos: 1, fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 3, name: "Scout" }, "scout")
    .unit(P1, "bf2", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 2, name: "Walker" }, "walker")
    .hand(P1, HARNESSED_DRAGON, "dragon")
    .hand(P1, { energyCost: 0, might: 4, name: "Vanilla Recruit" }, "vanilla")
    .hand(P2, GUST, "gust")
    .hand(P2, SHAKEDOWN, "shake");
}

async function dragonPlayed(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("dragon", { to: "base" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  return game;
}

describe("Ruling 9ebe8f17255cb92e — no reacting to a play or a move itself; only to an ability they trigger", () => {
  test("playing a unit with NO triggered ability opens no chain: the game is straight back in P1's open main phase and P2 has nothing to do (no Gust window)", async () => {
    const game = await board().build();
    await game.p1.play("vanilla", { to: "base" });
    expect(game.zoneOf("vanilla")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.legal()).toEqual([]);
    expect(game.p2.can("cast", "gust")).toBe(false);
  });

  test("a Standard Move (Walker base → P1's own bf2, no trigger, no showdown) likewise opens nothing for P2 to react to", async () => {
    const game = await board().build();
    await game.p1.move("walker", "bf2");
    expect(game.zoneOf("walker")).toBe("battlefield-bf2");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.legal()).toEqual([]);
    expect(game.p2.can("cast", "gust")).toBe(false);
  });

  test("Harnessed Dragon's 'When you play me' DOES go on the chain — after P1 passes, P2 holds priority and may now cast Gust (reacting to the ability, not to the play)", async () => {
    const game = await dragonPlayed();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dragon", controller: P1, targets: ["scout"], triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "gust")).toBe(true);
    // Gust's legal picks are units AT A BATTLEFIELD with ≤3 Might — the 6-Might Dragon in base is not among them.
    const gustTargets = (game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(gustTargets.sort()).toEqual(["holder", "scout"]); // Walker (base) and the Dragon (base, 6) are not offered
    expect(gustTargets).not.toContain("dragon");
    await game.p2.cast("gust", { targets: "holder" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["dragon", "gust"]);
    await game.settle();
    expect(game.zoneOf("holder")).toBe("hand"); // Gust resolved first (LIFO) …
    expect(game.zoneOf("scout")).toBe("trash"); // … then the Dragon's kill
    expect(game.violations()).toEqual([]);
  });

  test("killing the Dragon in response (Shakedown for 6, P1 declines the draw-2 out) does NOT stop its trigger: the Dragon dies, then 'kill an enemy unit' still resolves and the Scout dies", async () => {
    const game = await dragonPlayed();
    await game.p1.passPriority();
    expect(game.p2.can("cast", "shake")).toBe(true);
    await game.p2.cast("shake", { targets: "dragon" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["dragon", "shake"]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    // Shakedown resolves: the Dragon's controller (P1) chooses — take the 6.
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const deal6 = (d as Pick).options.find((o) => /Deal 6/i.test(o.label));
    expect(deal6).toBeDefined();
    await game.p1.pick(deal6?.key as string);
    expect(game.zoneOf("dragon")).toBe("trash"); // 6 ≥ 6: the source is gone …
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dragon", triggered: true })]); // … its ability is not
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("scout")).toBe("trash"); // the trigger resolved anyway
    expect(game.p2.trash().sort()).toEqual(["scout", "shake"]);
    expect(game.p1.trash()).toEqual(["dragon"]);
    expect(game.violations()).toEqual([]);
  });
});
