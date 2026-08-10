/**
 * Ruling f4cbafedc851dd5d — Arcane Shift (SFD-200 → sfd-200-221) · Action · Mind/Chaos · [3][rainbow]
 *     "Banish a friendly unit, then its owner plays it, ignoring its cost. Deal 3 to an enemy unit at a battlefield. Banish this."
 *   × Fizz, Trickster (SFD-140 → sfd-140-221) · [3][chaos] · 3 Might · "When you play me, you may play a spell from your trash
 *     with Energy cost no more than [3], ignoring its Energy cost. Recycle that spell after you play it."
 *
 * Q: What does the chain look like when I Arcane Shift my own Fizz?
 * A: Arcane Shift is the only chain item; as it resolves Fizz is banished and replayed (a unit never sits on the chain), his
 *    WYPM trigger is ADDED as a pending item on top of the still-resolving Shift, the Shift then deals its 3 and banishes
 *    ITSELF; only afterwards does Fizz's trigger resolve. Fizz can never pick the Arcane Shift just cast — it is in
 *    banishment, not the trash. In a showdown the trigger still goes on the chain; once everything resolves Focus is back
 *    with its holder.
 * Rules: 336.1/359 (resolve an item entirely), 356.2 (units leave the chain immediately), 383.2.c (triggers added while an
 *        item resolves wait), 340 (LIFO), Fizz "from your trash".
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ARCANE_SHIFT = "sfd-200-221";
const FIZZ = "sfd-140-221";
const DISCIPLINE = "ogn-058-298"; // [2] Reaction in the trash — two copies so Fizz's replay pick is a real prompt

/** P1's turn. Fizz in P1's base; P2's Wall (5) holds bf1; two Disciplines in P1's trash; exactly [3][rainbow]. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", FIZZ, "fizz")
    .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
    .trash(P1, DISCIPLINE, "disc")
    .trash(P1, DISCIPLINE, "disc2")
    .hand(P1, ARCANE_SHIFT, "shift");
}

const isFizzOptIn = (d: Decision | null) => d?.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "fizz";

/** Cast Arcane Shift [fizz, wall]; both pass; answer the replay's destination (base); stop at Fizz's "you may". */
async function shiftUntilFizzOptIn(game: Game): Promise<void> {
  await game.p1.cast("shift", { targets: ["fizz", "wall"] });
  // Step 1: Arcane Shift is a finalized chain item — the ONLY item.
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "shift", controller: P1, triggered: false })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  for (let i = 0; i < 6 && !isFizzOptIn(game.decision()); i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.semantics === "destination") {
      expect(d.seat).toBe(P1); // "its owner plays it"
      await game.p1.pick("base");
    } else if (d?.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  expect(isFizzOptIn(game.decision())).toBe(true);
}

describe("Ruling f4cbafedc851dd5d — the chain when Arcane Shift targets your own Fizz", () => {
  test("steps 2–3: as the Shift resolves Fizz goes board → banishment → board again as a played unit; he is never a chain item", async () => {
    const game = await board().build();
    await game.p1.cast("shift", { targets: ["fizz", "wall"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    // Mid-resolution snapshot (the replay asks its owner where to put Fizz): Fizz is in banishment right now.
    const d = game.decision();
    if (d?.kind === "pick" && d.semantics === "destination") {
      expect(game.zoneOf("fizz")).toBe("banishment");
      await game.p1.pick("base");
    }
    expect(game.zoneOf("fizz")).toBe("base");
    expect(game.chain().some((c) => c.cardId === "fizz" && !c.triggered)).toBe(false); // no "unit" item ever
    expect(game.p1.energy()).toBe(0); // replayed ignoring cost
  });

  test("steps 4–6: Fizz's WYPM is added on top of the resolving Shift, which still deals 3 to the Wall and banishes ITSELF before Fizz's ability asks anything", async () => {
    const game = await board().build();
    await shiftUntilFizzOptIn(game);
    expect(game.state("wall").damage).toBe(3);
    expect(game.zoneOf("shift")).toBe("banishment");
    expect(game.p1.trash()).not.toContain("shift"); // it never touched the trash
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fizz", controller: P1, triggered: true })]);
    expect(game.zoneOf("disc")).toBe("trash"); // Fizz's ability has not resolved yet
  });

  test("step 7 + nuance: Fizz's replay choice offers the trash spell (Discipline) and NOT the Arcane Shift just cast (it is banished, not in the trash)", async () => {
    const game = await board().build();
    await shiftUntilFizzOptIn(game);
    await game.p1.yes();
    let offered: string[] = [];
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick" && d.options.some((o) => (o.card ?? o.key) === "disc")) {
        offered = d.options.map((o) => (o.card ?? o.key) as string);
        await game.p1.pick("disc");
      } else if (d.kind === "pick" && d.semantics === "target") {
        await game.p1.pick("fizz"); // Discipline's +2 on Fizz
      } else if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(offered.toSorted()).toEqual(["disc", "disc2"]);
    expect(offered).not.toContain("shift");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("fizz").might).toBe(5);
    expect(game.zoneOf("disc")).toBe("mainDeck"); // recycled after being played
    expect(game.zoneOf("shift")).toBe("banishment");
    expect(game.violations()).toEqual([]);
  });

  // RULING-CONFLICT: riftjudge f4cbafedc851dd5d says that once the chain is empty "focus returns to the player who currently
  // has it"; CR 340.2.a says that when a chain that was started by a SPELL (not a triggered/Add ability) empties during a
  // showdown, Focus passes to the next player in turn order — engine follows CR (the showdown stays open either way).
  test("showdown timing: cast with Focus during a showdown, Fizz's Reaction-speed trigger still lands on the chain in the Closed state; once the whole chain is gone the showdown is Open again and (340.2.a) Focus has passed to P2", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "base", FIZZ, "fizz")
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
      .trash(P1, DISCIPLINE, "disc")
      .trash(P1, DISCIPLINE, "disc2")
      .hand(P1, ARCANE_SHIFT, "shift")
      .build();
    await game.p1.move("scout", "bf2"); // open battlefield → non-combat showdown, P1 has Focus
    const sd = () => game.gameState.interaction?.showdownStack?.at(-1);
    expect(sd()).toMatchObject({ active: true, battlefieldId: "bf2", focusPlayer: P1 });
    expect(game.p1.can("cast", "shift")).toBe(true);
    await shiftUntilFizzOptIn(game);
    expect(sd()?.active).toBe(true); // still inside the showdown
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fizz", triggered: true })]);
    await game.p1.no(); // decline the replay; the item leaves, chain empties
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(sd()).toMatchObject({ active: true, battlefieldId: "bf2", focusPlayer: P2 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.state("wall").damage).toBe(3);
    expect(game.zoneOf("fizz")).toBe("base");
  });
});
