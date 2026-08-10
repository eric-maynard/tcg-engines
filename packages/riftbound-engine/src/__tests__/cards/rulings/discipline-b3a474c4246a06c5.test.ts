/**
 * Ruling b3a474c4246a06c5 — Discipline (OGN-058 → ogn-058-298) · Spell · Calm · 2 · [Reaction] "Give a unit +2 [Might] this turn. Draw 1."
 *   × The Dreaming Tree (OGN-292 → ogn-292-298) · Battlefield "When a player chooses a friendly unit here with a spell for
 *     the first time each turn, they draw 1."
 *
 * Q: In a showdown at the Tree I Discipline my unit and draw a second Discipline off it — can I cast that one in the same
 *    chain, and when does the Tree's draw happen?
 * A: The Tree trigger goes on the chain immediately above Discipline and resolves first. You CAN play the second copy, but
 *    only after Focus has passed to the opponent (the chain closed) and come back to you when they pass.
 * Rules: 383.4.b.2 (targeting trigger on finalize), 340.1 (LIFO), 346 / 347.1.b (chain closes → Focus passes),
 *        347.2.b (pass → Focus to next player), 383.3.e ("first time each turn").
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DISCIPLINE = "ogn-058-298";
const DREAMING_TREE = "ogn-292-298";

/**
 * P1's turn. bf1 = The Dreaming Tree (live) held by P2 with a 2-Might Guard. P1's Ally (3) is ready in base, one
 * Discipline in hand and a SECOND Discipline on top of the deck; [4] energy covers both.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4 })
    .battlefield("bf1", { controller: P2, def: DREAMING_TREE, inert: false })
    .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
    .hand(P1, DISCIPLINE, "disc1")
    .deckTop(P1, DISCIPLINE, "disc2");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Ally attacks the Tree; P1 (Focus) casts Discipline #1 on Ally. Stops right after the cast. */
async function attackAndDiscipline(game: Game): Promise<void> {
  await game.p1.move("ally", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("disc1", { targets: "ally" });
}

/** Pass chain priority for whoever holds it until the chain is empty (bounded). */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 10 && game.chain().length > 0; i++) {
    const d = game.decision();
    if (d?.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
}

describe("Ruling b3a474c4246a06c5 — Discipline at the Dreaming Tree mid-showdown: Tree draw stacks on top; the drawn second copy waits for Focus to come back", () => {
  test("casting Discipline on Ally at the Tree immediately puts the Tree's draw trigger on the chain ABOVE Discipline (P1's item)", async () => {
    const game = await board().build();
    await attackAndDiscipline(game);
    expect(game.chain().map((c) => c.cardId)).toEqual(["disc1", "bf1"]);
    expect(game.chain()[1]).toMatchObject({ cardId: "bf1", controller: P1, triggered: true });
    expect(game.p1.energy()).toBe(2);
  });

  test("LIFO: the Tree draw resolves first (P1 draws disc2 while Discipline is still on the chain), then Discipline resolves: Ally +2 (→ 5) and its own draw", async () => {
    const game = await board().build();
    const deck0 = game.p1.deck().length;
    await attackAndDiscipline(game);
    // Resolve just the top item.
    for (let i = 0; i < 6 && game.chain().some((c) => c.cardId === "bf1"); i++) {
      await game.acting().passPriority();
    }
    expect(game.p1.hand()).toContain("disc2");
    expect(game.chain().map((c) => c.cardId)).toEqual(["disc1"]);
    expect(game.state("ally").might).toBe(3); // Discipline not resolved yet
    await drainChain(game);
    expect(game.zoneOf("disc1")).toBe("trash");
    expect(game.state("ally")).toMatchObject({ might: 5, mightModifier: 2 });
    expect(game.p1.deck()).toHaveLength(deck0 - 2); // Tree draw + Discipline draw
  });

  test("when that chain closes Focus PASSES to P2: P1 holds disc2 and [2] but cannot cast it now — it is P2's showdown action", async () => {
    const game = await board().build();
    await attackAndDiscipline(game);
    await drainChain(game);
    expect(game.chain()).toEqual([]);
    expect(showdown(game)?.active).toBe(true);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p1.hand()).toContain("disc2");
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.can("cast", "disc2")).toBe(false);
    const r = await game.p1.try((p) => p.cast("disc2", { targets: "ally" }));
    expect(r.ok).toBe(false);
  });

  test("P2 passes → Focus returns to P1, who may now cast the second Discipline (Ally → 7); the Tree does NOT trigger a second time this turn", async () => {
    const game = await board().build();
    const deck0 = game.p1.deck().length;
    await attackAndDiscipline(game);
    await drainChain(game);
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "disc2")).toBe(true);
    await game.p1.cast("disc2", { targets: "ally" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["disc2"]); // "first time each turn" already spent
    await drainChain(game);
    expect(game.state("ally")).toMatchObject({ might: 7, mightModifier: 4 });
    expect(game.p1.deck()).toHaveLength(deck0 - 3); // Tree + disc1 + disc2 draws
    expect(game.p1.energy()).toBe(0);
    // Focus passed again to P2 after that chain closed.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
