/**
 * Ruling 7ed20221304a7b36 — Skyfall of Areion (SFD-030 → sfd-030-221) · Equipment +2 · "My hold effects are also conquer effects, and
 *     vice versa."
 *   × Trinity Force (SFD-115 → sfd-115-221) · Equipment +2 · "When I hold, score 1 point."
 *
 * Q: At 6 points, my unit wearing BOTH Skyfall and Trinity Force conquers. Do I win, and what is the timing?
 * A: Yes, you reach 8. The conquer itself scores 1 immediately (6 → 7). Trinity Force's "When I hold" — made a conquer effect by
 *    Skyfall — triggers and goes on the chain (closed state: Reactions may be played). When everyone passes it resolves: 7 → 8, and
 *    you win on reaching 8.
 * Rules: 444–445 (conquer scores as a game action before triggers resolve), 383 (triggered ability → chain, priority round),
 *        718.3 (Effect Text belongs to the wearer), 323.1 (win check at Victory Score).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SKYFALL = "sfd-030-221";
const TRINITY_FORCE = "sfd-115-221";
/** A P2 Reaction, to prove the window between the conquer point and the Trinity point is a real (closed-state) priority round. */
const PING = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Ping",
  timing: "reaction",
} as const;

/** P1's turn at 6 points (Victory 8). P1's Hero (3 +2 +2 = 7) in base wears Skyfall AND Trinity Force; bf1 is uncontrolled and empty. */
function board() {
  return scenario()
    .victoryScore(8)
    .points(P1, 6)
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 2, name: "Far Guard" }, "far")
    .unit(P1, "base", { might: 3, name: "Hero" }, "hero", { equippedWith: ["skyfall", "trinity"] } as Record<string, unknown>)
    .card("skyfall", { def: SKYFALL, meta: { attachedTo: "hero" } as Record<string, unknown>, owner: P1, zone: "base" })
    .card("trinity", { def: TRINITY_FORCE, meta: { attachedTo: "hero" } as Record<string, unknown>, owner: P1, zone: "base" })
    .hand(P2, PING, "ping");
}

/** Hero walks onto the empty bf1; both pass Focus so the (non-combat) showdown ends and P1 conquers. */
async function conquerBf1(): Promise<Game> {
  const game = await board().build();
  expect(game.state("hero")).toMatchObject({ attachments: ["skyfall", "trinity"], might: 7 });
  expect(game.p1.points()).toBe(6);
  await game.p1.move("hero", "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  return game;
}

describe("Ruling 7ed20221304a7b36 — Skyfall + Trinity Force conquer from 6: 7 on the conquer, 8 (and the win) when the trigger resolves", () => {
  test("step 1: the conquer scores immediately — 6 → 7 — before anything on the chain resolves; the game is not over yet", async () => {
    const game = await conquerBf1();
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
  });

  test("step 2: Trinity Force's 'When I hold' (a conquer effect thanks to Skyfall) has triggered and sits on the chain as the Hero's ability; the state is closed — P2 may respond with a Reaction", async () => {
    const game = await conquerBf1();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hero", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "ping")).toBe(true);
    await game.p2.cast("ping", { targets: "hero" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["hero", "ping"]);
    expect(game.p1.points()).toBe(7); // still 7 while the chain is open
  });

  test("step 3: once all players pass, the trigger resolves — 7 → 8 — and P1 wins the game on reaching the Victory Score", async () => {
    const game = await conquerBf1();
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("control — Trinity Force alone (no Skyfall): a conquer is not a hold, nothing triggers, P1 stops at 7", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 6)
      .battlefield("bf1", { controller: null })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 2, name: "Far Guard" }, "far")
      .unit(P1, "base", { might: 3, name: "Hero" }, "hero", { equippedWith: ["trinity"] } as Record<string, unknown>)
      .card("trinity", { def: TRINITY_FORCE, meta: { attachedTo: "hero" } as Record<string, unknown>, owner: P1, zone: "base" })
      .build();
    expect(game.state("hero").might).toBe(5);
    await game.p1.move("hero", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
  });
});
