/**
 * Ruling 01099451a4b29411 — Sona, Harmonious (OGN-073 → ogn-073-298) · 4 Might "At the end of your turn, if I'm at a
 *     battlefield, ready up to 4 friendly runes."
 *   × Renata Glasc, Mastermind (sfd-088-221) · 4 Might "[1][mind]: Draw 1. [4][mind]×4, [Exhaust]: Score 1 point. Use my
 *     abilities only while I'm at a battlefield."
 *
 * Q: Can you kill Sona or Renata after they use their abilities to stop the abilities from resolving?
 * A: No. Sona's "if I'm at a battlefield" is checked when the trigger occurs; Renata's restriction only gates ACTIVATING.
 *    Once the triggered / activated ability is on the chain, killing (or moving) the unit does not stop it — only a
 *    counter would. The runes ready / the card is drawn regardless.
 * Rules: 383 (triggered ability is an independent chain item once created), 377.2.b (activation restrictions apply to
 *        activating), 340 (LIFO), 151 ("using" = paying costs + putting it on the chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SONA = "ogn-073-298";
const RENATA = "sfd-088-221";
/** P2's inline free Reaction removal: deal 5 to a unit. */
const SNIPE = {
  abilities: [{ effect: { amount: 5, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Snipe",
  rulesText: "[Reaction]\nDeal 5 to a unit.",
  timing: "reaction",
} as const;

describe("Ruling 01099451a4b29411 — killing Sona / Renata in response does not stop an ability already on the chain", () => {
  /** P1's turn. Sona at P1's bf1 (a Holder keeps the battlefield either way); 3 EXHAUSTED calm runes; P2 holds Test Snipe. */
  function sonaBoard() {
    return scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", SONA, "sona")
      .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
      .runes(P1, "calm", 3, { exhausted: true })
      .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
      .hand(P2, SNIPE, "snipe");
  }

  /** P1 ends the turn → Sona's trigger; P1 passes; P2 Snipes Sona and the Snipe resolves (Sona dies) with her trigger still pending. */
  async function sonaSnipedInResponse(): Promise<Game> {
    const game = await sonaBoard().build();
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
    await game.p1.endTurn();
    expect(game.phase()).toBe("ending");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sona", controller: P1, triggered: true })]);
    // rule 402.2 / 355.5 — "ready up to 4 friendly runes" names its runes while the trigger is
    // finalized, before anyone holds priority.
    const fin = game.decision();
    if (fin?.kind === "pick" && fin.seat === P1) {
      await game.p1.pick(...fin.options.map((o) => o.key));
    }
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "snipe")).toBe(true);
    await game.p2.cast("snipe", { targets: "sona" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["sona", "snipe"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Snipe resolves
    expect(game.zoneOf("sona")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sona", triggered: true })]);
    return game;
  }

  test("Sona: her end-of-turn trigger is on the chain; P2 kills her in response (Snipe resolves first, Sona → trash) — the trigger is STILL on the chain", async () => {
    await sonaSnipedInResponse();
  });

  test("Sona: the orphaned trigger then resolves anyway — P1 readies the (up to 4) exhausted runes: all 3 calm runes end up ready", async () => {
    const game = await sonaSnipedInResponse();
    for (let i = 0; i < 12 && game.turnPlayer() === P1; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick(...d.options.slice(0, Math.min(3, d.max)).map((o) => o.key));
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.seat(d.seat).passPriority();
      } else if ((await game.settle()).reason !== "unanswered") {
        break;
      }
    }
    expect(game.p1.runes({ domain: "calm", ready: true })).toHaveLength(3);
    expect(game.zoneOf("sona")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  /** P1's turn with exactly [1][mind]. Renata READY at P1's bf1 (+ Holder); known deck top; P2 holds Test Snipe. */
  function renataBoard() {
    return scenario()
      .resources(P1, { energy: 1, power: { mind: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", RENATA, "renata")
      .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
      .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
      .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"])
      .hand(P2, SNIPE, "snipe");
  }

  test("Renata: 'use only while I'm at a battlefield' gates ACTIVATION — at bf1 with [1][mind] the Draw ability is offered and activating pays the cost and puts it on the chain", async () => {
    const game = await renataBoard().build();
    expect(game.p1.can("activate", "renata")).toBe(true);
    await game.p1.activate("renata", 0);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "renata", controller: P1, triggered: false })]);
    expect(game.p1.hand()).toEqual([]);
  });

  test("Renata: P2 kills her in response (Snipe resolves first) — her activated ability still resolves afterwards and P1 draws 1", async () => {
    const game = await renataBoard().build();
    await game.p1.activate("renata", 0);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.cast("snipe", { targets: "renata" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["renata", "snipe"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Snipe resolves → Renata dies
    expect(game.zoneOf("renata")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "renata", triggered: false })]);
    expect(game.p1.hand()).toEqual([]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
