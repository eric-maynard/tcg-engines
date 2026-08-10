/**
 * Ruling 42b6d0d2494dd8da — Reaver's Row (OGN-285 → ogn-285-298) · Battlefield
 *   "When you defend here, you may move a friendly unit here to base."
 *
 * Q: If the (only) defender retreats from Reaver's Row via its "When you defend" trigger, does the showdown end at once,
 *    or does the defending player still get to play Actions with no units present?
 * A: The showdown continues through all its normal steps: the attacker gains Focus first, priority/Focus passes back and
 *    forth normally, and the defending player — even with no units there — still gets Focus and may play Actions/Reactions.
 * Rules: 341–347 (every Relevant Player receives Focus in turn; a showdown closes only when all pass), 348 (close),
 *        466.5 (nobody defending at resolution ⇒ the attacker conquers).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REAVERS_ROW = "ogn-285-298";
/** Inline "[Action] Deal 2 to a unit." — an ACTION-speed spell for the unit-less defender to play with Focus. */
const JAB = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Jab (inline)",
  rulesText: "[Action] Deal 2 to a unit.",
  timing: "action",
} as const;

/** P2's turn. P1 holds the live Row with a lone Scout (2), has Jab in hand and [1]. P2's Raider (5) attacks from base. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 1 })
    .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false })
    .unit(P1, "row", { might: 2, name: "Scout" }, "scout")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
    .hand(P1, JAB, "jab");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Raider attacks; P1 opts into the Row (lone Scout auto-targeted); both pass; the Scout retreats to base. */
async function scoutRetreats(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "row");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "row", pendingChoiceType: "opt-in" }, timing: "FIN" });
  await game.p1.yes();
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("scout");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "row", targets: ["scout"], triggered: true })]);
  for (let i = 0; i < 4 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.locationOf("scout")).toBe("base");
  expect(game.p1.units("row")).toEqual([]);
  return game;
}

describe("Ruling 42b6d0d2494dd8da — the showdown runs its full course even after the defender retreats via Reaver's Row", () => {
  test("after the Scout retreats the showdown is STILL open (not ended immediately) and the ATTACKER (P2) holds Focus first", async () => {
    const game = await scoutRetreats();
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "row", defendingPlayer: P1 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.gameState.battlefields.row).toMatchObject({ contested: true, controller: P1 }); // nothing conquered yet
    expect(game.p2.points()).toBe(0);
  });

  test("Focus then passes to the unit-less DEFENDER (P1), who may still play an Action: Jab the Raider for 2", async () => {
    const game = await scoutRetreats();
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(showdown(game)?.focusPlayer).toBe(P1);
    expect(game.p1.can("cast", "jab")).toBe(true);
    await game.p1.cast("jab", { targets: "raider" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "jab", controller: P1 })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("raider").damage).toBe(2);
    expect(showdown(game)?.active).toBe(true); // and it goes on: Focus keeps passing
  });

  test("only when every player has passed does the showdown close; with nobody defending, the Raider conquers the Row", async () => {
    const game = await scoutRetreats();
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 }); // P1 did get Focus
    await game.p1.passFocus();
    await game.settle();
    expect(showdown(game)?.active ?? false).toBe(false);
    expect(game.gameState.battlefields.row).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.state("scout")).toMatchObject({ damage: 0, location: "base" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
