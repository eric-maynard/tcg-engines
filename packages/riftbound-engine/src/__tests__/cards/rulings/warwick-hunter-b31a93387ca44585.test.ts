/**
 * Ruling b31a93387ca44585 — Warwick, Hunter (OGN-159 → ogn-159-298) "I enter ready. When I attack, kill all damaged enemy
 *   units here." × Anivia, Primal (OGN-148 → ogn-148-298) "When I attack, deal 3 to all enemy units here."
 *
 * Q: With both attacking, can you order the triggers so Anivia damages first and Warwick then kills the damaged units —
 *    or does Warwick's ability not trigger because nothing is damaged yet?
 * A: Both abilities trigger and go on the chain regardless of board state (they don't target; they select
 *    programmatically on resolution). The controller chooses the order: Warwick first (bottom), Anivia on top →
 *    Anivia resolves first (3 to each), then Warwick kills the now-damaged units.
 * Rules: 383.3.d (controller orders simultaneous triggers), 340 (LIFO), 355.10.d (programmatic selection ≠ target).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WARWICK = "ogn-159-298";
const ANIVIA = "ogn-148-298";

/** P1's turn. P2 holds bf1 with two UNDAMAGED 6-Might Brutes. Warwick + Anivia ready in P1's base. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 6, name: "Brute One" }, "b1")
    .unit(P2, "bf1", { might: 6, name: "Brute Two" }, "b2")
    .unit(P1, "base", WARWICK, "ww")
    .unit(P1, "base", ANIVIA, "anivia");
}

const ids = (game: Game) => game.chain().map((c) => c.cardId);

async function attackTogether(): Promise<Game> {
  const game = await board().build();
  expect(game.state("b1").damage).toBe(0);
  expect(game.state("b2").damage).toBe(0);
  await game.p1.move(["ww", "anivia"], "bf1");
  return game;
}

function orderKey(game: Game, card: string): string {
  const d = game.decision();
  return (d?.kind === "order" ? d.items.find((i) => i.card === card)?.key : undefined) as string;
}

/** Resolve exactly the top chain item (everyone passes once around). */
async function resolveTop(game: Game): Promise<void> {
  const before = game.chain().length;
  for (let i = 0; i < 4 && game.chain().length >= before; i++) {
    await game.acting().passPriority();
  }
}

describe("Ruling b31a93387ca44585 — Warwick's trigger goes on the chain even with nothing damaged; ordering it under Anivia's makes it lethal", () => {
  test("BOTH 'When I attack' abilities trigger although no enemy is damaged yet, and P1 (their controller) is asked to ORDER them", async () => {
    const game = await attackTogether();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "order", seat: P1 });
    expect(d?.kind === "order" ? d.items.map((i) => i.card).sort() : []).toEqual(["anivia", "ww"]);
  });

  test("Warwick first (bottom), Anivia on top: Anivia resolves first — 3 to each Brute — then Warwick resolves and kills both damaged Brutes", async () => {
    const game = await attackTogether();
    await game.p1.order([orderKey(game, "ww"), orderKey(game, "anivia")]);
    expect(ids(game)).toEqual(["ww", "anivia"]); // bottom → top
    await resolveTop(game); // Anivia
    expect(ids(game)).toEqual(["ww"]);
    expect(game.state("b1")).toMatchObject({ damage: 3, zone: "battlefield-bf1" });
    expect(game.state("b2")).toMatchObject({ damage: 3, zone: "battlefield-bf1" });
    await resolveTop(game); // Warwick — its condition is checked NOW, at resolution
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("b1")).toBe("trash");
    expect(game.zoneOf("b2")).toBe("trash");
    expect(game.state("ww").damage).toBe(0);
    expect(game.state("anivia").damage).toBe(0);
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — Anivia first (bottom), Warwick on top: Warwick resolves with nothing damaged and kills nothing; Anivia then deals 3 and both Brutes survive the triggers", async () => {
    const game = await attackTogether();
    await game.p1.order([orderKey(game, "anivia"), orderKey(game, "ww")]);
    expect(ids(game)).toEqual(["anivia", "ww"]);
    await resolveTop(game); // Warwick
    expect(game.zoneOf("b1")).toBe("battlefield-bf1");
    expect(game.zoneOf("b2")).toBe("battlefield-bf1");
    expect(game.state("b1").damage).toBe(0);
    await resolveTop(game); // Anivia
    expect(game.chain()).toEqual([]);
    expect(game.state("b1")).toMatchObject({ damage: 3, zone: "battlefield-bf1" });
    expect(game.state("b2")).toMatchObject({ damage: 3, zone: "battlefield-bf1" });
  });
});

void P2;
