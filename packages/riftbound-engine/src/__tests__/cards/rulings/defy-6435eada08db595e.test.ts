/**
 * Ruling 6435eada08db595e — Defy (OGN-045 → ogn-045-298) · Reaction · Calm · [1][calm]
 *   "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Wind Wall (ogn-064-298, "Counter a spell") — same idea; Hidden Blade (ogn-213-298, [Hidden]) as the hidden card.
 *
 * Q: How do hidden cards work, and what happens to them when units leave the battlefield?
 * A: You may only hide at a battlefield you CONTROL (paying [rainbow]); the card sits facedown there. If no units
 *    remain at that battlefield, the hidden card goes to the trash. A hidden card being played (revealed) can still
 *    be countered by Defy / Wind Wall.
 * Rules: 421 (Hide: controlled battlefield, [rainbow] cost), 107.3.d / 190.4.c (lose control → facedown removed at
 *        cleanup), 811 (playing from hidden is playing a spell → counterable), 425.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const HIDDEN_BLADE = "ogn-213-298";

describe("Ruling 6435eada08db595e — hiding needs a controlled battlefield; empty battlefield trashes the hidden card; a revealed hidden spell can be Defied", () => {
  test("hide legality + cost: with bf1 controlled (Holder there), bf2 the opponent's and bf3 open, Hidden Blade may be hidden ONLY at bf1, for one power of any domain ([rainbow])", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .battlefield("bf3", { controller: null })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .unit(P2, "bf2", { might: 2, name: "Foe" }, "foe")
      .hand(P1, HIDDEN_BLADE, "blade")
      .resources(P1, { energy: 0, power: { fury: 1 } }) // off-domain power: [rainbow] accepts any
      .build();
    const where = game.p1.option("hide", "blade")?.fields.find((f) => f.arg === "to")?.options ?? [];
    expect(where).toEqual(["bf1"]);
    expect((await game.p1.try((p) => p.hide("blade", "bf2"))).ok).toBe(false);
    expect((await game.p1.try((p) => p.hide("blade", "bf3"))).ok).toBe(false);
    await game.p1.hide("blade", "bf1");
    expect(game.zoneOf("blade")).toBe("facedown-bf1");
    expect(game.state("blade").isHidden).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.violations()).toEqual([]);
  });

  test("when the last unit leaves that battlefield (Holder walks back to base) P1 loses control and the hidden card is put in the trash at the next cleanup", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .hand(P1, HIDDEN_BLADE, "blade")
      .resources(P1, { power: { order: 1 } })
      .build();
    await game.p1.hide("blade", "bf1");
    expect(game.zoneOf("blade")).toBe("facedown-bf1");
    await game.p1.move("holder", "base");
    await game.settle();
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(null);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("a hidden card being PLAYED is still a spell on the chain: P1 flips Hidden Blade (hidden last turn) at Foe, P2 answers with Defy — countered, Foe lives, nobody draws", async () => {
    const game = await scenario()
      .turn(3)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .unit(P2, "bf1", { might: 2, name: "Foe" }, "foe")
      .facedown(P1, "bf1", HIDDEN_BLADE, "blade")
      .hand(P2, DEFY, "defy")
      .resources(P2, { energy: 1, power: { calm: 1 } })
      .build();
    const p2Hand = game.p2.hand().length;
    await game.p1.reveal("blade");
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("foe");
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", controller: P1, targets: ["foe"], triggered: false })]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // played from hidden for [0]
    await game.p1.passPriority();
    expect(game.p2.can("cast", "defy")).toBe(true); // Blade: cost 2 ≤ 4, one power ≤ [rainbow]
    await game.p2.cast("defy", { targets: "blade" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "defy"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("battlefield-bf1"); // countered: no kill …
    expect(game.p2.hand()).toHaveLength(p2Hand - 1); // … and no "its controller draws 2" (only Defy left the hand)
    expect(game.violations()).toEqual([]);
  });
});
