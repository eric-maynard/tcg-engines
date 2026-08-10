/**
 * Ruling 64025589c9493414 — Spectral Matron (OGN-226 → ogn-226-298) · 4 Might · [4][order][order]
 *     "When you play me, you may play a unit costing no more than [3] and no more than [rainbow] from your trash, ignoring its cost."
 *   × Promising Future (OGN-115 → ogn-115-298) — cited only as the example of what "pending" really means (cards played DURING
 *     another effect's resolution).
 *
 * Q: For Spectral Matron, must the trash target be chosen and "set aside as pending" before the opponent can react to the trigger?
 * A: The target unit in your trash IS selected as the trigger is put on the chain (playing a card from trash is a targeted
 *    ability), and the opponent then reacts with that known. But nothing becomes "pending": the unit stays in the trash and is only
 *    actually played (costs ignored) when the trigger RESOLVES.
 * Rules: 355.4 / 383.3 (a triggered ability's targets are chosen when it is finalized on the chain), 340 (opponent gets priority),
 *        346 (pending items are cards played mid-resolution — not this), 359.3 (play from trash on resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SPECTRAL_MATRON = "ogn-226-298";
const SHIPYARD_SKULKER = "ogn-175-298"; // vanilla 3-cost, 3-Might unit — a legal Matron pick
const STUPEFY = "ogn-095-298"; // P2's Reaction, to witness the react window

/** P1's turn with exactly [4][order][order]. P1's trash: Skulker (3) and a 2-cost Wisp. P2 holds Stupefy + [1]. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { order: 2 } })
    .resources(P2, { energy: 1 })
    .trash(P1, SHIPYARD_SKULKER, "skulker")
    .trash(P1, { cardType: "unit", energyCost: 2, might: 2, name: "Wisp" }, "wisp")
    .hand(P1, SPECTRAL_MATRON, "matron")
    .hand(P2, STUPEFY, "stupefy");
}

/** Play Matron to base and opt into her trigger if asked up front. */
async function playMatron(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("matron", { to: "base" });
  expect(game.zoneOf("matron")).toBe("base");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  if (game.decision()?.kind === "yes-no") {
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "matron" } });
    await game.p1.yes();
  }
  return game;
}

describe("Ruling 64025589c9493414 — Matron's trash target is chosen as the trigger goes on the chain; the unit is played only on resolution", () => {
  test("the 'when you play me' trigger goes straight onto the chain (a chain item, not a 'pending' play) and P2 gets a real reaction window against it", async () => {
    const game = await playMatron();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "matron", controller: P1, triggered: true })]);
    // Drive to P2's priority without resolving.
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("skulker");
    }
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "stupefy")).toBe(true); // the opponent can react to the trigger
    expect(game.chain().map((c) => c.cardId)).toEqual(["matron"]);
  });

  test("nothing is played early: while the trigger sits on the chain both trash units are still in the trash, no cost has been asked, and P1's board is just the Matron", async () => {
    const game = await playMatron();
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("skulker");
    }
    await game.p1.passPriority();
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.zoneOf("wisp")).toBe("trash");
    expect(game.p1.units()).toEqual(["matron"]);
  });

  // Expected: because "play a unit … from your trash" targets that unit, P1 names it (Skulker vs Wisp) as the trigger is FINALIZED —
  // before P2 ever holds priority — and the chain item carries that target. Actual: the engine puts the trigger on the chain with no
  // target and only asks "Pick a revealed card to play" after both players have passed, i.e. on resolution.
  test("ruling 64025589c9493414 — engine defers the trash-target choice to resolution instead of asking when the trigger is added to the chain", async () => {
    const game = await playMatron();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["skulker", "wisp"]);
    await game.p1.pick("skulker");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "matron", targets: ["skulker"], triggered: true })]);
    expect(game.zoneOf("skulker")).toBe("trash"); // chosen, not yet played
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // P2 reacts knowing the target
  });

  test("on resolution (both pass) the chosen Skulker is played from the trash to P1's base ignoring its cost — P1 still has 0 resources; the Wisp stays in the trash", async () => {
    const game = await playMatron();
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick" && d.seat === P1) {
        await game.p1.pick("skulker");
      } else if (d.kind === "action") {
        await game.seat(d.seat).passPriority();
      } else if (d.kind === "yes-no" && d.seat === P1) {
        await game.p1.yes();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("skulker")).toBe("base");
    expect(game.zoneOf("wisp")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } }); // "ignoring its cost"
    expect(game.p1.units().sort()).toEqual(["matron", "skulker"]);
    expect(game.violations()).toEqual([]);
  });
});
