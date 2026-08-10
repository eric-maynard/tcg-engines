/**
 * Ruling 442a743774682710 — Dark Child - Starter (OGS-017 → ogs-017-024) · Legend
 *     "At the end of your turn, ready up to 2 runes."
 *   × Loose Cannon (OGN-251 → ogn-251-298) · Legend "At start of your Beginning Phase, draw 1 if you have one or
 *     fewer cards in your hand."
 *   × Iron Ballista (ogn-017-298) · Gear "This enters exhausted. [Exhaust]: Deal 2 to a unit at a battlefield."
 *
 * Q: Can you react to triggered abilities (Annie's / Jinx's legend) and activated abilities (Ballista's tap)?
 * A: Yes. Triggered abilities create a chain when they trigger, activated abilities when activated; once on the
 *    chain the other player gets priority and may play Reactions. Annie/Jinx triggers do not exhaust the legend;
 *    Ballista's exhaust is the COST of putting its ability on the chain.
 * Rules: 383.3 (triggered ability is placed on the chain), 378 (activated abilities), 330–336 (chain → priority).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DARK_CHILD = "ogs-017-024";
const LOOSE_CANNON = "ogn-251-298";
const IRON_BALLISTA = "ogn-017-298";

/** A vanilla 1-cost Reaction spell so "P2 may react" is directly observable. */
const TRICK = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 1,
  name: "Trick",
  timing: "reaction",
} as const;

describe("Ruling 442a743774682710 — triggered and activated abilities open a chain that can be reacted to", () => {
  test("Dark Child (Annie legend): ending P1's turn puts the 'ready up to 2 runes' trigger on the chain; P2 gets priority and may cast a Reaction; the legend is not exhausted", async () => {
    const game = await scenario()
      .legend(P1, DARK_CHILD, "annie")
      .rune(P1, "fury", { alias: "r1", exhausted: true })
      .rune(P1, "fury", { alias: "r2", exhausted: true })
      .resources(P2, { energy: 1 })
      .hand(P2, TRICK, "trick")
      .build();
    await game.p1.endTurn();
    expect(game.phase()).toBe("ending");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "annie", controller: P1, triggered: true })]);
    // Walk P1's finalization choices / priority until P2 holds priority on this chain.
    for (let i = 0; i < 6 && game.actingSeat() !== P2; i++) {
      const d = game.decision();
      if (d?.kind === "pick") {
        await game.p1.pick("r1", "r2");
      } else {
        await game.p1.passPriority();
      }
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.chain().some((c) => c.cardId === "annie" && c.triggered)).toBe(true);
    expect(game.p2.can("cast", "trick")).toBe(true);
    expect(game.state("annie").isExhausted).toBe(false);
    await game.p2.cast("trick");
    expect(game.chain().map((c) => c.cardId)).toEqual(["annie", "trick"]);
  });

  test("Loose Cannon (Jinx legend): at the start of P1's Beginning Phase the draw trigger goes on the chain and P2 may react to it; the legend is not exhausted", async () => {
    const game = await scenario()
      .active(P2)
      .legend(P1, LOOSE_CANNON, "jinx")
      .resources(P2, { energy: 1 })
      .hand(P2, TRICK, "trick")
      .build();
    expect(game.p1.hand()).toHaveLength(0); // "one or fewer cards"
    await game.p2.endTurn();
    // Drain P2's own end of turn; stop when Jinx's trigger is on the chain.
    for (let i = 0; i < 10 && !game.chain().some((c) => c.cardId === "jinx"); i++) {
      const d = game.decision();
      if (!d || d.kind !== "action") break;
      await game.seat(d.seat).passPriority();
    }
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "jinx", controller: P1, triggered: true })]);
    for (let i = 0; i < 4 && game.actingSeat() !== P2; i++) {
      await game.p1.passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    // P2's pool was emptied at its own end of turn — refill 1 so the Reaction is castable.
    await game.p2.do("addResources", { energy: 1 });
    expect(game.p2.can("cast", "trick")).toBe(true);
    expect(game.state("jinx").isExhausted).toBe(false);
  });

  test("Iron Ballista: activating '[Exhaust]: Deal 2' exhausts it as the COST and puts the ability on the chain; P2 may react before it resolves", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Target" }, "target")
      .gear(P1, IRON_BALLISTA, "ballista")
      .resources(P2, { energy: 1 })
      .hand(P2, TRICK, "trick")
      .build();
    expect(game.state("ballista").isExhausted).toBe(false);
    await game.p1.activate("ballista", 1, { answers: ["target"] });
    // If the target is asked at activation, the scripted answer covered it; otherwise it is asked on resolution.
    expect(game.state("ballista").isExhausted).toBe(true); // cost paid up front
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ballista", controller: P1, triggered: false })]);
    expect(game.state("target").damage).toBe(0); // nothing resolved yet
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "trick")).toBe(true);
    await game.p2.cast("trick");
    expect(game.chain().map((c) => c.cardId)).toEqual(["ballista", "trick"]);
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("target");
      await game.settle();
    }
    expect(game.state("target").damage).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
