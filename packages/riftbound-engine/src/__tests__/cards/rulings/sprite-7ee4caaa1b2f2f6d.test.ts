/**
 * Ruling 7ee4caaa1b2f2f6d — Sprite token (OGN-274 → ogn-274-298) · 3 Might "[Temporary] (Kill me at the start of your Beginning Phase,
 *   before scoring.)" × Keeper of Masks (UNL-081 → unl-081-219) · [2] · 1 Might "[Hidden] [Temporary] When you play me, play two
 *   Reflection unit tokens here. They become copies of me." (× Reflection token UNL-T06)
 *
 * Q: I hold a battlefield with a Temporary Sprite and a hidden Keeper of Masks. I react to the Sprite's Temporary trigger by
 *    revealing Keeper (3 new Temporary units appear). Are they cleaned up too (still my Beginning Phase), or do they stay?
 * A: They stay for the turn. LIFO: Keeper's play trigger resolves (Reflections created) before the Sprite's Temporary trigger,
 *    which then kills only the Sprite. The Beginning-Phase Temporary check happened once, before they existed; they are next
 *    subject to Temporary at my NEXT Beginning Phase.
 * Rules: 816.1.b (Temporary triggers at start of Beginning Phase), 383.2.c (trigger condition evaluated at the event), 340 (LIFO), 811 (Hidden).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPRITE = "ogn-274-298";
const KEEPER = "unl-081-219";

const chainIds = (game: Game) => game.chain().map((c) => `${c.cardId}${c.triggered ? "*" : ""}`);
const tokensAt = (game: Game, loc: string) => game.cardsAt(loc).filter((c) => game.state(c).isToken && c !== "sprite");

/** End of P2's turn 3. P1 controls bf1 with a Sprite token and Keeper of Masks facedown there. P2 idles at bf2. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", SPRITE, "sprite")
    .facedown(P1, "bf1", KEEPER, "keeper")
    .unit(P2, "bf2", { might: 2, name: "Idler" }, "idler");
}

/** P2 ends the turn → P1's Beginning Phase: the Sprite's Temporary trigger is on the chain and P1 has priority. */
async function atTemporaryTrigger(): Promise<Game> {
  const game = await board().build();
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  expect(chainIds(game)).toEqual(["sprite*"]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 7ee4caaa1b2f2f6d — units created in response to a Temporary trigger survive that Beginning Phase", () => {
  test("1. Beginning Phase starts: exactly one Temporary trigger (the Sprite's) is on the chain; P1 may reveal the hidden Keeper in that window", async () => {
    const game = await atTemporaryTrigger();
    expect(game.p1.can("reveal", "keeper")).toBe(true);
  });

  test("2. revealing Keeper: it enters bf1 at once and its play trigger sits ABOVE the Sprite's Temporary trigger — no extra Temporary trigger is added for Keeper", async () => {
    const game = await atTemporaryTrigger();
    await game.p1.reveal("keeper");
    expect(game.zoneOf("keeper")).toBe("battlefield-bf1");
    expect(chainIds(game)).toEqual(["sprite*", "keeper*"]);
  });

  test("3. LIFO: Keeper's trigger resolves first → two Reflection tokens at bf1 while the Sprite is still alive; then the Temporary trigger kills ONLY the Sprite", async () => {
    const game = await atTemporaryTrigger();
    await game.p1.reveal("keeper");
    for (let i = 0; i < 6 && game.chain().length === 2; i++) {
      await game.acting().passPriority();
    }
    expect(chainIds(game)).toEqual(["sprite*"]);
    expect(tokensAt(game, "bf1")).toHaveLength(2);
    expect(game.zoneOf("sprite")).toBe("battlefield-bf1");
    for (let i = 0; i < 6 && game.chain().length === 1; i++) {
      const d = game.decision();
      if (d?.kind !== "action" || d.context !== "chain") {
        break;
      }
      await game.seat(d.seat).passPriority();
    }
    expect(["gone", "trash"]).toContain(game.zoneOf("sprite"));
    expect(game.zoneOf("keeper")).toBe("battlefield-bf1");
    expect(tokensAt(game, "bf1")).toHaveLength(2);
    // No further Temporary triggers were queued for the newcomers this phase.
    expect(game.chain().filter((c) => c.triggered)).toEqual([]);
  });

  test("4. result: into P1's main phase Keeper + both Reflections (all [Temporary]) are still at bf1, P1 still holds bf1 and scored the hold; they stay all turn", async () => {
    const game = await atTemporaryTrigger();
    await game.p1.reveal("keeper");
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("keeper")).toBe("battlefield-bf1");
    const tokens = tokensAt(game, "bf1");
    expect(tokens).toHaveLength(2);
    for (const t of tokens) {
      expect(game.state(t).keywords).toContain("Temporary");
    }
    expect(game.state("keeper").keywords).toContain("Temporary");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1); // held bf1 (Keeper & co. were there at scoring)
    // Through the whole of P1's turn and P2's turn they remain.
    await game.advanceTurn(); // → P2
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("keeper")).toBe("battlefield-bf1");
    expect(tokensAt(game, "bf1")).toHaveLength(2);
    expect(game.violations()).toEqual([]);
  });

  test("…and only at P1's NEXT Beginning Phase do their own Temporary triggers fire and kill all three (before scoring: no hold point that turn)", async () => {
    const game = await atTemporaryTrigger();
    await game.p1.reveal("keeper");
    await game.settle();
    const pts = game.p1.points();
    await game.advanceTurn(); // → P2's turn
    await game.p2.endTurn(); // → P1's Beginning Phase again
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain().filter((c) => c.triggered).length).toBeGreaterThanOrEqual(1);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("keeper")).toBe("trash");
    expect(tokensAt(game, "bf1")).toEqual([]);
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p1.points()).toBe(pts); // killed before scoring → no hold
  });
});
