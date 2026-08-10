/**
 * Ruling 97480ef8eafff0f1 — Reaver's Row (OGN-285 → ogn-285-298: "When you defend here, you may move a friendly unit here
 *   to base.") × Mask of Foresight (OGN-060 → ogn-060-298: "When a friendly unit attacks or defends alone, give it +1
 *   [Might] this turn.")
 *
 * Q: Do "When I defend" triggers resolve first because they are put on the chain last?
 * A: Yes. The attacking player (who has Focus) places their triggers first, other players in turn order, the defending
 *    player last — so defend triggers sit on top and resolve first (LIFO). Nuance: if the defender retreats a unit with
 *    Reaver's Row, the attacker still gets their attack triggers (e.g. Mask's +1).
 * Rules: 383.5 (placement order on the initial chain), 332 (LIFO), 359 (a trigger on the chain resolves regardless).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REAVERS_ROW = "ogn-285-298";
const MASK_OF_FORESIGHT = "ogn-060-298";

/** P2's turn. P1 holds the live Reaver's Row with Guard (3). P2 has Mask of Foresight and attacks with a lone Raider (3). */
function board() {
  return scenario()
    .active(P2)
    .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false })
    .unit(P1, "row", { might: 3, name: "Guard" }, "guard")
    .gear(P2, MASK_OF_FORESIGHT, "mask")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider");
}

/** Raider attacks; P1 accepts the Row trigger naming Guard. Returns at the first priority window. */
async function attackAndAcceptRow(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "row");
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      await game.p1.yes();
    } else if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick("guard");
    } else {
      break;
    }
  }
  return game;
}

describe("Ruling 97480ef8eafff0f1 — defend triggers go on the initial chain last, so they resolve first", () => {
  test("initial chain: the ATTACKER's Mask trigger (P2) is placed first/bottom, the DEFENDER's Reaver's Row trigger (P1) last/top", async () => {
    const game = await attackAndAcceptRow();
    const chain = game.chain();
    expect(chain.map((c) => `${c.cardId}/${c.controller}`)).toEqual([`mask/${P2}`, `row/${P1}`]);
    expect(chain.every((c) => c.triggered)).toBe(true);
    expect(chain[1]?.targets).toEqual(["guard"]);
    expect(game.state("raider").might).toBe(3); // nothing has resolved yet
    expect(game.locationOf("guard")).toBe("row");
  });

  test("LIFO: Reaver's Row resolves FIRST (Guard retreats to base) while Mask is still pending; then Mask resolves and the Raider still gets +1 even though nobody is left defending", async () => {
    const game = await attackAndAcceptRow();
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.locationOf("guard")).toBe("base"); // defend trigger resolved first
    expect(game.chain().map((c) => c.cardId)).toEqual(["mask"]); // attack trigger still waiting
    expect(game.state("raider").might).toBe(3);
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("raider")).toMatchObject({ might: 4, mightModifier: 1 }); // "you still get your attack triggers"
  });

  test("aftermath: with the Row emptied the Raider takes it — P2 conquers Reaver's Row and scores", async () => {
    const game = await attackAndAcceptRow();
    await game.settle();
    expect(game.locationOf("guard")).toBe("base");
    expect(game.locationOf("raider")).toBe("row");
    expect(game.gameState.battlefields.row).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.state("raider").might).toBe(4); // this turn
    expect(game.violations()).toEqual([]);
  });
});
