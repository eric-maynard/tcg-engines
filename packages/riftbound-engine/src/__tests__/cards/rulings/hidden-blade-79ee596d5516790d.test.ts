/**
 * Ruling 79ee596d5516790d — Hidden Blade (OGN-213 → ogn-213-298) · [Hidden][Action] · 2 + [order] · "Kill a unit at a battlefield.
 *   Its controller draws 2."   × The Dreaming Tree (OGN-292 → ogn-292-298) · Battlefield · "When a player chooses a friendly unit
 *   here with a spell for the first time each turn, they draw 1."   (Cull sfd-134 / Divine Judgment ogn-244 are only cited as
 *   "choose ≠ target" counter-examples.)
 *
 * Q: I Hidden Blade my OWN unit at The Dreaming Tree — 2 or 3 cards total?
 * A: 3. Choosing my friendly unit there with a spell triggers the Tree (finalized on the chain above the Blade); it resolves
 *    first (draw 1), then Hidden Blade kills my unit and I — its controller — draw 2.
 * Rules: 383.4.b.2 (targeting trigger fires when the spell is finalized), 340.1 (LIFO), 355 (choose = target).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const DREAMING_TREE = "ogn-292-298";

/** P1's turn 3. P1 controls the live Dreaming Tree with its own 3-Might Dreamer there; Hidden Blade in hand, 2 + [order]. */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 2, power: { order: 1 } })
    .battlefield("tree", { controller: P1, def: DREAMING_TREE, inert: false })
    .unit(P1, "tree", { might: 3, name: "Dreamer" }, "dreamer")
    .unit(P1, "tree", { might: 1, name: "Keeper" }, "keeper") // keeps the Tree held afterwards
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .hand(P1, HIDDEN_BLADE, "blade")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3", "d4", "d5"]);
}

async function bladeOwnDreamer(game: Game): Promise<void> {
  await game.p1.cast("blade", { targets: "dreamer" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
}

describe("Ruling 79ee596d5516790d — Hidden Blade on my own unit at The Dreaming Tree draws 3 in total", () => {
  test("finalizing Hidden Blade on the friendly Dreamer puts the Tree's trigger on the chain ABOVE the Blade (both P1's); nothing drawn yet", async () => {
    const game = await board().build();
    await bladeOwnDreamer(game);
    const chain = game.chain();
    expect(chain.map((c) => c.cardId)).toEqual(["blade", "tree"]);
    expect(chain[0]).toMatchObject({ controller: P1, targets: ["dreamer"], triggered: false });
    expect(chain[1]).toMatchObject({ controller: P1, triggered: true });
    expect(game.p1.hand()).toEqual([]);
  });

  test("LIFO: the Tree resolves first — P1 draws 1 while the Dreamer is still alive and the Blade still pending", async () => {
    const game = await board().build();
    await bladeOwnDreamer(game);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.zoneOf("dreamer")).toBe("battlefield-tree");
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade"]);
  });

  test("then Hidden Blade resolves: the Dreamer dies and P1 (its controller) draws 2 — 3 cards total, P2 draws none", async () => {
    const game = await board().build();
    await bladeOwnDreamer(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("dreamer")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1", "d2", "d3"]);
    expect(game.p1.deck()[0]).toBe("d4");
    expect(game.p2.hand()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
