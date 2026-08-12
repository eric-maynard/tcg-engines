/**
 * Ruling 73a0be32552bda6a — Virtuoso (UNL-181 → unl-181-219) · Legend (Jhin)
 *   "When you play a spell, if you spent [4] or more, you may banish it. Then, if there are four spells
 *    banished with me, put each in its trash, channel 4 runes, and draw 1."
 *
 * Q: When a card says to channel runes without naming a state, do they enter ready or exhausted?
 * A: Ready. Channeled runes default to ready; an effect must SAY "channel X runes exhausted" to get the
 *    other state. Jhin's "channel 4 runes" therefore gives four READY runes.
 * Rules: 430.2 (channeled runes enter ready by default; the rule's own example "Channel 1 rune exhausted"
 *        is the exception that proves specification is required).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const VIRTUOSO = "unl-181-219";
const SACRIFICE = "unl-173-219"; // "…channel 1 rune EXHAUSTED" — the contrast case
const TITAN = { cardType: "unit", might: 5, name: "Titan" }; // a 5-Might ([Mighty]) body for Sacrifice's additional cost

/** Spell with a printed [4] cost and no targets, so each cast trips Jhin's "spent [4] or more". */
const RITUAL = {
  abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 4,
  name: "Ritual (inline: Draw 1)",
};

describe("Ruling 73a0be32552bda6a — 'channel 4 runes' with no state named ⇒ the runes enter READY (430.2)", () => {
  test("banishing four [4]-cost spells with Jhin fires the payoff: four freshly channeled runes, all ready", async () => {
    const game = await scenario()
      .legend(P1, VIRTUOSO, "jhin")
      .resources(P1, { energy: 20 })
      .hand(P1, RITUAL, "r1")
      .hand(P1, RITUAL, "r2")
      .hand(P1, RITUAL, "r3")
      .hand(P1, RITUAL, "r4")
      .build();
    expect(game.p1.runes()).toHaveLength(0);

    for (const spell of ["r1", "r2", "r3", "r4"]) {
      await game.p1.cast(spell);
      for (let i = 0; i < 6; i++) {
        const stop = await game.settle();
        const d = game.decision();
        if (stop.reason !== "unanswered" || !d) break;
        if (d.kind === "yes-no") await game.seat(d.seat).yes(); // "you may banish it"
        else if (d.kind === "pick") await game.seat(d.seat).pick(d.options[0]!.key);
        else break;
      }
    }

    // The fourth banish completes the set: the four spells go to the trash, 4 runes are channeled, 1 card drawn.
    expect(game.p1.banishment()).toHaveLength(0);
    expect(game.p1.runes()).toHaveLength(4);
    expect(game.p1.runes({ ready: true })).toHaveLength(4); // ready — nothing said "exhausted"
    for (const rune of game.p1.runes()) {
      expect(game.state(rune).isExhausted).toBe(false);
    }
    expect(game.violations()).toEqual([]);
  });

  test("contrast — a card that DOES say it: Sacrifice's 'channel 1 rune exhausted' yields an exhausted rune", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", TITAN, "titan").hand(P1, SACRIFICE, "sac").build();
    await game.p1.cast("sac", { sacrifice: "titan" });
    await game.settle();
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
    expect(game.state(game.p1.runes()[0]!).isExhausted).toBe(true);
  });
});
