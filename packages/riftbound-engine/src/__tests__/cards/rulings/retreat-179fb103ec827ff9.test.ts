/**
 * Ruling 179fb103ec827ff9 — Retreat (OGN-104 → ogn-104-298) · Spell · Mind · [1] · [Reaction]
 *   "Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted."
 *   × Lillia, Fae Fawn (UNL-082 → unl-082-219) · Champion unit · [3] · 3 Might — used as the chosen champion.
 *
 * Q: When Retreat is cast on your chosen champion (played out of the Champion Zone), does the card go to HAND
 *    or back to the Champion Zone?
 * A: To HAND. Retreat treats a chosen champion like any other unit and returns it to its owner's hand; it does
 *    not go back to the Champion Zone. (Its owner still channels 1 rune exhausted.)
 * Rules: 428 (Return to hand sends the card to its owner's HAND — no champion-zone exception), 130 (the Champion
 *        Zone is only the pre-game home of the chosen champion), 127.1 (the OWNER channels).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const RETREAT = "ogn-104-298";
const LILLIA = "unl-082-219";

/** P1's turn. Lillia sits in the Champion Zone; 4 energy pays her [3] and Retreat's [1]. */
function board() {
  return scenario()
    .resources(P1, { energy: 4 })
    .champion(P1, LILLIA, "lillia")
    .hand(P1, RETREAT, "retreat");
}

/** Play the chosen champion out of the Champion Zone into base and settle. */
async function championOnBoard(): Promise<Game> {
  const game = await board().build();
  expect(game.zoneOf("lillia")).toBe("championZone");
  expect(game.p1.can("playChampion")).toBe(true);
  await game.p1.playChampion("base");
  await game.settle();
  expect(game.zoneOf("lillia")).toBe("base");
  expect(game.p1.cardsAt("championZone")).toEqual([]);
  return game;
}

describe("Ruling 179fb103ec827ff9 — Retreat returns a chosen champion to HAND, not to the Champion Zone", () => {
  test("setup: the chosen champion leaves the Champion Zone when played and is an ordinary friendly unit in base", async () => {
    const game = await championOnBoard();
    expect(game.p1.base()).toContain("lillia");
    expect(game.state("lillia")).toMatchObject({ cardType: "unit", controller: P1, owner: P1 });
  });

  test("Retreat can target the chosen champion — it is 'a friendly unit' like any other", async () => {
    const game = await championOnBoard();
    expect(game.p1.can("cast", "retreat")).toBe(true);
    const targets = game.p1.option("cast", "retreat")?.fields.find((f) => f.arg === "targets");
    expect((targets?.options ?? []).flat()).toContain("lillia");
  });

  test("on resolution the champion card is in P1's HAND — the Champion Zone stays empty", async () => {
    const game = await championOnBoard();
    await game.p1.cast("retreat", { targets: "lillia" });
    await game.settle();
    expect(game.zoneOf("lillia")).toBe("hand");
    expect(game.zoneOf("lillia")).not.toBe("championZone");
    expect(game.p1.hand()).toContain("lillia");
    expect(game.p1.cardsAt("championZone")).toEqual([]);
    expect(game.p1.base()).not.toContain("lillia");
    expect(game.zoneOf("retreat")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("the rest of Retreat still happens: the champion's OWNER channels 1 rune exhausted", async () => {
    const game = await championOnBoard();
    const before = game.p1.runes().length;
    await game.p1.cast("retreat", { targets: "lillia" });
    await game.settle();
    expect(game.p1.runes().length).toBe(before + 1);
    expect(game.p1.runes({ ready: true }).length).toBe(before);
  });

  test("consequence of being in hand and not the Champion Zone: it is replayed from HAND (paying its printed [3]), not with playChampion", async () => {
    const game = await championOnBoard();
    await game.p1.cast("retreat", { targets: "lillia" });
    await game.settle();
    expect(game.p1.can("playChampion")).toBe(false); // nothing left in the Champion Zone
    expect(game.p1.energy()).toBe(0);
    await game.p1.do("addResources", { energy: 3 });
    expect(game.p1.can("play", "lillia")).toBe(true);
    await game.p1.play("lillia");
    await game.settle();
    expect(game.zoneOf("lillia")).toBe("base");
    expect(game.p1.cardsAt("championZone")).toEqual([]);
  });
});
