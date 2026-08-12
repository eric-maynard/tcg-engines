/**
 * Ruling 4647504a98de3ae2 — Ahri, Inquisitive (OGN-119 → ogn-119-298) × [Deflect]
 *   Ahri: [3][mind] · 3 Might · "When I attack or defend, give an enemy unit here -2 [Might] this turn, to a
 *   minimum of 1 [Might]."   Pouty Poro (OGN-013 → ogn-013-298): 2 Might, "[Deflect]".
 *
 * Q: When the 3-cost Ahri gives -2, does she choose a unit and pay the Deflect cost?
 * A: Yes — she chooses a unit, and choosing a [Deflect] unit owes its surcharge. You may decline to pay, but
 *    then the unit does not get the -2.
 * Rules: 809.1.c/809.1.d (Deflect taxes spells AND abilities that choose the unit), 402.2 (a triggered
 *        ability's chosen objects are named at finalization — where the surcharge is owed), 383.3.a
 *        (declining the optional payment removes the item), 355.10.d.2 (a sole candidate is still a choice).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const AHRI = "ogn-119-298";
const PORO = "ogn-013-298";

/** P1's turn: P2 holds bf1 with `defender`; Ahri attacks into it. P1 has `rainbow` spare Power. */
function board(defender: string | { might: number; name: string }, rainbow: number) {
  return scenario()
    .resources(P1, { power: { rainbow } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", defender, "foe")
    .unit(P1, "base", AHRI, "ahri");
}

describe("Ruling 4647504a98de3ae2 — Ahri's -2 chooses a unit, and choosing a [Deflect] unit is taxed", () => {
  test("against an ordinary enemy the trigger just fires: -2 Might this turn, nothing to pay", async () => {
    const game = await board({ might: 5, name: "Foe" }, 0).build();
    await game.p1.move("ahri", "bf1");
    expect(game.chain().map((i) => i.cardId)).toEqual(["ahri"]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("foe").might).toBe(3); // 5 − 2
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  });

  test("against a [Deflect] unit the harness surfaces the Deflect payment as Ahri's own FIN decision", async () => {
    const game = await board(PORO, 1).build();
    await game.p1.move("ahri", "bf1");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
    expect(d?.prompt).toContain("[Deflect]");
    expect(d?.source).toMatchObject({ cardId: "ahri" });
  });

  test("paying it: the [rainbow] is spent and the Poro takes the -2 (floored at 1 Might)", async () => {
    const game = await board(PORO, 1).build();
    await game.p1.move("ahri", "bf1");
    await game.p1.yes();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.state("foe").might).toBe(1); // 2 − 2, minimum 1
    expect(game.violations()).toEqual([]);
  });

  test("declining it: nothing is paid and the Poro keeps its 2 Might — no -2 without the Deflect cost", async () => {
    const game = await board(PORO, 1).build();
    await game.p1.move("ahri", "bf1");
    await game.p1.no();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(game.state("foe").might).toBe(2);
    expect(game.chain()).toEqual([]); // the declined item never reached the chain
  });

  test("with no Power at all the ability is not even offered — the only candidate is unaffordable", async () => {
    const game = await board(PORO, 0).build();
    await game.p1.move("ahri", "bf1");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("foe").might).toBe(2);
  });
});
