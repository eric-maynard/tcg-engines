/**
 * Ruling a9d4a4beb98a47f8 — Qiyana, Victorious (OGN-155 → ogn-155-298) · Unit · [4][body] · 4 Might
 *   "[Deflect] · When I conquer, draw 1 or channel 1 rune exhausted."
 *   × Kai'Sa, Survivor (OGN-039 → ogn-039-298) · Unit · [4] · 4 Might · "When I conquer, draw 1."
 *     (the second simultaneous conquer trigger — the ruling's "Rocket").
 *
 * Q: When one controller puts several triggers on the Chain at once, must every decision (mode, targets) be
 *    announced while ordering them, or as each one resolves?
 * A: The ORDER is decided immediately; the per-trigger decisions belong to the trigger, and ordering is what
 *    lets you sequence them (resolve the draw first, then spend what you drew).
 * Rules: 383.3.d (controller orders simultaneous triggers), 336/337 (LIFO), 402–404 + 355.3 (finalization).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const QIYANA = "ogn-155-298";
const KAISA = "ogn-039-298";

/** Both champions attack bf1 together and both conquer it, producing two simultaneous triggers for P1. */
function doubleConquer() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 1, name: "Chaff" }, "chaff")
    .unit(P1, "base", QIYANA, "qiyana")
    .unit(P1, "base", KAISA, "kaisa");
}

/** Attack, resolve combat, and answer Qiyana's mode with `mode` — stopping at the ORDER offer. */
async function toOrderOffer(mode: number): Promise<Game> {
  const game = await doubleConquer().build();
  await game.p1.move(["qiyana", "kaisa"], "bf1");
  await game.settle();
  await game.p1.chooseMode(mode);
  return game;
}

/** The Chain-item ids of the pending trigger-order offer, in the order the engine lists them. */
function orderKeys(game: Game): string[] {
  const d = game.decision();
  return d?.kind === "order" ? d.items.map((i) => i.key) : [];
}

/** Both players pass priority once → the top Chain item resolves. */
async function bothPass(game: Game): Promise<void> {
  await game.acting().passPriority();
  await game.acting().passPriority();
}

describe("Ruling a9d4a4beb98a47f8 — simultaneous triggers are ordered by their controller, then resolve one at a time", () => {
  test("both conquer triggers hit the Chain together and P1 is offered the ORDER decision before either resolves", async () => {
    const game = await toOrderOffer(1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["qiyana", "kaisa"]);
    expect(game.chain().every((c) => c.controller === P1 && c.triggered)).toBe(true);
    const d = game.decision();
    expect(d).toMatchObject({ defaultable: true, kind: "order", seat: P1, timing: "FIN" });
    expect(d?.kind === "order" ? d.items.map((i) => i.card) : []).toEqual(["qiyana", "kaisa"]);
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.runes()).toEqual([]); // nothing has resolved yet
  });

  test("ordering Qiyana to the TOP resolves her channel first, and only then Kai'Sa's draw", async () => {
    const game = await toOrderOffer(1); // mode 1 = channel 1 rune exhausted
    const ids = orderKeys(game);
    await game.p1.order([ids[1]!, ids[0]!]); // last key = top of Chain = resolves first → Qiyana
    await bothPass(game);
    expect(game.p1.runes()).toHaveLength(1); // Qiyana's channel happened…
    expect(game.p1.hand()).toEqual([]); // …and Kai'Sa's draw has not
    expect(game.chain().map((c) => c.cardId)).toEqual(["kaisa"]);
    await bothPass(game);
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("the mirror order resolves Kai'Sa's draw first — the controller really chooses the sequence", async () => {
    const game = await toOrderOffer(1);
    const ids = orderKeys(game);
    await game.p1.order([ids[0]!, ids[1]!]); // Kai'Sa on top
    await bothPass(game);
    expect(game.p1.hand()).toHaveLength(1); // the draw came first…
    expect(game.p1.runes()).toEqual([]); // …the channel had not happened yet
    expect(game.chain().map((c) => c.cardId)).toEqual(["qiyana"]);
    await bothPass(game);
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.violations()).toEqual([]);
  });

  // RULING-CONFLICT: riftjudge a9d4a4beb98a47f8 says a trigger's own decisions (such as Qiyana's
  // "draw 1 or channel 1") are made as that trigger RESOLVES; CR 402–404 + 355.3 put a triggered item's
  // mode and caster-chosen targets at FINALIZATION, before anyone gets priority — engine follows CR.
  // The ruling's substance (the controller sequences the triggers, above) is unaffected.
  test("Qiyana's mode is asked at FINALIZATION — before the order offer and before any priority", async () => {
    const game = await doubleConquer().build();
    await game.p1.move(["qiyana", "kaisa"], "bf1");
    const settled = await game.settle();
    expect(settled.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "mode", timing: "FIN" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.label) : []).toEqual([
      "Draw 1",
      "Channel 1 rune exhausted",
    ]);
    expect(d?.source?.cardId).toBe("qiyana");
    await game.p1.chooseMode(0);
    expect(game.chain()[0]).toMatchObject({ cardId: "qiyana", mode: 0 }); // recorded on the item, not deferred
    expect(game.decision()).toMatchObject({ kind: "order", seat: P1 });
  });
});
