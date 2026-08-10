/**
 * Ruling 5181cac3c8bffdb4 — Sprite token (OGN-274 → ogn-274-298) · 3 Might · "[Temporary] (Kill me at the start of your
 *   Beginning Phase, before scoring.)"
 *   × Sprite Call (OGN-094 → ogn-094-298) · Action · [3] · [Hidden] "Play a ready 3 [Might] Sprite unit token with [Temporary]."
 *
 * Q: I hold a battlefield with a Sprite token and have Sprite Call face down there. My turn begins — if I play the Sprite Call
 *    now, do BOTH Sprites die to Temporary?
 * A: No. Temporary is a triggered ability that goes on the chain at the start of your Beginning Phase; you may react to it with
 *    the hidden Sprite Call (it must make its Sprite at that battlefield). LIFO: the new Sprite arrives first, then the old
 *    Sprite's trigger kills only the old one. The new Sprite is not checked until your NEXT Beginning Phase — so you never lose
 *    the battlefield and still score your hold point.
 * Rules: 816 (Temporary), 336.1 (LIFO), 811 (play from Hidden as a Reaction for [0], "here" only), 316 (hold scoring after
 *        beginning-phase triggers).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPRITE = "ogn-274-298";
const SPRITE_CALL = "ogn-094-298";

/** End of P2's turn 3. P1 controls bf1 with a lone Sprite token and has Sprite Call face down there (hidden earlier). */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", SPRITE, "old-sprite")
    .facedown(P1, "bf1", SPRITE_CALL, "call");
}

/** P2 ends the turn → P1's Beginning Phase opens with the old Sprite's Temporary trigger on the chain. */
async function atTemporaryTrigger(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.points()).toBe(0);
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  return game;
}

const spritesAt = (game: Game, loc: string) => game.p1.units(loc).filter((id) => game.state(id).name === "Sprite");

describe("Ruling 5181cac3c8bffdb4 — reacting to a Sprite's Temporary trigger with a hidden Sprite Call keeps the battlefield", () => {
  test("start of P1's Beginning Phase: the old Sprite's Temporary kill is a chain item, P1 holds priority, the Sprite is still alive and nothing has been scored yet", async () => {
    const game = await atTemporaryTrigger();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "old-sprite", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.zoneOf("old-sprite")).toBe("battlefield-bf1");
    expect(game.p1.points()).toBe(0); // "before scoring"
  });

  test("in that window P1 may play the face-down Sprite Call for [0]; it goes on TOP of the Temporary trigger", async () => {
    const game = await atTemporaryTrigger();
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.can("reveal", "call")).toBe(true);
    await game.p1.reveal("call");
    expect(game.p1.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["old-sprite", "call"]);
  });

  test("LIFO: Sprite Call resolves first — a NEW ready Sprite appears at bf1 (a hidden card acts 'here') while the old Sprite and its trigger are both still around", async () => {
    const game = await atTemporaryTrigger();
    await game.p1.reveal("call");
    for (let i = 0; i < 4 && game.chain().length > 1; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        // If a destination is asked at all, only bf1 may be legal for a play from Hidden.
        expect(d.options.map((o) => o.zone ?? o.key)).toEqual([expect.stringContaining("bf1")]);
        await game.p1.answer({ keys: [d.options[0]!.key], kind: "pick" });
      } else if (d?.kind === "action") {
        await game.seat(d.seat).passPriority();
      }
    }
    expect(game.zoneOf("call")).toBe("trash");
    expect(spritesAt(game, "bf1")).toHaveLength(2);
    expect(game.zoneOf("old-sprite")).toBe("battlefield-bf1");
    const fresh = spritesAt(game, "bf1").find((id) => id !== "old-sprite")!;
    expect(game.state(fresh)).toMatchObject({ isReady: true, isToken: true, might: 3 });
    expect(game.state(fresh).keywords).toContain("Temporary");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "old-sprite", triggered: true })]);
  });

  test("then the Temporary trigger resolves and kills ONLY the old Sprite; the new one survives into the turn, bf1 never leaves P1's control and P1 scores the hold point", async () => {
    const game = await atTemporaryTrigger();
    await game.p1.reveal("call");
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("old-sprite")).toBe("gone"); // a dead token ceases to exist
    const survivors = spritesAt(game, "bf1");
    expect(survivors).toHaveLength(1);
    expect(survivors[0]).not.toBe("old-sprite");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1); // held bf1 through the Beginning Phase
    expect(game.violations()).toEqual([]);
  });

  test("the new Sprite is only checked at P1's NEXT Beginning Phase: it lives through this whole turn and P2's, then dies at the start of P1's following turn", async () => {
    const game = await atTemporaryTrigger();
    await game.p1.reveal("call");
    await game.settle();
    const fresh = spritesAt(game, "bf1")[0]!;
    await game.advanceTurn(); // → P2's turn
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf(fresh)).toBe("battlefield-bf1");
    await game.p2.endTurn(); // → P1's next Beginning Phase: now ITS Temporary triggers
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: fresh, triggered: true })]);
    await game.settle();
    expect(game.zoneOf(fresh)).toBe("gone");
  });

  test("contrast — if P1 just passes on the trigger, the old Sprite dies with nothing to replace it: bf1 is lost, no hold point, and the still-hidden Sprite Call is trashed with the battlefield", async () => {
    const game = await atTemporaryTrigger();
    await game.p1.passPriority();
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("old-sprite")).toBe("gone");
    expect(spritesAt(game, "bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.p1.points()).toBe(0);
    expect(game.zoneOf("call")).toBe("trash");
  });
});
