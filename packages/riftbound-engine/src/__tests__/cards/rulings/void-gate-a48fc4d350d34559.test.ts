/**
 * Ruling a48fc4d350d34559 — Void Gate (OGN-296 → ogn-296-298) Battlefield "Spells and abilities deal 1 Bonus Damage to units here."
 *   × Challenge (OGN-128 → ogn-128-298) [Action] 2+[body] "Choose a friendly unit and an enemy unit. They deal damage equal to
 *     their Mights to each other."
 *
 * Q: If a unit sits at Void Gate and I Challenge with/against it, does Void Gate's bonus damage apply?
 * A: No. With Challenge the UNITS deal the damage to each other; the spell itself deals nothing. Void Gate only amplifies damage
 *    whose source is a spell or ability.
 * Rules: 417.6 (source of damage), Bonus Damage applies per instance of damage dealt BY a spell/ability.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VOID_GATE = "ogn-296-298";
const CHALLENGE = "ogn-128-298";
/** Inline "Deal 3 to a unit." — positive control that Void Gate is live. */
const BOLT = { abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }], cardType: "spell", domain: "body", energyCost: 1, name: "Test Bolt", timing: "action" };

/**
 * P1's turn. "gate" = Void Gate (live) held by P2 with a 4-Might Brute on it. P1: a 3-Might Duelist in base, Challenge (2+[body])
 * and Bolt (1) in hand with 3 energy + 1 body.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { body: 1 } })
    .battlefield("gate", { controller: P2, def: VOID_GATE, inert: false })
    .unit(P2, "gate", { might: 4, name: "Brute" }, "brute")
    .unit(P1, "base", { might: 3, name: "Duelist" }, "duelist")
    .hand(P1, CHALLENGE, "challenge")
    .hand(P1, BOLT, "bolt");
}

describe("Ruling a48fc4d350d34559 — Void Gate does not amplify Challenge (units are the damage source)", () => {
  test("Challenge Duelist (3) vs Brute (4, at Void Gate): the Brute takes exactly 3 — no +1 — and survives; the Duelist takes 4 and dies", async () => {
    const game = await board().build();
    await game.p1.cast("challenge", { targets: ["duelist", "brute"] });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { body: 0 } });
    await game.settle();
    expect(game.zoneOf("challenge")).toBe("trash");
    expect(game.zoneOf("brute")).toBe("battlefield-gate"); // 3 < 4; a Void Gate bonus would have made it 4 ≥ 4 → dead
    expect(game.state("brute").damage).toBe(3);
    expect(game.zoneOf("duelist")).toBe("trash"); // took the Brute's 4
    expect(game.violations()).toEqual([]);
  });

  test("positive control: a spell that itself DEALS damage to the Brute at Void Gate gets +1 — Bolt's 3 becomes 4 and kills it", async () => {
    const game = await board().build();
    await game.p1.cast("bolt", { targets: "brute" });
    await game.settle();
    expect(game.zoneOf("bolt")).toBe("trash");
    expect(game.zoneOf("brute")).toBe("trash");
  });
});
