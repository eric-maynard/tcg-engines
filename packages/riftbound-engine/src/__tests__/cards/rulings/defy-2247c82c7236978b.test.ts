/**
 * Ruling 2247c82c7236978b — Defy (OGN-045 → ogn-045-298) · Reaction · [1]+[calm] · "Counter a spell that costs no more
 *     than [4] and no more than [rainbow]."
 *   × Discipline (OGN-058 → ogn-058-298) · Reaction · [2] · "Give a unit +2 [Might] this turn. Draw 1."
 *   Action used to open the chain: Cleave (ogn-004-298) · Action · [1] · "Give a unit [Assault 3] this turn."
 *
 * Q: In a showdown, when can Actions vs Reactions be played, and how do focus/priority work while a chain resolves?
 * A: An Action may only START a chain (empty chain, you hold focus); Reactions may be added any time. The chain
 *    starter keeps priority and may stack their own Reactions, then passes; the opponent may add Reactions. Links
 *    resolve top-down; before each next link the owner of that link gets priority first, then the other player —
 *    so a card drawn off a resolving Discipline (e.g. Defy) can be played before the next link, and Defy may target
 *    ANY legal spell on the chain, not just the newest. When the chain empties, focus passes to the opponent; the
 *    showdown ends only when both pass on an empty chain.
 * Rules: 336–341 (chain, priority, Action/Reaction timing), 464.3 (focus in showdowns), 412 (Counter).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const DISCIPLINE = "ogn-058-298";
const CLEAVE = "ogn-004-298";

/**
 * P1's turn. P2 holds bf1 with Guard (3). P1: Striker (3) in base, Cleave + Discipline in hand, [3].
 * P2: Discipline in hand, Defy on TOP of the deck, [3] + [calm].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .resources(P2, { energy: 3, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 3, name: "Striker" }, "striker")
    .hand(P1, CLEAVE, "cleave")
    .hand(P1, DISCIPLINE, "disc1")
    .hand(P2, DISCIPLINE, "disc2")
    .deck(P2, [DEFY], ["defy"]);
}

function castTargets(game: Game, seat: "p1" | "p2", alias: string): string[] {
  const field = game[seat].option("cast", alias)?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : v === null ? [] : [v]) as string[]))];
}

/** Striker attacks; P1 opens a chain with Cleave, stacks Discipline, passes; P2 adds Discipline on the Guard and passes. */
async function threeLinkChain(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("striker", "bf1");
  await game.p1.cast("cleave", { targets: "striker" });
  await game.p1.cast("disc1", { targets: "striker" });
  await game.p1.passPriority();
  await game.p2.cast("disc2", { targets: "guard" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "disc1", "disc2"]);
  return game;
}

describe("Ruling 2247c82c7236978b — Action vs Reaction timing and priority/focus through a showdown chain", () => {
  test("the attacker (P1) holds focus and STARTS a chain with an Action (Cleave); P1 keeps priority and may stack their own Reaction (Discipline) before passing", async () => {
    const game = await board().build();
    await game.p1.move("striker", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "cleave")).toBe(true); // Action: empty chain + focus
    await game.p1.cast("cleave", { targets: "striker" });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // starter retains priority
    expect(game.p1.can("cast", "disc1")).toBe(true); // Reaction onto own chain
    await game.p1.cast("disc1", { targets: "striker" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "disc1"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("once P1 passes, P2 may add Reactions (Discipline) — but could not have added an Action to the open chain", async () => {
    const game = await board().build();
    await game.p1.move("striker", "bf1");
    await game.p1.cast("cleave", { targets: "striker" });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "disc2")).toBe(true);
    // (P2 holds no Action here; the Action-can't-join rule is what kept Cleave start-only for P1 above.)
    await game.p2.cast("disc2", { targets: "guard" });
    expect(game.chain().at(-1)).toMatchObject({ cardId: "disc2", controller: P2 });
  });

  test("links resolve top-down and BOTH players get priority before each next link, its owner first: P2's Discipline resolves (Guard +2, P2 draws Defy) → for P1's Discipline, P1 is asked first, then P2 — who may now cast the just-drawn Defy", async () => {
    const game = await threeLinkChain();
    await game.p2.passPriority();
    await game.p1.passPriority(); // disc2 resolves
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "disc1"]);
    expect(game.state("guard").might).toBe(5);
    expect(game.p2.hand()).toContain("defy"); // drawn mid-chain
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // owner of the next link first
    expect(game.p2.legal()).toEqual([]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "defy")).toBe(true); // playable before the next link resolves
  });

  test("Defy may target ANY legal spell on the chain — both Cleave (bottom) and P1's Discipline are offered; P2 counters Cleave, the non-top link", async () => {
    const game = await threeLinkChain();
    await game.p2.passPriority();
    await game.p1.passPriority();
    await game.p1.passPriority();
    expect(castTargets(game, "p2", "defy").sort()).toEqual(["cleave", "disc1"]);
    await game.p2.cast("defy", { targets: "cleave" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "disc1", "defy"]);
    // Defy resolves → Cleave countered; then P1's Discipline resolves (Striker +2, P1 draws); Cleave never grants Assault.
    const p1Hand = game.p1.hand().length;
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      const d = game.decision();
      expect(d).toMatchObject({ context: "chain", kind: "action" });
      await game.seat(d!.seat).passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.zoneOf("disc1")).toBe("trash");
    expect(game.state("striker").grantedKeywords.some((k) => k.keyword === "Assault")).toBe(false);
    expect(game.state("striker").might).toBe(5); // 3 + Discipline
    expect(game.p1.hand()).toHaveLength(p1Hand + 1);
  });

  test("when the last link resolves, focus passes automatically to the OPPONENT (P2) with the showdown still open; it ends only after both pass on an empty chain → combat 5 v 5, both die, P1 conquers nothing", async () => {
    const game = await threeLinkChain();
    await game.p2.passPriority();
    await game.p1.passPriority();
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "cleave" });
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      await game.seat(game.decision()!.seat).passPriority();
    }
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 }); // one pass is not enough
    await game.p1.passFocus();
    await game.settle();
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.zoneOf("striker")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1); // no attacker survived: nothing conquered
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
