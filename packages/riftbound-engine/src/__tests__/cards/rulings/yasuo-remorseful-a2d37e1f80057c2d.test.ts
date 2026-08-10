/**
 * Ruling a2d37e1f80057c2d — Yasuo, Remorseful (OGN-076 → ogn-076-298) · Unit · Calm · [6][calm][calm] · 6 Might
 *     "When I attack, deal damage equal to my Might to an enemy unit here."
 *   × Reaver's Row (OGN-285 → ogn-285-298) · Battlefield · "When you defend here, you may move a friendly unit here to base."
 *
 * Q: Yasuo moves onto a battlefield with enemy units and his ability goes on the chain — when is its target chosen, and
 *    can the opponent use the battlefield (Reaver's Row) to move that unit away so the ability fizzles?
 * A: The target is chosen as the ability goes on the chain (attacker's triggers first, targets locked). The defender then
 *    adds Reaver's Row and picks its unit. LIFO: Reaver's Row resolves first and moves the unit home; Yasuo's ability then
 *    fails its "here" legality check and fizzles. (Only abilities that target choose on finalization; e.g. discards don't.)
 * Rules: 464.2.e.1 (attacker's triggers placed first), 355.6/355.7 (targets chosen at finalization), 355.9 (rechecked on
 *        resolution → no effect), 383 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const YASUO = "ogn-076-298";
const REAVERS_ROW = "ogn-285-298";

/** P1's turn. P2 holds Reaver's Row (live text) with a lone Sentinel (4); P1's Yasuo (6) attacks from base. */
function board() {
  return scenario()
    .battlefield("row", { controller: P2, def: REAVERS_ROW, inert: false })
    .unit(P2, "row", { might: 4, name: "Sentinel" }, "sentinel")
    .unit(P1, "base", YASUO, "yasuo");
}

async function yasuoAttacks(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("yasuo", "row");
  return game;
}

/** Yasuo's target gets locked (asked → Sentinel; or bound automatically as the only enemy here). */
async function lockYasuoTarget(game: Game): Promise<void> {
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P1) {
    expect(d).toMatchObject({ semantics: "target", source: { cardId: "yasuo" } });
    expect(d.options.map((o) => o.card ?? o.key)).toEqual(["sentinel"]);
    await game.p1.pick("sentinel");
  }
  expect(game.chain().find((c) => c.cardId === "yasuo")).toMatchObject({ controller: P1, targets: ["sentinel"], triggered: true });
}

describe("Ruling a2d37e1f80057c2d — Yasuo's target is locked on the chain; Reaver's Row can pull it away and the ability fizzles", () => {
  test("the target is chosen WHEN the ability goes on the chain: right after the attack Yasuo's item already names the Sentinel, before P2 has answered anything", async () => {
    const game = await yasuoAttacks();
    await lockYasuoTarget(game);
    // The defender's Reaver's Row is only now being asked about (opt-in), i.e. after Yasuo's choice is final.
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "row" } });
    expect(game.view(P2).chain.find((c) => c.cardId === "yasuo")?.targets).toEqual(["sentinel"]);
  });

  test("P2 opts into Reaver's Row and picks the targeted Sentinel: the chain is Yasuo (bottom, → Sentinel) then Row (top, → Sentinel)", async () => {
    const game = await yasuoAttacks();
    await lockYasuoTarget(game);
    await game.p2.yes();
    if (game.decision()?.kind === "pick") {
      expect(game.decision()).toMatchObject({ kind: "pick", seat: P2, source: { cardId: "row" } });
      await game.p2.pick("sentinel");
    }
    expect(game.chain().map((c) => [c.cardId, c.controller, c.targets])).toEqual([
      ["yasuo", P1, ["sentinel"]],
      ["row", P2, ["sentinel"]],
    ]);
  });

  test("LIFO: Reaver's Row resolves first (Sentinel → P2's base); Yasuo's ability then finds its target no longer 'here' and fizzles — Sentinel takes 0 damage and P1 is never asked to re-target", async () => {
    const game = await yasuoAttacks();
    await lockYasuoTarget(game);
    await game.p2.yes();
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("sentinel");
    }
    for (let i = 0; i < 4 && game.chain().length > 1; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo"]);
    expect(game.zoneOf("sentinel")).toBe("base");
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      const d = game.decision();
      expect(d?.kind).toBe("action"); // never a re-target pick for P1
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("sentinel")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.p2.trash()).not.toContain("sentinel");
    // With no defender left, Yasuo simply takes the Row.
    await game.settle();
    expect(game.locationOf("yasuo")).toBe("row");
    expect(game.gameState.battlefields.row?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("control — P2 declines Reaver's Row: Yasuo's ability resolves on the Sentinel still here and deals 6 → it dies", async () => {
    const game = await yasuoAttacks();
    await lockYasuoTarget(game);
    await game.p2.no();
    await game.settle();
    expect(game.zoneOf("sentinel")).toBe("trash");
    expect(game.gameState.battlefields.row?.controller).toBe(P1);
  });
});
