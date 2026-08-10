/**
 * Ruling 8290d34dbeff3f17 — Reaver's Row (OGN-285 → ogn-285-298) · Battlefield
 *     "When you defend here, you may move a friendly unit here to base."
 *
 * Q: A unit at Reaver's Row takes non-lethal spell damage, then gets pulled back to base by the Row before it is attacked.
 *    Does it keep that damage?
 * A: Yes — damage stays marked on it until the Combat Cleanup at the end of that combat, which heals ALL units (including
 *    the one now in base). The showdown opened by the move into the Row is part of Combat, so its cleanup applies.
 * Rules: 143 (damage persists until healed), 466.1.a.1 (Combat Cleanup: "Heal all Units"), 464.2 (the showdown is a Combat
 *        Showdown), 454 (the Row's move is not a heal).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REAVERS_ROW = "ogn-285-298";
/** P2's poke: deal 2 to a unit. */
const SCORCH = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Scorch (inline: deal 2 to a unit)",
  timing: "action",
} as const;

/** P2's turn with [1] + Scorch. P1 holds the live Row with Big (5) and Anchor (4); P2's Raider (3) is ready in base. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 1 })
    .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false })
    .unit(P1, "row", { might: 5, name: "Big" }, "big")
    .unit(P1, "row", { might: 4, name: "Anchor" }, "anchor")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P2, SCORCH, "scorch");
}

/** Scorch Big (2, non-lethal), then the Raider attacks and P1 uses the Row to pull Big home; stop with the Row resolved, combat still open. */
async function scorchedThenPulledBack(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("scorch", { targets: "big" });
  await game.settle();
  expect(game.state("big")).toMatchObject({ damage: 2, zone: "battlefield-row" });
  await game.p2.move("raider", "row");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "row" }, timing: "FIN" });
  await game.p1.yes();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "row" } });
  await game.p1.pick("big");
  for (let i = 0; i < 4 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.locationOf("big")).toBe("base");
  return game;
}

describe("Ruling 8290d34dbeff3f17 — spell damage stays on the unit the Row pulled back until the Combat Cleanup heals everything", () => {
  test("pulled back to base mid-combat, Big STILL carries its 2 damage (the Row's move is not a heal), while the showdown at the Row is still open", async () => {
    const game = await scorchedThenPulledBack();
    expect(game.state("big")).toMatchObject({ damage: 2, zone: "base" });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.state("anchor").combatRole).toBe("defender");
  });

  test("when that combat finishes (Raider 3 into Anchor 4: Raider dies) the Combat Cleanup heals ALL units — Anchor at the Row AND Big in base go back to 0 damage", async () => {
    const game = await scorchedThenPulledBack();
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.state("anchor")).toMatchObject({ damage: 0, zone: "battlefield-row" });
    expect(game.state("big")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.gameState.battlefields.row?.controller).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: with no combat at all the Scorch damage simply stays on Big for the rest of P2's turn (only end of turn would clear it)", async () => {
    const game = await board().build();
    await game.p2.cast("scorch", { targets: "big" });
    await game.settle();
    expect(game.state("big").damage).toBe(2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.state("big").damage).toBe(2);
    await game.advanceTurn();
    expect(game.state("big").damage).toBe(0);
  });
});
