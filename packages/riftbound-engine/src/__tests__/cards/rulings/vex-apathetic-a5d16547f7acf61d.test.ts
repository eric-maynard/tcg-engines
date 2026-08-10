/**
 * Ruling a5d16547f7acf61d — Vex, Apathetic (UNL-150 → unl-150-219) · 4 Might · "When an opponent plays a unit while I'm at a
 *     battlefield, [Stun] it. They can't move it this turn."
 *   × Reflection token (unl-t06) via Mirror Image (UNL-200 → unl-200-219, "Choose a unit. Play a ready Reflection unit token to your
 *     base. It becomes a copy of that unit. Give it [Temporary].") and Deceiver (UNL-199 → unl-199-219, LeBlanc legend: "When you
 *     conquer or hold, you may discard 1 and exhaust me to play a ready Reflection unit token there. It becomes a copy of another
 *     unit there. Give it [Temporary].")
 *
 * Q: Does an enemy Vex at a battlefield stun/lock Reflection tokens?
 * A: Yes. These effects say "PLAY a … token", so the token is played → Vex triggers (wherever the token lands, as long as Vex is at a
 *    battlefield); on resolution the token is Stunned and can't be moved this turn. The stun ends at the next Ending Step; the
 *    move lock lasts the turn.
 * Rules: 187 (tokens "played" when the effect says play), 383 (triggered), 423 (Stun), 350.1 (movement restriction).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VEX = "unl-150-219";
const MIRROR_IMAGE = "unl-200-219";
const DECEIVER = "unl-199-219";

function reflections(game: Game): string[] {
  return game.findAll({ name: "Reflection", owner: P1 }).concat(game.findAll({ owner: P1 }).filter((id) => game.state(id).isToken))
    .filter((id, i, a) => a.indexOf(id) === i && game.zoneOf(id) !== "gone");
}

/** Pass priority around until the chain is empty (Mirror Image / Deceiver, then Vex's trigger). */
async function drainChain(game: Game): Promise<void> {
  for (let i = 0; i < 10 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.chain()).toEqual([]);
}

describe("Ruling a5d16547f7acf61d — Vex, Apathetic stuns and roots Reflection tokens (they are 'played')", () => {
  test("Mirror Image (P1) with P2's Vex at bf1: the ready Reflection (copy of Ally, 3 Might) is played to P1's BASE → Vex's trigger (P2's) goes on the chain → token Stunned + can't move this turn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { mind: 1, order: 1 } })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: null })
      .unit(P2, "bf1", VEX, "vex")
      .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
      .hand(P1, MIRROR_IMAGE, "mirror")
      .build();
    await game.p1.cast("mirror", { targets: "ally" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Mirror Image resolves → token played
    const [token] = reflections(game);
    expect(token).toBeDefined();
    expect(game.state(token!)).toMatchObject({ isReady: true, isToken: true, location: "base", might: 3 });
    // Vex saw an opponent PLAY a unit while she is at a battlefield (the token landing in base is irrelevant).
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vex", controller: P2, triggered: true })]);
    expect(game.state(token!).isStunned).toBe(false); // not until it resolves
    await drainChain(game);
    expect(game.state(token!).isStunned).toBe(true);
    expect(game.state(token!).keywords).toContain("NoMove");
    // "They can't move it this turn": no move is offered for the (ready) token.
    expect(game.p1.can("move", token!)).toBe(false);
    const r = await game.p1.try((p) => p.move(token!, "bf2"));
    expect(r.ok).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("Deceiver (P1 conquers empty bf1; Vex sits at P2's bf2): pay discard 1 + exhaust → Reflection played THERE (copy of the Runner) → Vex triggers all the same → Stunned + rooted", async () => {
    const game = await scenario()
      .legend(P1, DECEIVER, "leblanc")
      .battlefield("bf1", { controller: null })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", VEX, "vex")
      .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
      .hand(P1, { cardType: "unit", energyCost: 1, might: 1, name: "Junk" }, "junk")
      .build();
    await game.p1.move("runner", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus(); // conquer
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "leblanc" } });
    await game.p1.yes();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("junk");
    }
    expect(game.zoneOf("junk")).toBe("trash");
    expect(game.state("leblanc").isExhausted).toBe(true);
    // Deceiver's item resolves → token played at bf1 → Vex's trigger appears.
    for (let i = 0; i < 6 && !game.chain().some((c) => c.cardId === "vex"); i++) {
      await game.acting().passPriority();
    }
    const [token] = reflections(game);
    expect(token).toBeDefined();
    expect(game.state(token!)).toMatchObject({ isToken: true, location: "bf1", might: 3 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vex", controller: P2, triggered: true })]);
    await drainChain(game);
    expect(game.state(token!).isStunned).toBe(true);
    expect(game.state(token!).keywords).toContain("NoMove");
    expect(game.p1.can("move", token!)).toBe(false);
  });

  test("durations: the stun clears at the next Ending Step and the move-lock is 'this turn' — on P2's following turn the (Temporary, still alive) token is neither stunned nor rooted", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { mind: 1, order: 1 } })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: null })
      .unit(P2, "bf1", VEX, "vex")
      .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
      .hand(P1, MIRROR_IMAGE, "mirror")
      .build();
    await game.p1.cast("mirror", { targets: "ally" });
    await drainChain(game);
    const [token] = reflections(game);
    expect(game.state(token!)).toMatchObject({ isStunned: true });
    await game.advanceTurn(); // P1's Ending Step passes → P2's turn
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf(token!)).toBe("base"); // Temporary kills it only at P1's NEXT Beginning Phase
    expect(game.state(token!).isStunned).toBe(false);
    expect(game.state(token!).keywords).not.toContain("NoMove");
  });
});
