/**
 * Ruling 1097a2657e3ce0e7 — Unyielding Spirit (OGN-145 → ogn-145-298) × Carnivorous Snapvine (OGN-149 → ogn-149-298)
 *                           × Challenge (OGN-128 → ogn-128-298) (× Last Breath ogn-260-298 — same templating)
 *   Unyielding Spirit: 1 + [body] [Reaction] "Prevent all spell and ability damage this turn."
 *   Carnivorous Snapvine: 5 + [body][body], 6 Might — "When you play me, choose an enemy unit at a battlefield.
 *   We deal damage equal to our Mights to each other."
 *   Challenge: 2 + [body] [Action] "Choose a friendly unit and an enemy unit. They deal damage equal to their
 *   Mights to each other."
 *
 * Q: Is Snapvine's Carnivorous damage combat damage or ability damage — can Unyielding Spirit prevent it?
 * A: Neither: the UNITS deal the damage to each other, so it is not spell/ability damage (Unyielding Spirit
 *    does not prevent it) and not combat damage (stun does not stop it). Same for Challenge / Last Breath.
 * Rules: damage source attribution ("[unit] deals damage"), 145 prevent wording, stun only stops COMBAT damage.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const UNYIELDING_SPIRIT = "ogn-145-298";
const SNAPVINE = "ogn-149-298";
const CHALLENGE = "ogn-128-298";

/** Inline 1-cost spell dealing 3 — genuine SPELL damage, the control that Unyielding Spirit does work. */
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
};

/** P1's turn. P2's 4-Might Target at bf1 (optionally stunned); P1's 3-Might Friend in base; P2 holds Unyielding Spirit (exact 1 + [body]). */
function board(opts: { stunnedTarget?: boolean } = {}) {
  return scenario()
    .resources(P1, { energy: 8, power: { body: 3 } }) // Snapvine 5+[body][body], Challenge 2+[body], Bolt 1
    .resources(P2, { energy: 1, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Target" }, "target", opts.stunnedTarget ? { stunned: true } : undefined)
    .unit(P1, "base", { might: 3, name: "Friend" }, "friend")
    .hand(P1, SNAPVINE, "snap")
    .hand(P1, CHALLENGE, "challenge")
    .hand(P1, BOLT, "bolt")
    .hand(P2, UNYIELDING_SPIRIT, "spirit");
}

/** P1 plays Snapvine; its play trigger goes on the chain naming the (only) enemy unit at a battlefield. */
async function playSnapvine(game: Game): Promise<void> {
  await game.p1.play("snap");
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
    await game.p1.pick("target");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "snap", controller: P1, targets: ["target"], triggered: true })]);
}

describe("Ruling 1097a2657e3ce0e7 — Snapvine/Challenge 'deal damage to each other' is unit damage: Unyielding Spirit can't prevent it, stun can't stop it", () => {
  test("control: Unyielding Spirit DOES prevent genuine spell damage — P2 answers a 3-damage bolt with it and the Target takes 0", async () => {
    const game = await board().build();
    await game.p1.cast("bolt", { targets: "target" });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "spirit")).toBe(true);
    await game.p2.cast("spirit");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.state("target")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.zoneOf("spirit")).toBe("trash");
  });

  test("Snapvine's trigger answered by Unyielding Spirit: Spirit resolves first, yet the exchange still happens in full — Target (4) takes 6 and dies, Snapvine takes 4", async () => {
    const game = await board().build();
    await playSnapvine(game);
    await game.p1.passPriority();
    expect(game.p2.can("cast", "spirit")).toBe(true);
    await game.p2.cast("spirit");
    expect(game.chain().map((c) => c.cardId)).toEqual(["snap", "spirit"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("spirit")).toBe("trash"); // it resolved — it just had nothing it could prevent
    expect(game.zoneOf("target")).toBe("trash");
    expect(game.state("snap")).toMatchObject({ damage: 4, zone: "base" }); // 6 Might, survives with 4 marked
    expect(game.violations()).toEqual([]);
  });

  test("not combat damage either: a STUNNED Target still deals its 4 to Snapvine (stun only stops combat damage), and still dies to Snapvine's 6", async () => {
    const game = await board({ stunnedTarget: true }).build();
    expect(game.state("target").isStunned).toBe(true);
    await playSnapvine(game);
    await game.settle();
    expect(game.zoneOf("target")).toBe("trash");
    expect(game.state("snap")).toMatchObject({ damage: 4, zone: "base" });
  });

  test("same principle for Challenge: P2's Unyielding Spirit in response prevents nothing — Friend (3) takes 4 and dies, Target (4) takes 3 and survives with 3 marked", async () => {
    const game = await board().build();
    await game.p1.cast("challenge", { targets: ["friend", "target"] });
    expect(game.p1.resources()).toEqual({ energy: 6, power: { body: 2 } });
    await game.p1.passPriority();
    await game.p2.cast("spirit");
    await game.settle();
    expect(game.zoneOf("friend")).toBe("trash");
    expect(game.state("target")).toMatchObject({ damage: 3, zone: "battlefield-bf1" });
    expect(game.zoneOf("challenge")).toBe("trash");
    expect(game.zoneOf("spirit")).toBe("trash");
  });
});
