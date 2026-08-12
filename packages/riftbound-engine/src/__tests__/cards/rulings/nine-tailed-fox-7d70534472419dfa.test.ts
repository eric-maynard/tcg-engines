/**
 * Ruling 7d70534472419dfa — Nine-Tailed Fox (OGN-255 → ogn-255-298) · Ahri's Legend
 *   "When an enemy unit attacks a battlefield you control, give it -1 [Might] this turn, to a minimum of 1."
 *   × Yasuo, Remorseful (OGN-076 → ogn-076-298) · 6 Might · "When I attack, deal damage equal to my Might to an
 *     enemy unit here."
 *
 * Q: An enemy Yasuo attacks into Ahri. Does Ahri's trigger resolve first (shrinking Yasuo before he deals damage)
 *    or does Yasuo's damage land at full Might?
 * A: Ahri's resolves first. Both go on the Initial Chain; the attacking (turn) player's triggers are placed first
 *    and the defender's on top, and the chain resolves last-in-first-out. So the -1 lands, then Yasuo's damage
 *    trigger reads his NEW Might.
 * Rules: 383.3.d / 337 (turn player places first, LIFO resolution), 336 (Initial Chain on attack),
 *        the ordering follows who CONTROLS the trigger, not the "when I defend" wording.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NINE_TAILED_FOX = "ogn-255-298";
const YASUO_REMORSEFUL = "ogn-076-298";

/** P2's turn. P1's Legend is Ahri and P1 holds bf1 with a Guard fat enough to survive Yasuo's trigger. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .legend(P1, NINE_TAILED_FOX, "ahri")
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 9, name: "Guard" }, "guard")
    .unit(P2, "base", YASUO_REMORSEFUL, "yasuo");
}

async function attack(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("yasuo", "bf1");
  return game;
}

/** Both seats pass priority once — resolves the top chain item. */
async function bothPass(game: Game): Promise<void> {
  await game.acting().passPriority();
  await game.acting().passPriority();
}

describe("Ruling 7d70534472419dfa — the defender's Ahri trigger sits above the attacker's, so the -1 lands first", () => {
  test("both triggers hit the Initial Chain: Yasuo's (turn player) at the bottom, Ahri's (defender) on top", async () => {
    const game = await attack();
    expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo", "ahri"]);
    expect(game.chain()[0]).toMatchObject({ controller: P2, triggered: true });
    expect(game.chain()[1]).toMatchObject({ controller: P1, triggered: true });
    expect(game.state("yasuo").might).toBe(6); // nothing resolved yet
  });

  test("LIFO: Ahri's -1 resolves first and Yasuo is a 5 while his own trigger is still waiting", async () => {
    const game = await attack();
    await bothPass(game);
    expect(game.state("yasuo")).toMatchObject({ might: 5, mightModifier: -1 });
    expect(game.chain().map((c) => c.cardId)).toEqual(["yasuo"]);
    expect(game.state("guard").damage).toBe(0);
  });

  test("…so his damage trigger reads the reduced Might: 5 to the Guard, not 6", async () => {
    const game = await attack();
    await bothPass(game);
    await bothPass(game);
    expect(game.chain()).toEqual([]);
    expect(game.state("guard").damage).toBe(5);
    expect(game.violations()).toEqual([]);
  });

  test("the nuance — Ahri's trigger is not a 'when I defend' trigger, yet it is ordered as the defender's", async () => {
    const game = await attack();
    // P1 controls no unit whose text mentions defending; the placement came from P1 controlling the ability.
    expect(game.chain().at(-1)).toMatchObject({ cardId: "ahri", controller: P1 });
    expect(game.state("ahri").zone).toBe("legendZone");
  });
});
