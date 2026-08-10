/**
 * Ruling 56678be5dcdf30f9 — Divine Judgment (OGN-244 → ogn-244-298) · Action · [7][order][order] "Each player chooses 2 units,
 *   2 gear, 2 runes, and 2 cards in their hands. Recycle the rest."
 *   × Hidden Blade (OGN-213 → ogn-213-298) · Action · [2][order] · [Hidden] "Kill a unit at a battlefield. Its controller draws 2."
 *
 * Q: Can I react to my opponent's Divine Judgment with a Hidden Blade hidden at my battlefield, killing my OWN unit there?
 * A: Yes. A face-down card is played at Reaction speed for [0], so it can answer Divine Judgment on the chain; "a unit at a
 *    battlefield" includes your own (here: at that battlefield). It resolves first — your unit dies and you (its controller)
 *    draw 2 — then Divine Judgment resolves. (Not on the turn it was hidden.)
 * Rules: 811 (Hidden: gains Reaction, [0], acts "here", not the turn it was hidden), 336/340 (LIFO), 359.3.e.14 (linked
 *        "its controller draws 2").
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DIVINE_JUDGMENT = "ogn-244-298";
const HIDDEN_BLADE = "ogn-213-298";

/**
 * P2's turn 5 with exactly [7] + order×2. P1 controls bf1 with Doomed (2) and Keeper (3) and has Hidden Blade face down there
 * (hidden on an earlier turn). P1 also has a third unit in base so Divine Judgment's "choose 2 units" is a real choice.
 */
function board() {
  return scenario()
    .turn(5)
    .active(P2)
    .resources(P2, { energy: 7, power: { order: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Doomed" }, "doomed")
    .unit(P1, "bf1", { might: 3, name: "Keeper" }, "keeper")
    .unit(P1, "base", { might: 4, name: "Homebody" }, "homebody")
    .unit(P2, "base", { might: 3, name: "Theirs" }, "theirs")
    .facedown(P1, "bf1", HIDDEN_BLADE, "blade")
    .hand(P2, DIVINE_JUDGMENT, "dj");
}

/** P2 casts Divine Judgment and passes; P1 now holds priority with DJ on the chain. */
async function djOnChain(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("dj");
  expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dj", controller: P2 })]);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 56678be5dcdf30f9 — answering Divine Judgment with a hidden Hidden Blade on your own unit", () => {
  test("with Divine Judgment on the chain (opponent's turn, Closed state) P1 may play the face-down Hidden Blade for [0], and its legal victims 'here' include P1's OWN units", async () => {
    const game = await djOnChain();
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.can("reveal", "blade")).toBe(true);
    await game.p1.reveal("blade", { answers: ["doomed"] });
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.card ?? o.key).toSorted()).toEqual(["doomed", "keeper"]); // own units at bf1
      await game.p1.pick("doomed");
    }
    expect(game.p1.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["dj", "blade"]);
    expect(game.chain()[1]).toMatchObject({ controller: P1, targets: ["doomed"] });
  });

  test("Hidden Blade resolves FIRST: Doomed dies and P1 — its controller — draws 2, all while Divine Judgment is still waiting", async () => {
    const game = await djOnChain();
    const hand0 = game.p1.hand().length;
    await game.p1.reveal("blade", { answers: ["doomed"] });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("doomed");
    }
    await game.p1.passPriority();
    await game.p2.passPriority(); // Blade resolves (LIFO)
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("doomed")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand0 + 2);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dj" })]);
    expect(game.zoneOf("keeper")).toBe("battlefield-bf1"); // P1 still holds bf1
  });

  test("then Divine Judgment resolves as normal (each player keeps 2 per category, rest recycled) — the whole line is legal, no invariant broken", async () => {
    const game = await djOnChain();
    await game.p1.reveal("blade", { answers: ["doomed"] });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("doomed");
    }
    await game.settle({ policy: "first" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("dj")).toBe("trash");
    expect(game.zoneOf("doomed")).toBe("trash"); // killed by the Blade, not recycled
    expect(game.p1.units().length).toBeLessThanOrEqual(2); // "chooses 2 units … recycle the rest"
    expect(game.p1.hand().length).toBeLessThanOrEqual(2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("nuance: a Hidden Blade hidden THIS turn cannot be played yet — P1 hides it on their own turn and gets no reveal option that turn", async () => {
    const game = await scenario()
      .turn(5)
      .resources(P1, { power: { order: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Doomed" }, "doomed")
      .hand(P1, HIDDEN_BLADE, "blade")
      .build();
    await game.p1.hide("blade", "bf1");
    expect(game.zoneOf("blade")).toBe("facedown-bf1");
    expect(game.p1.can("reveal", "blade")).toBe(false);
  });
});
