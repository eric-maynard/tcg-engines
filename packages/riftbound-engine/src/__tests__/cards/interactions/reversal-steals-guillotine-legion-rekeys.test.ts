/**
 * Interaction: Noxian Guillotine (ogn-254-298) × Mystic Reversal (ogn-080-298) × Wind Wall (ogn-064-298)
 *
 *   Noxian Guillotine — Fury/Order spell, 4 + [C], [Action]: "Choose a unit. Kill it the next time it takes
 *     damage this turn. [Legion] — Kill it now instead. (Get the effect if you've played another card this turn.)"
 *   Mystic Reversal — Calm spell, 4 + [calm]x3, [Reaction]: "Gain control of a spell. You may make new choices for it."
 *   Wind Wall — Calm spell, 3 + [calm]x2, [Reaction]: "Counter a spell."
 *
 * Question: P1 (nothing else played this turn → Legion OFF) Guillotines P2's X. (a) P2 Mystic-Reverses it
 * and re-chooses P1's V: whose "you" does [Legion] read at resolution — P1 (played nothing else) or P2 (who
 * just finalized Mystic Reversal)? Is V killed now or is only the delayed kill armed, who would control it,
 * and whose trash does Guillotine go to? (b) P2 Wind Walls it instead: does X die when it later takes 2?
 * (c) Nobody responds: Guillotine (Legion off) is in the trash when X takes 1 this turn — does X die? And if
 * X takes no damage until next turn?
 *
 * Rules: 192 / 191.2 (the spell's controller changed — contrast 191.4.b, abilities only), 812.1.c + 419.4.b
 * + 727.1.b.2 (Legion = "a different card Finalized by you this turn", evaluated when it matters), 158.2
 * (Legion's "instead" replaces the delayed instruction), 425.1.b/c (countered: never resolved, no refund),
 * 390.2 / 391 / 392 (delayed ability lives independently of the spell card, window = this turn), 359.3.e.2.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUILLOTINE = "ogn-254-298";
const REVERSAL = "ogn-080-298";
const WIND_WALL = "ogn-064-298";
/** Inline 0-cost damage spells so later damage needs no extra resources (and is clearly "another card" only AFTER Guillotine). */
const BOLT1 = { abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }], cardType: "spell", domain: "fury", energyCost: 0, name: "Bolt One", timing: "action" };
const BOLT2 = { abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }], cardType: "spell", domain: "fury", energyCost: 0, name: "Bolt Two", timing: "action" };

interface DelayedEntry {
  readonly owner?: string;
  readonly sourceCardId?: string;
  readonly targetCardIds?: readonly string[];
  readonly replaces?: string;
}
/** The engine keeps Guillotine's "kill it the next time it takes damage this turn" as a public delayed entry. */
function delayedKills(game: Game): DelayedEntry[] {
  const all = ((game.gameState as unknown as { activeReplacements?: DelayedEntry[] }).activeReplacements ?? []) as DelayedEntry[];
  return all.filter((e) => e.sourceCardId === "guil");
}

/**
 * P1's turn; P1 has finalized nothing this turn. P2's X (5) holds bf1, P1's V (4) holds bf2.
 * P1: exactly Guillotine's cost (4 + fury) + two free bolts. P2: enough for Reversal (4+ccc) or Wind Wall (3+cc).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { fury: 1 } })
    .resources(P2, { energy: 7, power: { calm: 5 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 5, name: "Xerxes" }, "X")
    .unit(P1, "bf2", { might: 4, name: "Victor" }, "V")
    .hand(P1, GUILLOTINE, "guil")
    .hand(P1, BOLT1, "bolt1")
    .hand(P1, BOLT2, "bolt2")
    .hand(P2, REVERSAL, "rev")
    .hand(P2, WIND_WALL, "ww");
}

/** P1 Guillotines X, passes; P2 Reverses; both pass so Reversal resolves → P2's NEW CHOICES pick is open. */
async function stealGuillotine(game: Game): Promise<void> {
  expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0); // Legion OFF for P1 at cast time
  await game.p1.cast("guil", { targets: "X" });
  await game.p1.pass();
  await game.p2.cast("rev", { targets: "guil" });
  await game.p2.pass();
  await game.p1.pass();
}

async function resolveChain(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    await game.acting().pass();
  }
  expect(game.chain()).toEqual([]);
}

describe("Mystic Reversal steals Noxian Guillotine — Legion re-keys to the new controller", () => {
  test("(a) Reversal's only legal object is the Guillotine on the chain; P2's view shows Reversal → Guillotine → X while both are pending", async () => {
    const game = await board().build();
    await game.p1.cast("guil", { targets: "X" });
    await game.p1.pass();
    const field = game.p2.option("cast", "rev")?.fields.find((f) => f.name === "targets");
    expect((field?.options ?? []).flat()).toEqual(["guil"]);
    await game.p2.cast("rev", { targets: "guil" });
    expect(game.p2.view().chain).toEqual([
      expect.objectContaining({ cardId: "guil", controller: P1, targets: ["X"] }),
      expect.objectContaining({ cardId: "rev", controller: P2, targets: ["guil"] }),
    ]);
  });

  test("(a) on Reversal's resolution the CHAIN ITEM changes controller to P2 (192/191.2) and P2 — not P1 — is offered new choices: keep X or re-choose V ('a unit' → the thief's own-side V is legal)", async () => {
    const game = await board().build();
    await stealGuillotine(game);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "guil", controller: P2 })]);
    expect(game.zoneOf("rev")).toBe("trash");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2, source: { cardId: "guil", pendingChoiceType: "new-choices" } });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["V", "X"]);
    expect(d?.kind === "pick" ? d.options.find((o) => o.card === "X")?.current : undefined).toBe(true);
    await game.p2.pick("V");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "guil", controller: P2, targets: ["V"] })]);
  });

  test("(a) Legion reads the NEW controller's finalized cards — P2 finalized Mystic Reversal, so 'Kill it now instead' applies: V dies on resolution and NO delayed kill is armed (812.1.c, 419.4.b, 158.2)", async () => {
    // Expected: V → P1's trash immediately; activeReplacements has nothing from Guillotine.
    // Actual: the engine's Legion check wants ≥2 plays for a spell resolving from the chain (it assumes the
    // spell itself was tallied for its controller); the stolen Guillotine was never P2's play, so P2's single
    // Reversal reads as "no other card" → Legion off → only the delayed kill is armed and V survives.
    const game = await board().build();
    await stealGuillotine(game);
    await game.p2.pick("V");
    await resolveChain(game);
    expect(game.zoneOf("V")).toBe("trash");
    expect(delayedKills(game)).toEqual([]);
  });

  test("(a) whatever the Legion verdict, X is off the hook (re-chosen away) and Guillotine lands in its OWNER's (P1's) trash, Reversal in P2's", async () => {
    const game = await board().build();
    await stealGuillotine(game);
    await game.p2.pick("V");
    await resolveChain(game);
    expect(game.zoneOf("X")).toBe("battlefield-bf1");
    expect(delayedKills(game).filter((e) => e.targetCardIds?.includes("X"))).toEqual([]);
    expect(game.zoneOf("guil")).toBe("trash");
    expect(game.state("guil").owner).toBe(P1);
    expect(game.p1.trash()).toContain("guil");
    expect(game.p2.trash()).toEqual(["rev"]);
    // X taking damage later this turn does nothing special.
    await game.p1.cast("bolt2", { targets: "X" });
    await game.settle();
    expect(game.zoneOf("X")).toBe("battlefield-bf1");
    expect(game.state("X").damage).toBe(2);
  });

  test("(a, 392) anything Guillotine armed against V after the steal is controlled by P2 (created by a P2-controlled spell), never by P1", async () => {
    const game = await board().build();
    await stealGuillotine(game);
    await game.p2.pick("V");
    await resolveChain(game);
    const armed = delayedKills(game).filter((e) => e.targetCardIds?.includes("V"));
    expect(armed.every((e) => e.owner === P2)).toBe(true);
    expect(armed.some((e) => e.owner === P1)).toBe(false);
  });

  test("(a) P2 may also KEEP X (decline the new choice): Guillotine still resolves under P2's control against X", async () => {
    const game = await board().build();
    await stealGuillotine(game);
    await game.p2.decline();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "guil", controller: P2, targets: ["X"] })]);
    await resolveChain(game);
    expect(game.zoneOf("guil")).toBe("trash");
    expect(game.zoneOf("V")).toBe("battlefield-bf2");
  });

  test("(b) Wind Wall counters Guillotine: it never resolved → no delayed kill exists (425.1.b, 390.2/392); X later takes 2 and just has 2 damage; P1's 4 + [fury] are not refunded (425.1.c)", async () => {
    const game = await board().build();
    await game.p1.cast("guil", { targets: "X" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.p1.pass();
    await game.p2.cast("ww", { targets: "guil" });
    await game.settle();
    expect(game.zoneOf("guil")).toBe("trash");
    expect(game.zoneOf("ww")).toBe("trash");
    expect(delayedKills(game)).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.p1.cast("bolt2", { targets: "X" });
    await game.settle();
    expect(game.zoneOf("X")).toBe("battlefield-bf1");
    expect(game.state("X").damage).toBe(2);
  });

  test("(c) nobody responds: Legion OFF at resolution → the delayed 'kill X the next time it takes damage this turn' is armed under P1, Guillotine already in the trash", async () => {
    const game = await board().build();
    await game.p1.cast("guil", { targets: "X" });
    await game.settle();
    expect(game.zoneOf("guil")).toBe("trash");
    expect(game.zoneOf("X")).toBe("battlefield-bf1");
    expect(game.state("X").damage).toBe(0);
    expect(delayedKills(game)).toEqual([expect.objectContaining({ owner: P1, targetCardIds: ["X"] })]);
  });

  test("(c) …and it exists independently of the spell card (392): X takes 1 (non-lethal for 5 Might) this turn → X is killed", async () => {
    const game = await board().build();
    await game.p1.cast("guil", { targets: "X" });
    await game.settle();
    await game.p1.cast("bolt1", { targets: "X" });
    await game.settle();
    expect(game.zoneOf("X")).toBe("trash");
    expect(game.p2.trash()).toContain("X");
    expect(delayedKills(game)).toEqual([]); // single-fire, consumed
  });

  test("(c) …but its window is 'this turn' (391): no damage before end of turn → the delayed kill lapses; on P1's next turn X takes 1 and survives with 1 damage", async () => {
    const game = await board().build();
    await game.p1.cast("guil", { targets: "X" });
    await game.settle();
    await game.advanceTurn(); // → P2
    expect(delayedKills(game)).toEqual([]);
    await game.advanceTurn(); // → P1
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.cast("bolt1", { targets: "X" });
    await game.settle();
    expect(game.zoneOf("X")).toBe("battlefield-bf1");
    expect(game.state("X").damage).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
