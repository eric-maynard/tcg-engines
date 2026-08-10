/**
 * Ruling 11c0f986b18952e7 — Death from Below (UNL-186 → unl-186-219) · Spell · Fury/Chaos · 4+[rainbow]
 *   "Kill a unit at a battlefield. Then, if it had 3 [Might] or less, you may play this from your trash for [rainbow]."
 *   × Gust (OGN-169 → ogn-169-298) · Spell · Chaos · 1 · Reaction · "Return a unit at a battlefield with 3 [Might] or
 *     less to its owner's hand."
 *
 * Q: I cast Death from Below and the target gets Gusted in response — can I still replay it from the trash?
 * A: No. When Death from Below resolves its target is no longer on the board, so the target is illegal: the kill is
 *    not performed, and "if it had 3 [Might] or less" evaluates against nothing (null) — the "you may play this from
 *    your trash" never happens. The spell simply resolves to the trash.
 * Rules: 359.3.e.2 (target that left the board is illegal), 359.3.e.5 (instruction on an illegal target is not
 *        executed), 359.3.e.12 (information about an illegal target reads as null), 813 (Reaction).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEATH_FROM_BELOW = "unl-186-219";
const GUST = "ogn-169-298";

/**
 * P1's turn. P2 holds bf1 with Small (3 Might) and Other (2 Might) and has Gust with exactly 1 energy. P1 has Death
 * from Below with 4 energy + 2 rainbow (one for the cast, one spare that a replay would cost).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { rainbow: 2 } })
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Small" }, "small")
    .unit(P2, "bf1", { might: 2, name: "Other" }, "other")
    .hand(P1, DEATH_FROM_BELOW, "dfb")
    .hand(P2, GUST, "gust");
}

async function castAtSmall(game: Game): Promise<void> {
  await game.p1.cast("dfb", { targets: "small" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dfb", controller: P1, targets: ["small"] })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ kind: "action", context: "chain", seat: P2 });
}

/** Is P1 currently being offered the trash replay in any form? */
function replayOffered(game: Game): boolean {
  const d = game.decision();
  if (d?.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "dfb") {
    return true;
  }
  return game.p1.legal().some((o) => o.card === "dfb");
}

describe("Ruling 11c0f986b18952e7 — Death from Below's target Gusted in response: no kill, no replay from trash", () => {
  test("P2 may Gust the targeted Small (≤3 Might, at a battlefield) in response; Gust resolves first and Small goes back to P2's hand", async () => {
    const game = await board().build();
    await castAtSmall(game);
    expect(game.p2.can("cast", "gust")).toBe(true);
    const gustTargets = game.p2.option("cast", "gust")?.fields.find((f) => f.arg === "targets")?.options ?? [];
    expect(gustTargets).toEqual(expect.arrayContaining([["small"], ["other"]]));
    await game.p2.cast("gust", { targets: "small" });
    expect(game.p2.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["dfb", "gust"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("small")).toBe("hand");
    expect(game.p2.hand()).toContain("small");
    expect(game.chain().map((c) => c.cardId)).toEqual(["dfb"]); // still waiting, target now gone
  });

  test("Death from Below then resolves against an illegal target: nothing is killed, NO 'play this from your trash' offer appears, the spare [rainbow] is untouched, and the spell rests in the trash", async () => {
    const game = await board().build();
    await castAtSmall(game);
    await game.p2.cast("gust", { targets: "small" });
    const s = await game.settle();
    expect(s.reason).toBe("open"); // straight back to P1's main phase — no prompt on the way
    expect(replayOffered(game)).toBe(false);
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P1 });
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("dfb")).toBe("trash");
    expect(game.zoneOf("small")).toBe("hand"); // not killed — it is in hand, not the trash
    expect(game.p2.trash()).toEqual(["gust"]);
    expect(game.zoneOf("other")).toBe("battlefield-bf1"); // no retargeting onto another ≤3 unit
    expect(game.state("other").damage).toBe(0);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(game.p1.can("cast", "dfb")).toBe(false); // and it cannot be cast from the trash on its own
    expect(game.violations()).toEqual([]);
  });

  test("contrast: with no response Small (3 Might) IS killed and P1 IS offered the [rainbow] replay — accepting spends the spare rainbow and puts the spell back on the chain", async () => {
    const game = await board().build();
    await castAtSmall(game);
    await game.p2.passPriority(); // no Gust
    const s = await game.settle();
    expect(game.zoneOf("small")).toBe("trash");
    expect(s.reason).toBe("unanswered");
    expect(replayOffered(game)).toBe(true);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, canAccept: true });
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.zoneOf("dfb")).toBe("chain");
  });
});
