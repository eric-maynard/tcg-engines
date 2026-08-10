/**
 * Ruling c03a80e4d1ea8efd — Dusk Rose Lab (UNL-209 → unl-209-219, Battlefield) "At the start of your Beginning Phase, you may kill a
 *     unit you control here to draw 1. (This happens before scoring.)"
 *   × Sprite (OGN-274 → ogn-274-298, 3-Might unit token) "[Temporary] (Kill me at the start of your Beginning Phase, before scoring.)"
 *
 * Q: Can you use Dusk Rose Lab to kill a Sprite before its Temporary kills it, to draw a card?
 * A: Yes. Both trigger at the start of your Beginning Phase; Temporary uses the chain, so there is a window. You resolve the Lab's
 *    ability first, killing the Sprite as its cost and drawing 1; the Temporary trigger then finds no Sprite and does nothing.
 * Rules: 383.3.d (simultaneous triggers — controller orders), 383.3.b / 404.1 (the kill is the Lab's cost), 359.3.e (an
 *        instruction whose object is gone is ignored), 186.1 (a killed token ceases to exist), 741 (Temporary).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DUSK_ROSE_LAB = "unl-209-219";
const SPRITE = "ogn-274-298";

/** End of P2's turn 2. P1 controls the live Dusk Rose Lab with a lone Sprite token on it; P1's hand is empty. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("lab", { controller: P1, def: DUSK_ROSE_LAB, inert: false, owner: P1 })
    .unit(P1, "lab", SPRITE, "sprite")
    .unit(P2, "base", { might: 3, name: "Theirs" }, "theirs");
}

interface Run {
  readonly game: Game;
  readonly prompts: { kind: Decision["kind"]; seat: string; chain: string[]; spriteOnBoard: boolean }[];
}

/** P2 ends the turn; P1 opts into the Lab (killing the Sprite), orders the Lab's item to resolve first, everyone passes. */
async function labEatsSprite(optIn: boolean): Promise<Run> {
  const game = await board().build();
  expect(game.state("sprite")).toMatchObject({ isToken: true, keywords: expect.arrayContaining(["Temporary"]) });
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  const prompts: Run["prompts"] = [];
  for (let i = 0; i < 20; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    prompts.push({ chain: game.chain().map((c) => c.cardId), kind: d.kind, seat: d.seat, spriteOnBoard: game.has("sprite") && game.zoneOf("sprite") === "battlefield-lab" });
    if (d.kind === "yes-no" && d.seat === P1) {
      await (optIn ? game.p1.yes() : game.p1.no());
    } else if (d.kind === "pick" && d.seat === P1) {
      await game.p1.pick("sprite");
    } else if (d.kind === "order") {
      expect(d.seat).toBe(P1);
      const keys = d.items.map((it) => it.key);
      const lab = d.items.find((it) => it.card === "lab")?.key ?? keys[keys.length - 1]!;
      await game.p1.order([...keys.filter((k) => k !== lab), lab]); // Lab last = top → resolves first
    } else if (d.kind === "action") {
      await game.seat(d.seat).pass();
    } else {
      break;
    }
  }
  return { game, prompts };
}

describe("Ruling c03a80e4d1ea8efd — Dusk Rose Lab can eat a Temporary Sprite for a card before Temporary gets it", () => {
  test("at the start of P1's Beginning Phase BOTH the Sprite's Temporary trigger and the Lab's trigger are pending on the chain, and P1 is asked about the Lab while the Sprite is still on the board", async () => {
    const { prompts } = await labEatsSprite(true);
    const ask = prompts.find((p) => p.kind === "yes-no" && p.seat === P1);
    expect(ask).toBeDefined();
    expect(ask!.chain.toSorted()).toEqual(["lab", "sprite"]);
    expect(ask!.spriteOnBoard).toBe(true);
    // P1 — controller of both — gets to order them.
    expect(prompts.some((p) => p.kind === "order" && p.seat === P1)).toBe(true);
  });

  test("opting in kills the Sprite as the Lab's cost (the token ceases to exist) and the Lab's effect draws 1; the Temporary item then resolves against nothing — no error, nothing else happens", async () => {
    const { game, prompts } = await labEatsSprite(true);
    expect(game.has("sprite")).toBe(false);
    expect(game.zoneOf("sprite")).toBe("gone");
    // The Sprite's own item was still on the chain AFTER the Sprite had left the board …
    expect(prompts.some((p) => !p.spriteOnBoard && p.chain.includes("sprite"))).toBe(true);
    // … and by the main phase everything resolved cleanly.
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(2); // 1 from the Lab + 1 from the Draw step
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(the Lab is empty afterwards, so no Hold point is scored this turn)", async () => {
    const { game } = await labEatsSprite(true);
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.battlefields.lab?.controller ?? null).toBeNull();
  });

  test("contrast — declining the Lab: Temporary kills the Sprite anyway and P1 gets only the Draw-step card", async () => {
    const { game } = await labEatsSprite(false);
    expect(game.has("sprite")).toBe(false);
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.points()).toBe(0);
  });
});
