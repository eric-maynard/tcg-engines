/**
 * Ruling 4d66cf9176b76991 — Defy (OGN-045 → ogn-045-298) · Reaction · [1][calm] "Counter a spell that costs no more than [4]
 *   and no more than [rainbow]."
 *   × Ravenbloom Student (OGN-103 → ogn-103-298) "When you play a spell, give me +1 [Might] this turn."
 *   × Falling Star (OGN-029 → ogn-029-298) · [2][fury][fury] "Deal 3 to a unit. Deal 3 to a unit." — costs 2 power → not Defy-able.
 *
 * Q: Can you cast Defy with no valid targets?
 * A: No — with no legal spell to counter it fails the legality check and never reaches the chain (e.g. against Falling Star,
 *    whose [fury][fury] exceeds "no more than [rainbow]"). You MAY Defy your own spell, but then only Defy counts as a played
 *    spell for Ravenbloom Student (+1), the countered spell does not.
 * Rules: 355.8 (no legal choice → can't play), 412.1.a / 425 (a countered spell is not played/resolved), 359.3.e.10.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const RAVENBLOOM_STUDENT = "ogn-103-298";
const FALLING_STAR = "ogn-029-298";
const CLEAVE = "ogn-004-298"; // a [1] spell that IS Defy-able

describe("Ruling 4d66cf9176b76991 — Defy needs a legal spell to counter", () => {
  test("empty chain: with nothing to counter, Defy is not castable — not on the opponent's turn, not on your own", async () => {
    const theirs = await scenario().resources(P2, { energy: 1, power: { calm: 1 } }).hand(P2, DEFY, "defy").build();
    expect(theirs.chain()).toEqual([]);
    expect(theirs.p2.can("cast", "defy")).toBe(false);
    expect((await theirs.p2.try((p) => p.cast("defy"))).ok).toBe(false);
    expect(theirs.zoneOf("defy")).toBe("hand");
    const mine = await scenario().active(P2).resources(P2, { energy: 1, power: { calm: 1 } }).hand(P2, DEFY, "defy").build();
    expect(mine.p2.can("cast", "defy")).toBe(false);
    expect(mine.p2.resources()).toEqual({ energy: 1, power: { calm: 1 } });
  });

  test("Falling Star ([2] + two power) on the chain is NOT a legal Defy target ('no more than [rainbow]'): Defy stays uncastable and Falling Star resolves for its full 3 + 3", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 2 } })
      .resources(P2, { energy: 1, power: { calm: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 7, name: "Big" }, "big")
      .hand(P1, FALLING_STAR, "star")
      .hand(P2, DEFY, "defy")
      .build();
    await game.p1.cast("star", { targets: ["big", "big"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["star"]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "defy")).toBe(false);
    const r = await game.p2.try((p) => p.cast("defy", { targets: "star" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("defy")).toBe("hand"); // never revealed onto the chain
    expect(game.p2.resources()).toEqual({ energy: 1, power: { calm: 1 } });
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("big").damage).toBe(6);
  });

  test("contrast: a [1] spell (Cleave) on the chain IS a legal target — Defy becomes castable and counters it", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .resources(P2, { energy: 1, power: { calm: 1 } })
      .unit(P1, "base", { might: 2, name: "Grunt" }, "grunt")
      .hand(P1, CLEAVE, "cleave")
      .hand(P2, DEFY, "defy")
      .build();
    await game.p1.cast("cleave", { targets: "grunt" });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "defy")).toBe(true);
    const targets = game.p2.option("cast", "defy")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(targets.flat()).toEqual(["cleave"]);
    await game.p2.cast("defy", { targets: "cleave" });
    await game.settle();
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.state("grunt").grantedKeywords).toEqual([]); // countered: no Assault
  });

  test("Defying your OWN spell with Ravenbloom Student out: legal, and the Student ends at exactly +1 — from Defy resolving; the countered Cleave was never 'played'", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { calm: 1 } })
      .unit(P1, "base", RAVENBLOOM_STUDENT, "student")
      .unit(P1, "base", { might: 2, name: "Grunt" }, "grunt")
      .hand(P1, CLEAVE, "cleave")
      .hand(P1, DEFY, "defy")
      .build();
    expect(game.state("student").might).toBe(2);
    await game.p1.cast("cleave", { targets: "grunt" });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // caster holds priority first
    expect(game.p1.can("cast", "defy")).toBe(true);
    await game.p1.cast("defy", { targets: "cleave" }); // your own spell is a legal "a spell"
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "defy"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.state("grunt").grantedKeywords).toEqual([]); // Cleave countered
    expect(game.state("student").might).toBe(3); // +1 (Defy), NOT +2
    expect(game.state("student").mightModifier).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
