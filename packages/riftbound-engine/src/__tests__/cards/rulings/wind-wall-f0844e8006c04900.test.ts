/**
 * Ruling f0844e8006c04900 — Wind Wall (OGN-064 → ogn-064-298) · Spell · Calm · 3+[calm][calm] · Reaction — "Counter a spell."
 *   × Defy (OGN-045 → ogn-045-298) · Spell · Calm · 1+[calm] · Reaction — "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   (spells on the chain: Dredge Up ven-049-166 "[2] Draw 1 …" at the bottom, Retreat ogn-104-298 "[1] Reaction — Return a
 *    friendly unit to its owner's hand …" on top of it)
 *
 * Q: Can Wind Wall and Defy target ANY spell on the chain, or only the spell they are directly reacting to?
 * A: Any spell on the chain — not just the most recent item.
 * Rules: 425 (counter targets "a spell" = any spell chain item), 355 (targeting), 336–340 (chain / LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WIND_WALL = "ogn-064-298";
const DEFY = "ogn-045-298";
const DREDGE_UP = "ven-049-166";
const RETREAT = "ogn-104-298";

/** P1's turn with [3]: Dredge Up + Retreat in hand, Pal (2) in base (Retreat's object). P2 holds Wind Wall (3+2 calm) and Defy (1+1 calm) with 4 + 3 calm. */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .resources(P2, { energy: 4, power: { calm: 3 } })
    .unit(P1, "base", { might: 2, name: "Pal" }, "pal")
    .hand(P1, DREDGE_UP, "dredge")
    .hand(P1, RETREAT, "retreat")
    .hand(P2, WIND_WALL, "windwall")
    .hand(P2, DEFY, "defy");
}

/** P1 casts Dredge Up, then (still holding priority) Retreat on Pal on top of it, then passes: P2 to act with two spells below. */
async function twoSpellsDeep(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("dredge");
  if (game.decision()?.seat !== P1) {
    await game.p2.passPriority();
  }
  await game.p1.cast("retreat", { targets: "pal" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["dredge", "retreat"]);
  if (game.decision()?.seat === P1) {
    await game.p1.passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

const counterTargets = (game: Game, card: string) =>
  (game.p2.option("cast", card)?.fields.find((f) => f.name === "targets")?.options ?? []).flat() as string[];

describe("Ruling f0844e8006c04900 — counterspells may target any spell on the chain", () => {
  test("Wind Wall, played with Retreat as the top item, is offered BOTH spells — the top Retreat and the Dredge Up underneath it", async () => {
    const game = await twoSpellsDeep();
    expect(game.p2.can("cast", "windwall")).toBe(true);
    expect(counterTargets(game, "windwall").sort()).toEqual(["dredge", "retreat"]);
  });

  test("Defy likewise offers both (each costs ≤ [4] and ≤ 1 power)", async () => {
    const game = await twoSpellsDeep();
    expect(game.p2.can("cast", "defy")).toBe(true);
    expect(counterTargets(game, "defy").sort()).toEqual(["dredge", "retreat"]);
  });

  test("Wind Wall aimed PAST the top item at Dredge Up: Retreat still resolves normally (Pal → hand, P1 channels a rune), then Wind Wall counters Dredge Up — P1 draws nothing and Dredge Up goes to the trash unresolved", async () => {
    const game = await twoSpellsDeep();
    const hand = game.p1.hand().length;
    const runes = game.p1.runes().length;
    await game.p2.cast("windwall", { targets: "dredge" });
    expect(game.p2.resources()).toEqual({ energy: 1, power: { calm: 1 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["dredge", "retreat", "windwall"]);
    expect(game.chain()[2]).toMatchObject({ cardId: "windwall", controller: P2, targets: ["dredge"] });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("pal")).toBe("hand"); // Retreat was untouched and resolved
    expect(game.p1.runes()).toHaveLength(runes + 1);
    expect(game.zoneOf("dredge")).toBe("trash");
    expect(game.zoneOf("windwall")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand + 1); // + Pal only; NO card drawn by the countered Dredge Up
    expect(game.p1.hand()).toContain("pal");
    expect(game.violations()).toEqual([]);
  });

  test("Defy aimed at the bottom Dredge Up works the same way: Dredge Up countered (no draw), Retreat resolves", async () => {
    const game = await twoSpellsDeep();
    const hand = game.p1.hand().length;
    await game.p2.cast("defy", { targets: "dredge" });
    expect(game.chain()[2]).toMatchObject({ cardId: "defy", targets: ["dredge"] });
    await game.settle();
    expect(game.zoneOf("dredge")).toBe("trash");
    expect(game.zoneOf("pal")).toBe("hand");
    expect(game.p1.hand()).toHaveLength(hand + 1);
  });

  test("nuance — the alternative line also exists: P2 may instead pass, let Retreat resolve, and react to Dredge Up once it is the topmost item (a window opens after each resolution)", async () => {
    const game = await twoSpellsDeep();
    await game.p2.passPriority(); // both have now passed on Retreat → it resolves
    expect(game.zoneOf("pal")).toBe("hand");
    expect(game.chain().map((c) => c.cardId)).toEqual(["dredge"]);
    // Priority is re-offered with Dredge Up on top; get to P2 and counter it there.
    if (game.decision()?.seat === P1) {
      await game.p1.passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(counterTargets(game, "windwall")).toEqual(["dredge"]);
    const hand = game.p1.hand().length;
    await game.p2.cast("windwall", { targets: "dredge" });
    await game.settle();
    expect(game.zoneOf("dredge")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand);
  });
});
