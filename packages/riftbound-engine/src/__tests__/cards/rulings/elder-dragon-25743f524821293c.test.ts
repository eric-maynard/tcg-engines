/**
 * Ruling 25743f524821293c — Elder Dragon (UNL-118 → unl-118-219) · Body unit · [12] · 10 Might
 *   "Any amount of your damage is enough to kill enemy units."  (a passive)
 *   × Hidden Blade (OGN-213 → ogn-213-298) · [Hidden][Action] "Kill a unit at a battlefield. Its controller draws 2."
 *
 * Q: If I kill Elder Dragon during the showdown, do my units still die to its passive / to its combat damage?
 * A: No to both. The passive works only while the Dragon is on the board, so once it is trashed the lethal
 *    threshold of your units is their own Might again; and a unit that is gone before the Combat Damage Step
 *    neither assigns nor deals combat damage.
 * Rules: 460.2 / 465.2.c (only units present assign combat damage), 142.4.c (the Dragon's lethal-damage
 *        modifier is a passive of a board object), 466.1 (Combat Cleanup).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ELDER_DRAGON = "unl-118-219";
const HIDDEN_BLADE = "ogn-213-298";

/**
 * P2's turn. P1 holds bf1 with an 8-Might Wall and a 9-Might Tower and a hidden Hidden Blade there.
 * P2 attacks with Elder Dragon (10), an 8-Might Brute and a 1-Might Runt — 19 Might of combat damage.
 */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 8, name: "Wall" }, "wall")
    .unit(P1, "bf1", { might: 9, name: "Tower" }, "tower")
    .unit(P2, "base", ELDER_DRAGON, "dragon")
    .unit(P2, "base", { might: 8, name: "Brute" }, "brute")
    .unit(P2, "base", { might: 1, name: "Runt" }, "runt")
    .facedown(P1, "bf1", HIDDEN_BLADE, "blade");
}

/** All three P2 units attack bf1; the showdown opens with P2 (attacker) on focus. */
async function attack(): Promise<Game> {
  const game = await board().build();
  await game.p2.move(["dragon", "brute", "runt"], "bf1");
  expect(game.state("dragon").combatRole).toBe("attacker");
  expect(game.state("wall").combatRole).toBe("defender");
  return game;
}

/** P1 reveals the hidden Blade during the showdown and kills the named unit. */
async function blade(game: Game, victim: string): Promise<void> {
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.reveal("blade");
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick(victim);
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf(victim)).toBe("trash");
}

describe("Ruling 25743f524821293c — killing Elder Dragon in the showdown removes both its passive and its combat damage", () => {
  test("control: while the Dragon is alive its passive kills both defenders outright — 19 Might of attackers, 1 damage apiece is lethal", async () => {
    const game = await attack();
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("tower")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("ruling: the hidden Blade kills the Dragon mid-showdown — the combat continues and the defenders keep their designations", async () => {
    const game = await attack();
    await game.p2.passFocus();
    await blade(game, "dragon");
    expect(game.state("wall").combatRole).toBe("defender");
    expect(game.state("brute").combatRole).toBe("attacker");
  });

  test("…the passive is gone: the assignment now reports the defenders' OWN Might as lethal (8 and 9), not 1", async () => {
    const game = await attack();
    await game.p2.passFocus();
    await blade(game, "dragon");
    await game.acting().passFocus();
    await game.acting().passFocus();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "distribute", seat: P2, total: 9 }); // the Dragon's 10 is simply absent
    const lethal = d?.kind === "distribute" ? Object.fromEntries(d.buckets.map((b) => [b.card ?? b.key, b.lethal])) : {};
    expect(lethal).toMatchObject({ tower: 9, wall: 8 });
  });

  test("…and only 9 damage is dealt: the Wall dies to a full 8, the Tower survives the leftover 1 that the passive would have made lethal", async () => {
    const game = await attack();
    await game.p2.passFocus();
    await blade(game, "dragon");
    await game.acting().passFocus();
    await game.acting().passFocus();
    await game.p2.distribute({ tower: 1, wall: 8 });
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("tower")).toBe("battlefield-bf1");
    expect(game.state("tower").damage).toBe(0); // 1 was not lethal, and it healed
    expect(game.violations()).toEqual([]);
  });

  test("contrast: blading the Brute instead leaves the Dragon alive — its passive still makes 1 damage lethal for the Tower", async () => {
    const game = await attack();
    await game.p2.passFocus();
    await blade(game, "brute");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("tower")).toBe("trash");
  });
});
