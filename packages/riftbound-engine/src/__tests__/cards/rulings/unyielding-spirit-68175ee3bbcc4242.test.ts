/**
 * Ruling 68175ee3bbcc4242 — Unyielding Spirit (OGN-145 → ogn-145-298) · Reaction · Body · [1][body]
 *   "Prevent all spell and ability damage this turn."
 *   × Void Seeker (ogn-024-298, [3][fury] "Deal 4 to a unit at a battlefield. Draw 1."), Anivia, Primal (ogn-148-298,
 *     "When I attack, deal 3 to all enemy units here."), Challenge (ogn-128-298, [2][body] "Choose a friendly unit and an
 *     enemy unit. They deal damage equal to their Mights to each other."), Stupefy (ogn-095-298, "−1 Might … Draw 1.").
 *   (Also cited: Block, Singularity, Tibbers, Smoke Screen, Imperial Decree, Icathian Rain.)
 *
 * Q: How does Unyielding Spirit prevent damage — what does it block and not block?
 * A: Played (even as a reaction), it prevents damage from SPELLS and ABILITIES for the rest of the turn — only the damage:
 *    the spell still resolves its other parts (Void Seeker still draws). It does NOT stop units dealing damage to each
 *    other (Challenge), nor non-damage effects like Might reduction (Stupefy/Smoke Screen).
 * Rules: prevention effects, damage sources (spell/ability vs unit), "this turn" duration.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const UNYIELDING_SPIRIT = "ogn-145-298";
const VOID_SEEKER = "ogn-024-298";
const ANIVIA = "ogn-148-298";
const CHALLENGE = "ogn-128-298";
const STUPEFY = "ogn-095-298";

/**
 * P2's turn. P1 holds bf1 with Big (6) and Small (2); P1: Unyielding Spirit + [1][body]. P2: Anivia (8) and Brute (4) in
 * base; Void Seeker, Challenge, Stupefy in hand with [6] + fury + body; known deck top.
 */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 6, name: "Big" }, "big")
    .unit(P1, "bf1", { might: 2, name: "Small" }, "small")
    .hand(P1, UNYIELDING_SPIRIT, "spirit")
    .resources(P1, { energy: 1, power: { body: 1 } })
    .unit(P2, "base", ANIVIA, "anivia")
    .unit(P2, "base", { might: 4, name: "Brute" }, "brute")
    .hand(P2, VOID_SEEKER, "seeker")
    .hand(P2, CHALLENGE, "challenge")
    .hand(P2, STUPEFY, "stupefy")
    .resources(P2, { energy: 6, power: { body: 1, fury: 1 } })
    .deck(P2, ["ogn-175-298", "ogn-175-298"], ["p2d1", "p2d2"]);
}

/** P2 Void Seekers Small; P1 answers with Unyielding Spirit (chain 2); everything resolves. */
async function seekerAnsweredBySpirit(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("seeker", { targets: "small" });
  await game.p2.passPriority();
  expect(game.p1.can("cast", "spirit")).toBe(true); // playable as a Reaction
  await game.p1.cast("spirit");
  expect(game.chain().map((c) => c.cardId)).toEqual(["seeker", "spirit"]);
  expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  await game.settle();
  expect(game.chain()).toEqual([]);
  return game;
}

describe("Ruling 68175ee3bbcc4242 — Unyielding Spirit prevents spell/ability DAMAGE this turn, nothing else", () => {
  test("as a reaction to Void Seeker: the 4 damage to Small is prevented (Small lives, 0 damage) but Void Seeker still resolves its non-damage part — P2 draws 1", async () => {
    const game = await seekerAnsweredBySpirit();
    expect(game.zoneOf("seeker")).toBe("trash");
    expect(game.zoneOf("spirit")).toBe("trash");
    expect(game.zoneOf("small")).toBe("battlefield-bf1");
    expect(game.state("small").damage).toBe(0);
    expect(game.p2.hand().sort()).toEqual(["challenge", "p2d1", "stupefy"]); // drew p2d1
    expect(game.violations()).toEqual([]);
  });

  test("lasts the rest of the turn and covers UNIT ABILITIES: later that turn Anivia attacks bf1 — her 'deal 3 to all enemy units here' deals nothing", async () => {
    const game = await seekerAnsweredBySpirit();
    await game.p2.move("anivia", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "anivia", controller: P2, triggered: true })]);
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("big").damage).toBe(0);
    expect(game.state("small").damage).toBe(0);
    expect(game.zoneOf("small")).toBe("battlefield-bf1");
  });

  test("does NOT stop units damaging each other: Challenge [Brute 4, Small 2] — Small takes 4 and dies, Brute takes 2", async () => {
    const game = await seekerAnsweredBySpirit();
    await game.p2.cast("challenge", { targets: ["brute", "small"] });
    await game.settle();
    expect(game.zoneOf("challenge")).toBe("trash");
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.state("brute").damage).toBe(2);
  });

  test("does NOT stop non-damage effects: Stupefy still gives Big −1 Might (6 → 5) and P2 draws", async () => {
    const game = await seekerAnsweredBySpirit();
    await game.p2.cast("stupefy", { targets: "big" });
    await game.settle();
    expect(game.state("big").might).toBe(5);
    expect(game.p2.hand().sort()).toEqual(["challenge", "p2d1", "p2d2"]);
  });

  test("'this turn' only: on P2's NEXT turn a fresh Void Seeker at Small deals its 4 (Small dies)", async () => {
    const game = await board().hand(P2, VOID_SEEKER, "seeker2").build();
    await game.p2.cast("seeker", { targets: "small" });
    await game.p2.passPriority();
    await game.p1.cast("spirit");
    await game.settle();
    expect(game.state("small").damage).toBe(0);
    await game.advanceTurn(); // → P1
    await game.advanceTurn(); // → P2 again
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.do("addResources", { energy: 3, power: { fury: 1 } });
    await game.p2.cast("seeker2", { targets: "small" });
    await game.settle();
    expect(game.zoneOf("small")).toBe("trash");
  });
});
