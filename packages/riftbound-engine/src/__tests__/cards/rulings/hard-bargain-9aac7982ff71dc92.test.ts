/**
 * Ruling 9aac7982ff71dc92 — Hard Bargain (SFD-136 → sfd-136-221) · Reaction · [2] "Counter a spell unless its controller pays [2]."
 *   × Lilting Lullaby (UNL-190 → unl-190-219) · Reaction · [2][calm][mind] "Counter a spell. Its controller can't play spells this turn."
 *   × En Garde (OGN-046 → ogn-046-298) · Reaction · [1][calm] "Give a friendly unit +1 Might this turn, then +1 more if alone there."
 *
 * Q: Opponent Hard Bargains my spell; I answer with Lilting Lullaby on the Hard Bargain. Can the opponent still play
 *    En Garde?
 * A: Yes. The chain is still open to Reactions; Lullaby's "can't play spells" only applies once Lullaby RESOLVES.
 *    Chain: my spell < Hard Bargain < Lullaby < En Garde. LIFO: En Garde resolves; Lullaby counters Hard Bargain
 *    (no [2] question, 425.1.a); THEN the opponent is barred from spells for the turn.
 * Rules: 813.1.c.1 ([Reaction] in Closed state), 340 (LIFO), 425.1.a (countered → no effect).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HARD_BARGAIN = "sfd-136-221";
const LULLABY = "unl-190-219";
const EN_GARDE = "ogn-046-298";
const DEFY = "ogn-045-298"; // [1][calm] Reaction — a second spell for P2 so the post-Lullaby lock is observable
const VOID_SEEKER = "ogn-024-298"; // [3][fury] Action — "Deal 4 to a unit at a battlefield. Draw 1."

/**
 * P1's turn ("I"). P1: Void Seeker + Lullaby, [3]+[fury] + [2]+[calm][mind], and a second cheap spell.
 * P2 ("my opponent"): lone Wall (6) at bf1; Hard Bargain + En Garde + Defy; [2]+[1]+[1] energy, 2 calm.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { fury: 2, calm: 1, mind: 1 } })
    .resources(P2, { energy: 4, power: { calm: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 6, name: "Wall" }, "wall")
    .hand(P1, VOID_SEEKER, "vs")
    .hand(P1, VOID_SEEKER, "vs2")
    .hand(P1, LULLABY, "lull")
    .hand(P2, HARD_BARGAIN, "hb")
    .hand(P2, EN_GARDE, "engarde")
    .hand(P2, DEFY, "defy");
}

/** Void Seeker → Hard Bargain on it → Lullaby on the Hard Bargain; P1 passes so P2 holds priority. */
async function upToLullaby(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("vs", { targets: "wall" });
  await game.p1.passPriority();
  await game.p2.cast("hb", { targets: "vs" });
  await game.p2.passPriority();
  await game.p1.cast("lull", { targets: "hb" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["vs", "hb", "lull"]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 9aac7982ff71dc92 — En Garde is still playable in response to a Lilting Lullaby aimed at your Hard Bargain", () => {
  test("with Lullaby on the chain (unresolved) P2 may still cast En Garde; chain becomes vs < hb < lull < engarde", async () => {
    const game = await upToLullaby();
    expect(game.p2.can("cast", "engarde")).toBe(true);
    expect(game.p2.can("cast", "defy")).toBe(true); // any Reaction is fine at this point
    await game.p2.cast("engarde", { targets: "wall" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["vs", "hb", "lull", "engarde"]);
    expect(game.chain().at(-1)).toMatchObject({ cardId: "engarde", controller: P2 });
  });

  test("LIFO: En Garde resolves first (+2 to the lone Wall), then Lullaby counters Hard Bargain — nobody is asked to pay [2] — then Void Seeker resolves (4 to the Wall)", async () => {
    const game = await upToLullaby();
    await game.p2.cast("engarde", { targets: "wall" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // En Garde resolves
    expect(game.zoneOf("engarde")).toBe("trash");
    expect(game.state("wall").might).toBe(8);
    expect(game.chain().map((c) => c.cardId)).toEqual(["vs", "hb", "lull"]);
    // Everyone keeps passing: Lullaby resolves and counters Hard Bargain; a countered Hard Bargain asks nothing.
    const s = await game.settle();
    expect(s.reason).not.toBe("unanswered");
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("lull")).toBe("trash");
    expect(game.zoneOf("hb")).toBe("trash");
    expect(game.zoneOf("vs")).toBe("trash");
    expect(game.state("wall").damage).toBe(4); // Void Seeker was NOT countered
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });

  test("only after Lullaby resolved is Hard Bargain's controller (P2) barred from spells this turn: on P1's next spell P2 can no longer Defy", async () => {
    const game = await upToLullaby();
    await game.p2.cast("engarde", { targets: "wall" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    await game.p1.cast("vs2", { targets: "wall" });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.energy()).toBeGreaterThanOrEqual(1); // Defy ([1][calm]) is affordable…
    expect(game.p2.power("calm")).toBeGreaterThanOrEqual(1);
    expect(game.p2.can("cast", "defy")).toBe(false); // …but P2 can't play spells this turn
  });
});
