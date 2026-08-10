/**
 * Interaction: Shen, Kinkou (ogn-241-298) · Champion Unit · Order · 3 · 3 Might
 *     "[Reaction] (Play any time, even before spells and abilities resolve, including to a battlefield you
 *      control.) [Shield 2] [Tank]"
 *   × Discipline (ogn-058-298) · Spell · Calm · 2 · "[Reaction] Give a unit +2 [Might] this turn. Draw 1."
 *   × Void Seeker (ogn-024-298) · Spell · Fury · 3 · "[Action] Deal 4 to a unit at a battlefield. Draw 1."
 *
 * Question: P1's turn. P2 controls bf1 with a 3-Might unit X. P1 plays Void Seeker targeting X and passes
 * priority. Case A: P2 responds by playing Shen to bf1. Case B: P2 responds with Discipline on X. In each
 * case: does the responding item ever sit on the chain as a finalized item at a priority window (can P1
 * respond to IT)? Who holds priority right after P2's play? What happens to X? What is the turn state at
 * each step, and does the Chain zone cease to exist after the last item resolves?
 *
 * Rules: 337.2 (a finalized unit item resolves immediately → Step 4), 359.2 / 359.2.c (a permanent leaves
 * the chain and enters the board — a unit enters exhausted at the chosen location), 359.3 / 359.3.a /
 * 359.3.c (a spell lingers as a Finalized item; others may react before it resolves), 337.1.a / 337.4
 * (finalizing does not pass priority; controller of the newest item holds it), 339.1 / 339.2 (resolve only
 * once all players passed in sequence WITHOUT adding an item), 340.1 (newest item resolves), 340.4 (chain
 * not empty → controller of the newest remaining item gains priority), 340.2 (chain empty → Open State),
 * 328 / 330 / 331.1 / 331.2 (the Chain zone exists only while an item is on it; Closed iff it exists).
 *
 * Expected — Case A: Shen is finalized (P2 pays 3 + [order], chooses bf1) and resolves immediately: enters
 * bf1 exhausted; the chain listing at every priority window is [Void Seeker] only — P1 never gets to
 * respond "to Shen". Because an item was added the pass sequence restarts, and per 340.4 the controller of
 * the newest remaining item — P1 — holds priority; P1 pass, P2 pass → Void Seeker resolves: 4 to X (3) → X
 * dies, P1 draws 1; Shen untouched. Closed from Void Seeker's play until it resolved, then no Chain zone →
 * Open, P1 (turn player) acts. Case B: Discipline lingers: listing [Void Seeker (P1→X), Discipline (P2→X)],
 * priority P2 → pass → P1 holds priority with Discipline visible (a real response window) → pass →
 * Discipline resolves (X = 5 Might, P2 draws 1) → priority to P1 (340.4) → pass, pass → Void Seeker: 4 to a
 * 5-Might X → survives; P1 draws 1; chain gone → Open. At end of turn the damage heals and the +2 expires.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SHEN = "ogn-241-298";
const DISCIPLINE = "ogn-058-298";
const VOID_SEEKER = "ogn-024-298";

/** rule 331: Closed iff a Chain exists; rule 341: Showdown vs Neutral. */
function turnState(game: Game): string {
  const i = game.gameState.interaction;
  const sd = i?.showdownStack?.[i.showdownStack.length - 1];
  const showdown = sd?.active === true;
  const chain = i?.chain?.active === true;
  return `${showdown ? "showdown" : "neutral"}-${chain ? "closed" : "open"}`;
}

/** Legal `to` destinations offered to P2 for playing `alias` right now. */
function destinationsOffered(game: Game, alias: string): string[] {
  const field = game.p2.option("play", alias)?.fields.find((f) => f.arg === "to");
  return ((field?.options ?? []) as string[]).slice().sort();
}

function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { fury: 1 } })
    .resources(P2, { energy: 5, power: { order: 1, calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Unit X" }, "x")
    .hand(P1, VOID_SEEKER, "seeker")
    .hand(P2, SHEN, "shen")
    .hand(P2, DISCIPLINE, "discipline");
}

/** P1 casts Void Seeker at X and passes → P2 holds priority on [Void Seeker]. */
async function seekerOnChainP2Priority(): Promise<Game> {
  const game = await board().build();
  expect(turnState(game)).toBe("neutral-open");
  expect(game.gameState.interaction?.chain ?? null).toBeNull(); // no Chain zone yet (328/330)
  await game.p1.cast("seeker", { targets: "x" });
  expect(turnState(game)).toBe("neutral-closed");
  expect(game.decision()).toMatchObject({ kind: "action", context: "chain", seat: P1 }); // 337.4: caster keeps priority
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ kind: "action", context: "chain", seat: P2 });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "seeker", controller: P1, targets: ["x"], triggered: false })]);
  return game;
}

describe("Case A — Shen, Kinkou (Reaction unit) in response to Void Seeker", () => {
  test("with priority on P1's chain, P2 may play Shen, and bf1 (a battlefield P2 controls) is a legal destination besides base", async () => {
    const game = await seekerOnChainP2Priority();
    expect(game.p2.can("play", "shen")).toBe(true);
    expect(destinationsOffered(game, "shen")).toEqual(["base", "battlefield-bf1"]);
  });

  test("Shen resolves immediately on finalize (337.2): enters bf1 EXHAUSTED (359.2.c), P2 paid 3 + [order], and the chain listing is still exactly [Void Seeker] — Shen is never a chain item at a priority window", async () => {
    const game = await seekerOnChainP2Priority();
    await game.p2.play("shen", { to: "bf1" });
    expect(game.zoneOf("shen")).toBe("battlefield-bf1");
    expect(game.state("shen").isExhausted).toBe(true);
    expect(game.p2.resources()).toEqual({ energy: 2, power: { calm: 1, order: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "seeker", controller: P1 })]);
    expect(game.chain().some((i) => i.cardId === "shen")).toBe(false);
    expect(turnState(game)).toBe("neutral-closed"); // Void Seeker still pending resolution
    expect(game.state("x").damage).toBe(0);
  });

  test("after Shen's immediate resolution the controller of the newest REMAINING item — P1 (Void Seeker) — holds priority (340.4)", async () => {
    // Expected: 337.2 → Step 4 → 340.4: chain = [Void Seeker] (P1's) → P1 gains priority.
    // Actual: P2 keeps priority after playing Shen.
    const game = await seekerOnChainP2Priority();
    await game.p2.play("shen", { to: "bf1" });
    expect(game.decision()).toMatchObject({ kind: "action", context: "chain", seat: P1, source: { cardId: "seeker" } });
  });

  test("adding Shen restarts the pass sequence (339.1) — one pass after Shen does NOT resolve Void Seeker; it takes P1 pass + P2 pass", async () => {
    // Expected: after Shen → priority P1; P1 passes → P2 has priority, Void Seeker still on the chain;
    // P2 passes → all passed in sequence with nothing added → resolves.
    // Actual: P2 holds priority and P1's pre-Shen pass is still remembered → P2's pass resolves it at once.
    const game = await seekerOnChainP2Priority();
    await game.p2.play("shen", { to: "bf1" });
    await game.acting().passPriority();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "seeker" })]);
    expect(game.state("x").damage).toBe(0);
    expect(game.decision()).toMatchObject({ kind: "action", context: "chain", seat: P2 });
    await game.acting().passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("x")).toBe("trash");
  });

  test("final fate: Void Seeker resolves — 4 to X (3 Might) → X dies in the Cleanup, P1 draws 1; Shen unaffected and still holds bf1 for P2; no Chain zone → Neutral Open with P1 (turn player) acting", async () => {
    const game = await seekerOnChainP2Priority();
    const p1Hand = game.p1.hand().length; // Void Seeker already left the hand
    const p1Deck = game.p1.deck().length;
    await game.p2.play("shen", { to: "bf1" });
    await game.settle();
    expect(game.zoneOf("seeker")).toBe("trash");
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(p1Hand + 1);
    expect(game.p1.deck()).toHaveLength(p1Deck - 1);
    expect(game.state("shen")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.chain()).toEqual([]);
    expect(game.gameState.interaction?.chain ?? null).toBeNull(); // 330: the Chain ceased to exist
    expect(turnState(game)).toBe("neutral-open");
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

describe("Case B — Discipline (Reaction spell) in response to Void Seeker", () => {
  test("Discipline LINGERS as a finalized item (359.3): listing = [Void Seeker (P1→X), Discipline (P2→X)], P2 paid 2, and P2 — controller of the newest item — keeps priority (337.1.a / 337.4)", async () => {
    const game = await seekerOnChainP2Priority();
    await game.p2.cast("discipline", { targets: "x" });
    expect(game.zoneOf("discipline")).toBe("chain");
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "seeker", controller: P1, targets: ["x"], triggered: false, type: "spell" }),
      expect.objectContaining({ cardId: "discipline", controller: P2, targets: ["x"], triggered: false, type: "spell" }),
    ]);
    expect(game.p2.energy()).toBe(3);
    expect(turnState(game)).toBe("neutral-closed");
    expect(game.decision()).toMatchObject({ kind: "action", context: "chain", seat: P2, source: { cardId: "discipline" } });
    expect(game.state("x").might).toBe(3); // nothing resolved yet
  });

  test("P2 passes → P1 receives priority WITH Discipline visible on top of the chain — a real response window on P2's spell (359.3.c, 339.2)", async () => {
    const game = await seekerOnChainP2Priority();
    await game.p2.cast("discipline", { targets: "x" });
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ kind: "action", context: "chain", seat: P1, source: { cardId: "discipline" } });
    expect(game.chain().map((i) => i.cardId)).toEqual(["seeker", "discipline"]);
    expect(game.state("x").might).toBe(3);
    expect(turnState(game)).toBe("neutral-closed");
  });

  test("P1 passes → Discipline (newest) resolves: X = 5 Might, P2 draws 1, Discipline → trash; chain = [Void Seeker] and P1 (its controller) gains priority (340.1, 340.4)", async () => {
    const game = await seekerOnChainP2Priority();
    const p2HandAfterCast = game.p2.hand().length - 1; // Discipline is about to leave the hand
    const p2Deck = game.p2.deck().length;
    await game.p2.cast("discipline", { targets: "x" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("discipline")).toBe("trash");
    expect(game.state("x")).toMatchObject({ baseMight: 3, damage: 0, might: 5, zone: "battlefield-bf1" });
    expect(game.p2.hand()).toHaveLength(p2HandAfterCast + 1);
    expect(game.p2.deck()).toHaveLength(p2Deck - 1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "seeker", controller: P1 })]);
    expect(turnState(game)).toBe("neutral-closed");
    expect(game.decision()).toMatchObject({ kind: "action", context: "chain", seat: P1, source: { cardId: "seeker" } });
  });

  test("P1 pass, P2 pass → Void Seeker resolves: 4 damage to a 5-Might X → X SURVIVES at bf1 with 4 damage; P1 draws 1; the Chain zone is gone → Neutral Open, P1 acting", async () => {
    const game = await seekerOnChainP2Priority();
    const p1Hand = game.p1.hand().length;
    const p1Deck = game.p1.deck().length;
    await game.p2.cast("discipline", { targets: "x" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Discipline resolves
    await game.p1.passPriority();
    expect(game.chain()).toHaveLength(1); // one pass is not enough (339.2)
    await game.p2.passPriority(); // Void Seeker resolves
    expect(game.zoneOf("seeker")).toBe("trash");
    expect(game.state("x")).toMatchObject({ damage: 4, might: 5, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.hand()).toHaveLength(p1Hand + 1);
    expect(game.p1.deck()).toHaveLength(p1Deck - 1);
    expect(game.chain()).toEqual([]);
    expect(game.gameState.interaction?.chain ?? null).toBeNull();
    expect(turnState(game)).toBe("neutral-open");
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("X outlives the turn: at end of turn its 4 damage heals and the +2 expires — on P2's turn X is a healthy 3-Might unit still holding bf1", async () => {
    const game = await seekerOnChainP2Priority();
    await game.p2.cast("discipline", { targets: "x" });
    await game.settle();
    expect(game.state("x")).toMatchObject({ damage: 4, might: 5 });
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("x")).toMatchObject({ damage: 0, might: 3, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });
});
