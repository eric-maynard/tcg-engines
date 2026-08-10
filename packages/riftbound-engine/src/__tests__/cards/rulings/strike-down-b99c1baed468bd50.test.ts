/**
 * Ruling b99c1baed468bd50 — Strike Down (SFD-107 → sfd-107-221) · Spell · Body · [3][body]
 *     "Choose an equipped friendly unit. It deals damage equal to its Might to an enemy unit. Then detach an Equipment
 *      from it."
 *   × Hexdrinker (sfd-102-221) · Equipment · +1 Might   × a 1-Might Recruit unit token (enemy)
 *
 * Q: My 1-Might unit wears a +1 Equipment (2 total). Strike Down it at an enemy token — does the token die? When the
 *    Equipment then detaches, does my unit die too?
 * A: The unit deals its CURRENT Might (2) → a token with ≤2 Might dies. Then the Equipment detaches and the unit drops to
 *    1 Might. It dies only if it already has damage marked ≥ its new Might (1); with 0 damage it survives at 1 Might. This
 *    is a spell, not combat — nothing hits back and nothing is recalled.
 * Rules: 143.2.a (damage ≥ Might ⇒ dies, checked continuously), 359.3.f.2 (Might read on resolution), 435.1 (detach).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STRIKE_DOWN = "sfd-107-221";
const HEXDRINKER = "sfd-102-221"; // Equipment · +1 Might
const RECRUIT_TOKEN = { cardType: "unit", isToken: true, might: 1, name: "Recruit", tags: ["Recruit"] } as const;

/** P1's turn with [3][body]. P1: Squire (1) wearing Hexdrinker (+1) with `priorDamage` marked. P2: a Recruit token (`tokenMight`). */
function board(priorDamage: number, tokenMight = 1) {
  return scenario()
    .resources(P1, { energy: 3, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 1, name: "Squire" }, "squire", { damage: priorDamage, equippedWith: ["hex"] })
    .gear(P1, HEXDRINKER, "hex", { attachedTo: "squire" })
    .unit(P2, "bf1", { ...RECRUIT_TOKEN, might: tokenMight }, "token-recruit")
    .unit(P2, "bf1", { might: 5, name: "Big" }, "big")
    .hand(P1, STRIKE_DOWN, "sd");
}

async function strike(game: Game): Promise<void> {
  expect(game.state("squire")).toMatchObject({ attachments: ["hex"], might: 2 });
  await game.p1.cast("sd", { targets: ["squire", "token-recruit"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  await game.settle();
  expect(game.zoneOf("sd")).toBe("trash");
}

describe("Ruling b99c1baed468bd50 — Strike Down from a 1+1 equipped unit: the token dies; the striker dies only if it was already damaged", () => {
  test("Squire (1 + Hexdrinker 1 = 2) deals 2 to the 1-Might Recruit token → the token dies (ceases to exist); then Hexdrinker detaches and Squire is back to 1 Might", async () => {
    const game = await board(0).build();
    await strike(game);
    expect(game.has("token-recruit") ? game.zoneOf("token-recruit") : "gone").not.toBe("battlefield-bf1");
    expect(game.state("hex").attachedTo).toBeUndefined();
    expect(game.zoneOf("hex")).toBe("base");
    expect(game.state("squire")).toMatchObject({ attachments: [], might: 1 });
  });

  test("a 2-Might token dies too (2 damage ≥ 2 Might, 143.2.a)", async () => {
    const game = await board(0, 2).build();
    await strike(game);
    expect(game.has("token-recruit") ? game.zoneOf("token-recruit") : "gone").not.toBe("battlefield-bf1");
    expect(game.zoneOf("big")).toBe("battlefield-bf1");
  });

  test("Squire had 0 damage marked: after the detach it SURVIVES in base at 1 Might — a spell isn't combat, the token dealt nothing back, no recall", async () => {
    const game = await board(0).build();
    await strike(game);
    expect(game.state("squire")).toMatchObject({ damage: 0, might: 1, zone: "base" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("Squire already had 1 damage marked (fine at 2 Might): once Hexdrinker detaches its Might is 1 ≤ its damage → it dies in the following cleanup; Hexdrinker stays on the board unattached", async () => {
    const game = await board(1).build();
    expect(game.state("squire")).toMatchObject({ damage: 1, might: 2, zone: "base" });
    await strike(game);
    expect(game.has("token-recruit") ? game.zoneOf("token-recruit") : "gone").not.toBe("battlefield-bf1");
    expect(game.zoneOf("squire")).toBe("trash");
    expect(game.zoneOf("hex")).toBe("base");
    expect(game.state("hex").attachedTo).toBeUndefined();
    expect(game.violations()).toEqual([]);
  });
});
