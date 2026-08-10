/**
 * Ruling ff159556ab955bf4 — Crackshot Corsair (OGN-130 → ogn-130-298) · Body · [3] · 3 Might · "When I attack, deal 1 to an enemy unit here."
 *   × Warwick, Hunter (OGN-159 → ogn-159-298) · Body · [6][body] · 5 Might · "I enter ready. When I attack, kill all damaged enemy
 *     units here."
 *
 * Q: Can Corsair and Warwick combo so that Warwick kills the unit Corsair just pinged?
 * A: Yes. Attacking together, both "When I attack" triggers happen simultaneously and their controller ORDERS them: put Corsair's
 *    first (deal 1), then Warwick's resolves and kills every damaged enemy unit there — including the freshly pinged one.
 * Rules: 383.3.d (simultaneous triggers of one controller — that player orders them), 340 (LIFO resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CORSAIR = "ogn-130-298";
const WARWICK = "ogn-159-298";

/** P1's turn. P2 holds bf1 with an undamaged 4-Might Brute. Corsair and Warwick ready in P1's base. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Brute" }, "brute")
    .unit(P1, "base", CORSAIR, "corsair")
    .unit(P1, "base", WARWICK, "ww");
}

/** Both attack bf1 in one Standard Move; Corsair's lone target (Brute) is bound; stop at P1's trigger-order offer. */
async function attackTogether(game: Game): Promise<void> {
  await game.p1.move(["corsair", "ww"], "bf1");
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    await game.p1.pick("brute"); // Corsair's "an enemy unit here"
  }
  expect(game.state("corsair").combatRole).toBe("attacker");
  expect(game.state("ww").combatRole).toBe("attacker");
  expect(game.chain().map((c) => c.cardId).toSorted()).toEqual(["corsair", "ww"]);
  expect(game.chain().every((c) => c.triggered && c.controller === P1)).toBe(true);
}

/** Pass priority until the chain has shrunk by one. */
async function resolveTop(game: Game): Promise<void> {
  const before = game.chain().length;
  for (let i = 0; i < 4 && game.chain().length >= before; i++) {
    await game.acting().passPriority();
  }
  expect(game.chain()).toHaveLength(before - 1);
}

describe("Ruling ff159556ab955bf4 — order Corsair's ping before Warwick's cull and Warwick kills the pinged unit", () => {
  test("both 'When I attack' triggers hit the chain together and P1 (their controller) is offered to ORDER them (383.3.d)", async () => {
    const game = await board().build();
    await attackTogether(game);
    expect(game.decision()).toMatchObject({ defaultable: true, kind: "order", seat: P1 });
    const d = game.decision();
    expect(d?.kind === "order" ? d.items.map((o) => o.card ?? o.key).toSorted() : []).toEqual(["corsair", "ww"]);
  });

  test("ordering Corsair on TOP: it resolves first (Brute takes 1), then Warwick's 'kill all damaged enemy units here' kills the Brute — before any combat damage", async () => {
    const game = await board().build();
    await attackTogether(game);
    await game.p1.order(["ww", "corsair"]); // first = bottom … last = top (resolves first)
    expect(game.chain().map((c) => c.cardId)).toEqual(["ww", "corsair"]);
    await resolveTop(game); // Corsair: deal 1
    expect(game.state("brute")).toMatchObject({ damage: 1, zone: "battlefield-bf1" });
    await resolveTop(game); // Warwick: kill all damaged enemy units here
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.state("corsair").damage).toBe(0); // no combat has happened yet
    expect(game.state("ww").damage).toBe(0);
    // No defender left → P1 conquers bf1 when the showdown closes.
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — the other order (Warwick on top): Warwick resolves first with nothing damaged and kills nothing; Corsair then pings; the Brute is still standing (1 damage) when the triggers are done", async () => {
    const game = await board().build();
    await attackTogether(game);
    await game.p1.order(["corsair", "ww"]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["corsair", "ww"]);
    await resolveTop(game); // Warwick: nothing damaged → nothing dies
    expect(game.state("brute")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    await resolveTop(game); // Corsair: deal 1
    expect(game.state("brute")).toMatchObject({ damage: 1, zone: "battlefield-bf1" });
    expect(game.state("brute").combatRole).toBe("defender"); // it will fight (and only dies to the 8 combat damage later)
  });
});
