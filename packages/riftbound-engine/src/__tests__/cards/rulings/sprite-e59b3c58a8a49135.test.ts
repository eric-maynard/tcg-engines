/**
 * Ruling e59b3c58a8a49135 — Sprite token (OGN-274 → ogn-274-298) · 3 Might · "[Temporary] (Kill me at the start of your Beginning
 *     Phase, before scoring.)"
 *   × Sprite Call (OGN-094 → ogn-094-298) · [Hidden][Action] "Play a ready 3 [Might] Sprite unit token with [Temporary]."
 *
 * Q: My Sprite sits at a battlefield where I hid Sprite Call. Can I react to the Sprite's Temporary death with Sprite Call and
 *    keep a (new) Sprite on that battlefield?
 * A: Yes. Temporary is a triggered ability that goes on the chain at the start of your Beginning Phase; you may react by playing
 *    the hidden Sprite Call, which resolves first (LIFO) and plays a new Sprite — necessarily HERE (hidden-play restriction). Then
 *    the old Sprite dies. The new one is not checked until your NEXT Beginning Phase.
 * Rules: 742.1 / 816 (Temporary is a trigger), 336.1 (LIFO), 811 / 737.1.d.3 (a hidden spell's unit is played at that battlefield).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPRITE = "ogn-274-298";
const SPRITE_CALL = "ogn-094-298";

/** End of P2's turn 3. P1 holds bf1 with ONLY a Sprite token there and Sprite Call facedown there; bf2 is P2's (Guard). */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", SPRITE, "old")
    .facedown(P1, "bf1", SPRITE_CALL, "call")
    .unit(P2, "bf2", { might: 2, name: "Guard" }, "guard");
}

async function atTemporaryTrigger(): Promise<Game> {
  const game = await board().build();
  expect(game.state("old")).toMatchObject({ isToken: true, might: 3, zone: "battlefield-bf1" });
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  return game;
}

function liveSprites(game: Game): string[] {
  return game.findAll({ name: "Sprite" }).filter((id) => game.zoneOf(id) !== "gone" && game.state(id).cardType === "unit");
}

describe("Ruling e59b3c58a8a49135 — react to your Sprite's Temporary trigger with the hidden Sprite Call; the new Sprite stays", () => {
  test("start of P1's Beginning Phase: the old Sprite's Temporary kill is a TRIGGER on the chain (Sprite still alive), P1 has priority and may flip Sprite Call", async () => {
    const game = await atTemporaryTrigger();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "old", controller: P1, triggered: true })]);
    expect(game.zoneOf("old")).toBe("battlefield-bf1");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "call")).toBe(true);
    expect(game.p1.points()).toBe(0); // "before scoring"
  });

  test("P1 flips Sprite Call for [0]: it sits ABOVE the Temporary trigger; it resolves first and the new Sprite is played AT bf1 (no other location offered), then the old Sprite dies", async () => {
    const game = await atTemporaryTrigger();
    const energy = game.p1.energy();
    await game.p1.reveal("call");
    expect(game.p1.energy()).toBe(energy);
    expect(game.chain().map((c) => c.cardId)).toEqual(["old", "call"]);
    // Resolve Sprite Call only.
    for (let i = 0; i < 6 && game.chain().some((c) => c.cardId === "call"); i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1 && d.semantics === "destination") {
        // 737.1.d.3 — if asked at all, "here" is the only place on offer.
        expect(d.options.map((o) => o.zone ?? o.key)).toEqual(["battlefield-bf1"]);
        await game.p1.pick(d.options[0]!.key);
        continue;
      }
      if (d?.kind !== "action" || d.context !== "chain") {
        break;
      }
      await game.seat(d.seat).passPriority();
    }
    expect(game.zoneOf("call")).toBe("trash");
    const both = liveSprites(game);
    expect(both.sort()).toHaveLength(2); // for a moment: old + new
    const neo = both.find((id) => id !== "old") as string;
    expect(game.state(neo)).toMatchObject({ controller: P1, isReady: true, isToken: true, might: 3, zone: "battlefield-bf1" });
    expect(game.state(neo).keywords).toContain("Temporary");
    expect(game.chain().map((c) => c.cardId)).toEqual(["old"]); // the Temporary trigger still waits
    // Now the trigger resolves: the OLD Sprite dies, the new one is untouched.
    await game.settle();
    expect(game.zoneOf("old")).toBe("gone");
    expect(game.zoneOf(neo)).toBe("battlefield-bf1");
  });

  test("result: in P1's main phase the new Sprite holds bf1 for P1 (control never lapsed; P1 even scores the hold), and it only dies at P1's NEXT Beginning Phase", async () => {
    const game = await atTemporaryTrigger();
    await game.p1.reveal("call");
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    const [neo] = liveSprites(game) as [string];
    expect(neo).toBeDefined();
    expect(game.zoneOf(neo)).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1); // held bf1 at the (later) scoring step
    await game.advanceTurn(); // → P2's turn: still there
    expect(game.zoneOf(neo)).toBe("battlefield-bf1");
    await game.advanceTurn(); // → P1's next turn: Temporary gets it now
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.has(neo) ? game.zoneOf(neo) : "gone").toBe("gone");
    expect(game.violations()).toEqual([]);
  });
});
