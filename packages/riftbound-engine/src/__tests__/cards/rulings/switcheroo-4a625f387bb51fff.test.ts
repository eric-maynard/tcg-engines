/**
 * Ruling 4a625f387bb51fff — Switcheroo (SFD-145 → sfd-145-221) · Spell · Chaos · [2][chaos][chaos] · [Action] [Hidden]
 *   "Swap the Might of two units at the same battlefield this turn."
 *   × Vi, Hotheaded (UNL-030 → unl-030-219) · Unit · 3 Might · "[Deflect]".
 *
 * Q: Do I need to pay [Deflect] costs when playing Switcheroo?
 * A: Yes — Switcheroo is a spell and it CHOOSES the unit, so an opponent's [Deflect] unit costs its surcharge.
 *    It is a mandatory additional cost, paid as the spell goes on the chain; if you cannot pay it you cannot
 *    choose that unit. A [Deflect] unit you control yourself costs nothing.
 * Rules: 809.1.c ([Deflect]: opponents pay to choose me), 735.1.d / 356.2.a.2 (mandatory additional cost paid on
 *        play), 355.5 (choices made when the spell is played).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SWITCHEROO = "sfd-145-221";
const VI_HOTHEADED = "unl-030-219";

/** P1's turn. P2 holds bf1 with Deflect-Vi (3) + Grunt (5); P1 holds bf2 with his OWN Deflect-Vi (3) + Squire (5). */
function board(rainbow: number) {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 2, rainbow } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", VI_HOTHEADED, "vi")
    .unit(P2, "bf1", { might: 5, name: "Grunt" }, "grunt")
    .unit(P1, "bf2", VI_HOTHEADED, "myVi")
    .unit(P1, "bf2", { might: 5, name: "Squire" }, "squire")
    .hand(P1, SWITCHEROO, "switch");
}

describe("Ruling 4a625f387bb51fff — Switcheroo pays [Deflect] for an opponent's unit, nothing for your own", () => {
  test("ruling: choosing the ENEMY [Deflect] unit costs the base [2][chaos][chaos] plus one [rainbow]", async () => {
    const game = await board(1).build();
    await game.p1.cast("switch", { targets: ["vi", "grunt"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, rainbow: 0 } });
    await game.settle();
    expect(game.state("vi").might).toBe(5);
    expect(game.state("grunt").might).toBe(3);
    expect(game.zoneOf("switch")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("ruling nuance: a [Deflect] unit YOU control is free to choose — the [rainbow] is left untouched", async () => {
    const game = await board(1).build();
    await game.p1.cast("switch", { targets: ["myVi", "squire"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, rainbow: 1 } });
    await game.settle();
    expect(game.state("myVi").might).toBe(5);
    expect(game.state("squire").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });

  test("ruling: with nothing spare to pay the surcharge, the enemy [Deflect] unit cannot be chosen at all", async () => {
    const game = await board(0).build();
    expect((await game.p1.try((p) => p.cast("switch", { targets: ["vi", "grunt"] }))).ok).toBe(false);
    expect(game.zoneOf("switch")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 2, rainbow: 0 } }); // nothing paid
    // …while the same spell on P1's own pair is still perfectly legal.
    await game.p1.cast("switch", { targets: ["myVi", "squire"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, rainbow: 0 } });
    await game.settle();
    expect(game.state("myVi").might).toBe(5);
  });

  test("the swap is 'this turn' — both units are back to their printed Might next turn", async () => {
    const game = await board(1).build();
    await game.p1.cast("switch", { targets: ["vi", "grunt"] });
    await game.settle();
    expect(game.state("vi").might).toBe(5);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("vi").might).toBe(3);
    expect(game.state("grunt").might).toBe(5);
    expect(game.violations()).toEqual([]);
  });
});
