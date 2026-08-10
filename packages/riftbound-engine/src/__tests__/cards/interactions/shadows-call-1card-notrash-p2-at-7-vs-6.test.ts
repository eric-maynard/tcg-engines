/**
 * Interaction: Shadow's Call (unl-165-219) · Spell · Order · 2
 *     "Choose a friendly unit without [Temporary]. Give it [Temporary]. Draw 2. (Kill it at the start of
 *      its controller's Beginning Phase, before scoring.)"
 *   × Vanguard Sergeant (ogn-219-298) · Unit · Order · 4 · 4 Might (vanilla — the Temporary recipient)
 *   × Draven, Showboat (ogn-028-298) · Champion Unit · Fury · 3 Might · "My Might is increased by your points."
 *
 * Rules: 431.1.a / 413.4 (draw as many as possible, Burn Out, draw the rest), 431.2.b (Burn Out recycles
 * the TRASH into the deck — a resolving spell is a chain item, not in the trash), 431.2.c (choose an
 * opponent to gain 1 — forced in a duel), 431.2.d (complete the action), 431.3 / 431.3.a (deck still empty
 * → the retried draw burns out AGAIN), 431.3.b (points after the first Burn Out in a sequence cannot be
 * prevented), 431.3.c / 431.3.c.1 (such a post-first point that reaches the Victory Score with more than any
 * opponent wins IMMEDIATELY, no Cleanup), 431.5 (Burn Out is a replacement effect), 321 (no Cleanup while a
 * chain item is resolving) + 319.5 / 323.1 / 472 (otherwise the win is checked at the Cleanup after the
 * item leaves the chain).
 *
 * Q (1v1, Victory 8; P1 on 2 casts Shadow's Call on its Sergeant; P1's deck = exactly [D1]; P2 controls
 * Draven, Showboat):
 *   (a) P2 on 7, P1's trash EMPTY → draw D1; Burn Out #1 (empty trash → deck stays empty) P2 8 — first
 *       Burn Out, no immediate win, no Cleanup mid-resolution; retry → Burn Out #2 → P2 9 → wins
 *       IMMEDIATELY. End: P2 9 (not 8), Draven 12, Shadow's Call still the resolving chain item (not in
 *       trash), Sergeant Temporary, P1 hand = [D1].
 *   (b) P2 on 6 → #1 → 7, #2 → 8 > 2 → immediate win at exactly 8, Draven 11, same shape as (a).
 *   (c) P2 on 7, trash [T1] → draw D1; Burn Out #1 recycles T1, P2 8 (first → not immediate); draw T1;
 *       spell finishes → trash; chain empties → Cleanup → P2 wins at 8. Hand +2, exactly one Burn Out.
 *   (d) control: deck [D1, D2] → no Burn Out, P2 stays 7, game continues.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SHADOWS_CALL = "unl-165-219";
const VANGUARD_SERGEANT = "ogn-219-298";
const DRAVEN_SHOWBOAT = "ogn-028-298";
const FILLER = "ogn-175-298"; // Shipyard Skulker — vanilla deck / trash stock

/**
 * P1's turn, Victory 8, P1 on 2, P2 on `p2`. P1: Vanguard Sergeant in base, Shadow's Call in hand with
 * exactly its 2 energy, Main Deck = d1..d<deck> (top first), trash = t1..t<trash>. P2: Draven, Showboat in
 * base. No deck auto-fill anywhere.
 */
function board(o: { p2: number; deck: number; trash: number }) {
  let b = scenario()
    .fillDecks(false)
    .victoryScore(8)
    .points(P1, 2)
    .points(P2, o.p2)
    .resources(P1, { energy: 2 })
    .unit(P1, "base", VANGUARD_SERGEANT, "sarge")
    .unit(P2, "base", DRAVEN_SHOWBOAT, "draven")
    .hand(P1, SHADOWS_CALL, "sc");
  for (let i = 1; i <= o.deck; i++) {
    b = b.deckTop(P1, FILLER, `d${i}`);
  }
  for (let i = 1; i <= o.trash; i++) {
    b = b.trash(P1, FILLER, `t${i}`);
  }
  return b;
}

/** Cast Shadow's Call on the Sergeant and let both players pass so it resolves; records every prompt seen. */
async function castAndResolve(game: Game): Promise<{ reason: string; prompts: Decision[] }> {
  const prompts: Decision[] = [];
  const rec = (d: Decision) => {
    if (d.kind !== "action") {
      prompts.push(d);
    }
    return undefined;
  };
  game.script(P1, [rec]);
  game.script(P2, [rec]);
  expect(game.state("sarge").keywords).not.toContain("Temporary");
  await game.p1.cast("sc", { targets: "sarge" });
  expect(game.p1.energy()).toBe(0);
  expect(game.chain().map((c) => c.cardId)).toEqual(["sc"]);
  expect(game.zoneOf("sc")).toBe("chain");
  const r = await game.settle();
  return { prompts, reason: r.reason };
}

describe("Shadow's Call 'Draw 2' into a 1-card deck with an empty trash — first Burn Out waits, second wins on the spot", () => {
  test("premise: Shadow's Call offers only the friendly non-Temporary Sergeant (not P2's Draven); Draven reads 3 + P2's points", async () => {
    const game = await board({ deck: 1, p2: 7, trash: 0 }).build();
    const field = game.p1.option("cast", "sc")?.fields.find((f) => f.name === "targets");
    const offered = [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
    expect(offered).toEqual(["sarge"]);
    await expect(game.p1.cast("sc", { targets: "draven" })).rejects.toThrow();
    expect(game.state("draven")).toMatchObject({ baseMight: 3, might: 10 });
    expect(game.p1.deck()).toEqual(["d1"]);
    expect(game.p1.trash()).toEqual([]);
  });

  // ── (a) P2 on 7, empty trash ────────────────────────────────────────────────────────────────────
  test("(a) P2 on 7: the game ends with P2 the winner during Shadow's Call's resolution, on P1's turn", async () => {
    const game = await board({ deck: 1, p2: 7, trash: 0 }).build();
    const { reason } = await castAndResolve(game);
    expect(reason).toBe("game-over");
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toBeNull();
  });

  test("(a) P2 finishes on 9, not 8: Burn Out #1 (7→8) is the FIRST of the sequence and no Cleanup can run mid-resolution (321), so the owed draw is retried → Burn Out #2 (8→9) wins immediately (431.3.c.1) — exactly two Burn Outs", async () => {
    const game = await board({ deck: 1, p2: 7, trash: 0 }).build();
    await castAndResolve(game);
    expect(game.p2.points()).toBe(9);
    expect(game.p1.points()).toBe(2);
  });

  test("(a) instruction 1 completed before the draw: the Sergeant HAS [Temporary]; P1 drew exactly D1 (hand = [d1]); deck and trash are both still empty — nothing was recycled (431.2.b: the trash was empty, the spell is on the chain)", async () => {
    const game = await board({ deck: 1, p2: 7, trash: 0 }).build();
    await castAndResolve(game);
    expect(game.state("sarge").keywords).toContain("Temporary");
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.deck()).toEqual([]);
    expect(game.p1.trash()).toEqual([]);
  });

  test("(a) Shadow's Call never finished: at game end it is still the resolving chain item — NOT in P1's trash", async () => {
    const game = await board({ deck: 1, p2: 7, trash: 0 }).build();
    await castAndResolve(game);
    expect(game.zoneOf("sc")).toBe("chain");
    expect(game.p1.trash()).not.toContain("sc");
  });

  test("(a) Draven, Showboat reads 3 + 9 = 12 at game end", async () => {
    const game = await board({ deck: 1, p2: 7, trash: 0 }).build();
    await castAndResolve(game);
    expect(game.state("draven").might).toBe(12);
  });

  test("(a) 'choose an opponent' (431.2.c) in a duel is forced to P2 — P1 is never shown a real choice, and each Burn Out grants exactly one point", async () => {
    const game = await board({ deck: 1, p2: 7, trash: 0 }).build();
    const { prompts } = await castAndResolve(game);
    for (const d of prompts) {
      // Anything surfaced must be a forced single option.
      expect(d.kind).toBe("pick");
      if (d.kind === "pick") {
        expect(d.options).toHaveLength(1);
      }
    }
    expect(game.p2.points() - 7).toBe(2); // two Burn Outs, one point each
  });

  // ── (b) P2 on 6, empty trash ────────────────────────────────────────────────────────────────────
  test("(b) P2 on 6: Burn Out #1 → 7 (first: no win), retry → Burn Out #2 → 8 > 2 → immediate win at EXACTLY 8 (no third Burn Out, no overshoot)", async () => {
    const game = await board({ deck: 1, p2: 6, trash: 0 }).build();
    const { reason } = await castAndResolve(game);
    expect(reason).toBe("game-over");
    expect(game.winner()).toBe(P2);
    expect(game.p2.points()).toBe(8);
    expect(game.p1.points()).toBe(2);
  });

  test("(b) same end shape as (a): Sergeant Temporary, hand = [d1], deck/trash empty, Shadow's Call stranded on the chain, Draven 3 + 8 = 11", async () => {
    const game = await board({ deck: 1, p2: 6, trash: 0 }).build();
    await castAndResolve(game);
    expect(game.state("sarge").keywords).toContain("Temporary");
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.deck()).toEqual([]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.zoneOf("sc")).toBe("chain");
    expect(game.state("draven").might).toBe(11);
  });

  // ── (c) P2 on 7, trash [T1] ─────────────────────────────────────────────────────────────────────
  test("(c) one card T1 in the trash: draw D1, Burn Out #1 recycles {T1} and gives P2 7→8, the retried draw takes T1 → 'Draw 2' complete: hand = {d1, t1}, deck and trash(of stock) empty — exactly ONE Burn Out", async () => {
    const game = await board({ deck: 1, p2: 7, trash: 1 }).build();
    expect(game.p1.trash()).toEqual(["t1"]);
    await castAndResolve(game);
    expect(game.p1.hand().sort()).toEqual(["d1", "t1"]);
    expect(game.p1.deck()).toEqual([]);
    expect(game.p2.points()).toBe(8); // one Burn Out only — not 9
  });

  test("(c) a FIRST burn-out point does not win on the spot: Shadow's Call finishes resolving and goes to P1's trash, the chain empties, and only THEN the Cleanup crowns P2 at 8 > 2 (321, 319.5, 323.1)", async () => {
    const game = await board({ deck: 1, p2: 7, trash: 1 }).build();
    const { reason } = await castAndResolve(game);
    expect(reason).toBe("game-over");
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("sc")).toBe("trash");
    expect(game.p1.trash()).toEqual(["sc"]);
    expect(game.state("sarge").keywords).toContain("Temporary");
    expect(game.state("draven").might).toBe(11);
    expect(game.turnPlayer()).toBe(P1);
  });

  // ── (d) control: deck [D1, D2] ──────────────────────────────────────────────────────────────────
  test("(d) control — deck [d1, d2]: both drawn, no Burn Out at all, P2 stays on 7 (Draven 10), Shadow's Call in trash, game continues in P1's open main phase", async () => {
    const game = await board({ deck: 2, p2: 7, trash: 0 }).build();
    const { reason, prompts } = await castAndResolve(game);
    expect(reason).toBe("open");
    expect(prompts).toEqual([]);
    expect(game.isOver()).toBe(false);
    expect(game.p2.points()).toBe(7);
    expect(game.p1.points()).toBe(2);
    expect(game.p1.hand().sort()).toEqual(["d1", "d2"]);
    expect(game.p1.deck()).toEqual([]);
    expect(game.zoneOf("sc")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.state("sarge").keywords).toContain("Temporary");
    expect(game.state("draven").might).toBe(10);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(d) …and the Temporary it granted is real: at the start of P1's NEXT Beginning Phase the Sergeant is killed (reminder text)", async () => {
    const game = await board({ deck: 2, p2: 7, trash: 0 })
      .deck(P1, [FILLER, FILLER, FILLER, FILLER])
      .deck(P2, [FILLER, FILLER, FILLER, FILLER])
      .points(P2, 0) // keep P2 from winning on holds/anything — irrelevant here, but keeps the game alive
      .build();
    await castAndResolve(game);
    expect(game.zoneOf("sarge")).toBe("base");
    await game.advanceTurn(); // → P2
    expect(game.zoneOf("sarge")).toBe("base"); // not P2's unit — survives P2's beginning phase
    await game.advanceTurn(); // → P1: Temporary kills it
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("sarge")).toBe("trash");
  });
});
