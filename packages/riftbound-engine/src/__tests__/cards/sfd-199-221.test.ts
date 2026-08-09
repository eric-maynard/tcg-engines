/**
 * Prodigal Explorer — sfd-199-221 · Legend (Ezreal) · Mind/Chaos
 *
 *   [Exhaust]: [Reaction] — Draw 1. Use only if you've chosen enemy units and/or gear twice this
 *   turn with spells or unit abilities.
 *
 * Rules: 377.2.b "Use only if …" is a restriction on ACTIVATING (checked when you would activate,
 * against this turn's history); 355 choosing = naming an object for a spell/ability as it is played
 * or as a triggered ability resolves; 813 Reaction (Closed States, any player's turn); this is NOT an
 * [Add] ability, so it is a normal chain item (377.3) that the opponent may answer; 165/315 "this
 * turn" history resets at the turn boundary; the legend readies only at its controller's Awaken.
 *
 * Head-judge corner cases covered here:
 *   1. Zero / one qualifying choice → not usable; exactly two → usable. Choosing FRIENDLY units never
 *      qualifies. (0, 1 and 3 are the interesting counts; 2 is the threshold.)
 *   2. What counts as a chooser: spells ✓, UNIT abilities ✓ (Ezreal, Dashing's attack trigger),
 *      gear/legend abilities ✗ (Tools of Empire choosing an enemy is not "a spell or unit ability").
 *   3. Enemy GEAR counts as well as enemy units ("and/or"): Factory Recall on their gear + one spell
 *      on their unit = two.
 *   4. Reaction on the opponent's turn: two Frigid Touches in their chain, then the legend on top —
 *      LIFO means the card is drawn BEFORE either spell resolves.
 *   5. Once exhausted it is done for the turn even if you keep choosing enemies; it stays exhausted
 *      through the opponent's turn and readies at your Awaken — where last turn's choices no longer count.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-199-221";
const FRIGID_TOUCH = "sfd-066-221"; // Mind Reaction 2: give a unit −2 Might this turn
const FACTORY_RECALL = "sfd-135-221"; // Chaos Action 1: return a gear to its owner's hand
const EZREAL_DASHING = "sfd-082-221"; // Mind 3-Might: When I attack or defend, deal damage equal to my Might to an enemy unit here. I don't deal combat damage.
const TOOLS_OF_EMPIRE = "ven-077-166"; // Body gear: [Exhaust]: Give a unit +2 Might this turn.
const CLEAVE = "ogn-004-298";
const FILLER = "ogn-175-298";

/** P1's turn with the legend, `n` Frigid Touches in hand (2 energy each), an enemy and a friendly unit, named deck. */
function board(n: number, extraEnergy = 0) {
  const b = scenario()
    .resources(P1, { energy: 2 * n + extraEnergy })
    .legend(P1, CARD, "pe")
    .unit(P2, "base", { might: 5, name: "Foe" }, "foe")
    .unit(P1, "base", { might: 5, name: "Friend" }, "friend")
    .deck(P1, [FILLER, FILLER, FILLER], ["d1", "d2", "d3"]);
  for (let i = 1; i <= n; i++) {
    b.hand(P1, FRIGID_TOUCH, `ft${i}`);
  }
  return b;
}

type Built = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;
async function frigid(game: Built, alias: string, target: string): Promise<void> {
  await game.p1.cast(alias, { targets: target });
  await game.settle();
}

describe("Prodigal Explorer (sfd-199-221)", () => {
  test("two enemy-unit choices with spells this turn → [Exhaust] puts 'Draw 1' on the chain (opponent gets priority), then draws exactly one", async () => {
    const game = await board(2).build();
    await frigid(game, "ft1", "foe");
    await frigid(game, "ft2", "foe"); // the same enemy twice is still two choices
    expect(game.state("foe").might).toBe(1);
    expect(game.p1.can("activate", "pe")).toBe(true);
    await game.p1.activate("pe");
    expect(game.state("pe").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // cost is [Exhaust] only
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "pe", controller: P1, triggered: false })]);
    expect(game.p1.hand()).toEqual([]);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2); // not an [Add] ability — it can be answered
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.deck()[0]).toBe("d2");
    expect(game.violations()).toEqual([]);
  });

  test("with NO enemy choices this turn the ability must not be usable (377.2.b 'Use only if…') — it is offered unconditionally", async () => {
    // Expected: not offered / activation rejected, hand stays empty. Actual: the parsed ability
    // dropped the restriction, so it activates and draws.
    const game = await board(0).build();
    expect(game.p1.can("activate", "pe")).toBe(false);
    const r = await game.p1.try((p) => p.activate("pe"));
    expect(r.ok).toBe(false);
    await game.settle();
    expect(game.p1.hand()).toEqual([]);
  });

  test("ONE enemy choice is one short of 'twice' — the ability must still be unusable", async () => {
    const game = await board(1).build();
    await frigid(game, "ft1", "foe");
    expect(game.p1.can("activate", "pe")).toBe(false);
  });

  test("choosing FRIENDLY units twice does not qualify ('enemy units and/or gear')", async () => {
    const game = await board(2).build();
    await frigid(game, "ft1", "friend");
    await frigid(game, "ft2", "friend");
    expect(game.state("friend").might).toBe(1);
    expect(game.p1.can("activate", "pe")).toBe(false);
  });

  test("a UNIT ability counts: Ezreal, Dashing's attack trigger chooses the defender (1) + one Frigid Touch on an enemy (2) → draw", async () => {
    const game = await board(1)
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", EZREAL_DASHING, "ez")
      .unit(P2, "bf1", { might: 2, name: "Blocker" }, "blocker")
      .build();
    await frigid(game, "ft1", "foe");
    await game.p1.move("ez", "bf1");
    await game.settle({ policy: "first" }); // trigger picks the lone enemy there, deals 3, combat resolves
    expect(game.zoneOf("blocker")).toBe("trash");
    expect(game.locationOf("ez")).toBe("bf1");
    expect(game.p1.can("activate", "pe")).toBe(true);
    await game.p1.activate("pe");
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]);
  });

  test("enemy GEAR counts ('and/or'): Factory Recall on their gear + Frigid Touch on their unit → usable, draws 1", async () => {
    const game = await board(1, 1).gear(P2, TOOLS_OF_EMPIRE, "theirgear").hand(P1, FACTORY_RECALL, "recall").build();
    await game.p1.cast("recall", { targets: "theirgear" });
    await game.settle();
    expect(game.zoneOf("theirgear")).toBe("hand");
    await frigid(game, "ft1", "foe");
    expect(game.p1.can("activate", "pe")).toBe(true);
    await game.p1.activate("pe");
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]);
  });

  test("a GEAR ability's choice is not 'a spell or unit ability' — Tools of Empire on an enemy + one spell = only one qualifying choice", async () => {
    const game = await board(1).gear(P1, TOOLS_OF_EMPIRE, "tools").build();
    await game.p1.activate("tools", 1, { answers: ["foe"] });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("foe");
      await game.settle();
    }
    expect(game.state("foe").might).toBe(7);
    await frigid(game, "ft1", "foe");
    expect(game.state("foe").might).toBe(5);
    expect(game.p1.can("activate", "pe")).toBe(false);
  });

  test("[Reaction] on the opponent's turn: two Frigid Touches into their chain, then the legend on top — LIFO draws the card before either spell resolves", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .resources(P1, { energy: 4 })
      .legend(P1, CARD, "pe")
      .unit(P2, "base", { might: 6, name: "Foe" }, "foe")
      .hand(P2, CLEAVE, "cleave")
      .hand(P1, FRIGID_TOUCH, "ft1")
      .hand(P1, FRIGID_TOUCH, "ft2")
      .deck(P1, [FILLER, FILLER], ["d1", "d2"])
      .build();
    expect(game.p1.legal()).toEqual([]); // nothing on their Neutral Open turn
    await game.p2.cast("cleave", { targets: "foe" });
    await game.p2.passPriority();
    await game.p1.cast("ft1", { targets: "foe" });
    await game.p1.cast("ft2", { targets: "foe" });
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("activate", "pe")).toBe(true);
    await game.p1.activate("pe");
    expect(game.chain().map((c) => c.name)).toEqual(["Cleave", "Frigid Touch", "Frigid Touch", "Prodigal Explorer"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // top item (the draw) resolves first
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.state("foe").might).toBe(6); // spells below have not resolved yet
    await game.settle();
    expect(game.state("foe").might).toBe(2); // 6 − 2 − 2 (Cleave only grants Assault)
    expect(game.chain()).toEqual([]);
  });

  test("[Exhaust] is real: after one use it is gone for the turn even though you keep choosing enemies (a third Frigid Touch changes nothing)", async () => {
    const game = await board(3).build();
    await frigid(game, "ft1", "foe");
    await frigid(game, "ft2", "foe");
    await game.p1.activate("pe");
    await game.settle();
    expect(game.p1.hand()).toEqual(["ft3", "d1"]);
    await frigid(game, "ft3", "foe");
    expect(game.p1.can("activate", "pe")).toBe(false);
    expect((await game.p1.try((p) => p.activate("pe"))).ok).toBe(false);
    expect(game.p1.hand()).toEqual(["d1"]);
  });

  test("stays exhausted through the opponent's turn and readies at your own Awaken", async () => {
    const game = await board(2).build();
    await frigid(game, "ft1", "foe");
    await frigid(game, "ft2", "foe");
    await game.p1.activate("pe");
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("pe").isExhausted).toBe(true);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("pe").isReady).toBe(true);
    expect(game.p1.hand()).toEqual(["d1", "d2"]); // the activation's draw + this turn's draw step
  });

  test("'this turn' — last turn's two enemy choices do not carry over: on your next turn (legend ready again) it must be unusable until you choose twice more", async () => {
    const game = await board(2).build();
    await frigid(game, "ft1", "foe");
    await frigid(game, "ft2", "foe");
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("pe").isReady).toBe(true);
    expect(game.p1.can("activate", "pe")).toBe(false);
  });

  test("registry payload: one activated ability — cost {exhaust}, timing reaction, effect draw 1 — and it SHOULD carry the 'chosen enemy … twice this turn' restriction", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", championTag: "Ezreal", name: "Prodigal Explorer" });
    expect(def?.domain).toEqual(["mind", "chaos"]);
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({ cost: { exhaust: true }, effect: { amount: 1, type: "draw" }, timing: "reaction", type: "activated" });
  });

  test("registry payload dropped the 'Use only if you've chosen enemy units and/or gear twice this turn…' restriction (parsed ability has no restrictions/condition)", async () => {
    const a = (await loadDefaultCardPool()).get(CARD)?.abilities?.[0] as { restrictions?: unknown[]; condition?: unknown } | undefined;
    expect((a?.restrictions?.length ?? 0) > 0 || a?.condition !== undefined).toBe(true);
  });
});
