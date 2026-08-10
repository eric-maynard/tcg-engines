/**
 * Ruling ebf874296f10004e — Baron Pit (UNL-T01 → unl-t01, battlefield token "Units can move here from anywhere.")
 *   × Brush (UNL-T03 → unl-t03, battlefield token "… When you score here, you may replace this with the battlefield it replaced.")
 *   × Baron Nashor (UNL-147 → unl-147-219) · [10]+[chaos]×3 · 12 Might "As you play me, add the Baron Pit battlefield token
 *     to the board if it's not there already. If you do, I enter there. …"
 *   (+ Green Father unl-195-219 as the effect that replaces a conquered/held battlefield with a Brush.)
 *
 * Q: If the Baron Pit token is replaced by a Brush token, does playing Baron Nashor again create a new Baron Pit?
 * A: Yes. The replaced Pit is put in Banishment and, being a token, ceases to exist; the Brush can never swap back to it.
 *    Baron's "if it's not there already" is then true again, so a second Baron creates a fresh Baron Pit (repeatable —
 *    multiple permanent battlefield tokens can accumulate).
 * Rules: 438.5 (replaced battlefield → Banishment), 438.6 / 186.1 (a token off the board ceases to exist), 438.7.c (no
 *        swap-back to a non-existent battlefield), Baron's self-replacement on play.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BARON_NASHOR = "unl-147-219";
const GREEN_FATHER = "unl-195-219";

/** P1 (legend Green Father) with two Barons in hand and resources for both; P2 guards bf1, bf2 is nobody's. */
function board() {
  return scenario()
    .legend(P1, GREEN_FATHER, "gf")
    .resources(P1, { energy: 20, power: { chaos: 6 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
    .hand(P1, BARON_NASHOR, "baron1")
    .hand(P1, BARON_NASHOR, "baron2");
}

const named = (game: Game, name: string) => game.battlefields().filter((b) => game.state(b).name === name);

/** Baron #1: a Baron Pit appears, Baron enters and conquers it; Green Father asks and P1 says YES → the Pit becomes a Brush. */
async function pitReplacedByBrush(): Promise<{ game: Game; slot: string }> {
  const game = await board().build();
  expect(named(game, "Baron Pit")).toEqual([]);
  await game.p1.play("baron1");
  const pit = named(game, "Baron Pit");
  expect(pit).toHaveLength(1);
  const slot = pit[0]!;
  expect(game.locationOf("baron1")).toBe(slot);
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "gf", battlefieldId: slot } });
  expect(game.p1.points()).toBe(1); // conquering the fresh Pit scored
  await game.p1.yes();
  await game.settle();
  return { game, slot };
}

describe("Ruling ebf874296f10004e — a Baron Pit replaced by a Brush is gone for good; the next Baron makes a new Pit", () => {
  test("Green Father replaces the conquered Baron Pit with a Brush: the slot is now a Brush P1 controls (Baron still on it), and the Pit TOKEN no longer exists anywhere — not on the board, not lingering in Banishment", async () => {
    const { game, slot } = await pitReplacedByBrush();
    expect(game.state("gf").isExhausted).toBe(true);
    expect(game.state(slot).name).toBe("Brush");
    expect(game.gameState.battlefields[slot]?.controller).toBe(P1);
    expect(game.locationOf("baron1")).toBe(slot); // units at a replaced battlefield don't move
    expect(named(game, "Baron Pit")).toEqual([]);
    expect(game.cardsAt("banishment").map((id) => game.state(id).name)).not.toContain("Baron Pit"); // 438.6: ceased to exist
  });

  test("playing a SECOND Baron Nashor now: 'not there already' is true again ⇒ a NEW Baron Pit token is added and Baron #2 enters there (conquering it), alongside the Brush", async () => {
    const { game, slot } = await pitReplacedByBrush();
    const before = game.battlefields();
    await game.p1.play("baron2", { to: "base" }); // whatever location is named, "As you play me" redirects him to the new Pit
    const pits = named(game, "Baron Pit");
    expect(pits).toHaveLength(1);
    const newPit = pits[0]!;
    expect(before).not.toContain(newPit);
    expect(newPit).not.toBe(slot);
    expect(game.locationOf("baron2")).toBe(newPit);
    expect(game.p1.base()).not.toContain("baron2");
    for (let i = 0; i < 6; i++) {
      const r = await game.settle();
      if (r.reason !== "unanswered" || game.decision()?.kind !== "yes-no") {
        break;
      }
      await game.p1.no(); // don't Brush the second Pit
    }
    expect(game.gameState.battlefields[newPit]).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(2);
    // Two permanent token battlefields now coexist with the printed ones.
    expect(game.state(slot).name).toBe("Brush");
    expect(game.battlefields().sort()).toEqual([...before, newPit].sort());
    expect(game.violations()).toEqual([]);
  });

  test("the Brush can never swap back: when P1 later scores (holds) there, no swap-back happens — the slot stays a Brush because the battlefield it replaced no longer exists (438.7.c)", async () => {
    const { game, slot } = await pitReplacedByBrush();
    await game.advanceTurn(); // → P2
    await game.p2.endTurn(); // → P1's Beginning Phase: P1 holds the Brush (Baron on it)
    for (let i = 0; i < 10; i++) {
      const r = await game.settle();
      const d = game.decision();
      if (r.reason !== "unanswered" || !d) {
        break;
      }
      if (d.kind === "yes-no") {
        await game.seat(d.seat).yes(); // accept anything offered (Green Father again / a swap-back offer, if any)
      } else {
        break;
      }
    }
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBeGreaterThanOrEqual(2); // held the Brush
    expect(game.state(slot).name).not.toBe("Baron Pit"); // nothing came back
    expect(named(game, "Baron Pit")).toEqual([]);
    expect(game.locationOf("baron1")).toBe(slot);
  });
});
