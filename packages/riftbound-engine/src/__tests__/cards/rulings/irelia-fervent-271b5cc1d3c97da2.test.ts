/**
 * Ruling 271b5cc1d3c97da2 — Irelia, Fervent (SFD-057 → sfd-057-221) · 4 Might · "[Deflect] When you choose or ready me,
 *     give me +1 [Might] this turn."
 *   × Challenge (OGN-128 → ogn-128-298) · Action [2] "Choose a friendly unit and an enemy unit. They deal damage equal to
 *     their Mights to each other."   (+ Defy ogn-045-298 as the opponent's counter.)
 *
 * Q: If I Challenge with Irelia, does she get +1 before the damage? If they counter Challenge, does she still get +1?
 * A: Yes and yes. Choosing her triggers her ability, which lands ABOVE the spell and resolves first (+1 → 5) — so she
 *    fights at 5. The trigger is independent of the spell: if Challenge is countered, the trigger still resolves and
 *    she keeps +1 for the turn.
 * Rules: 383.4.b (choose-triggers fire on finalize, above the spell), 340 (LIFO), 425.1 (countered spell does nothing).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const IRELIA = "sfd-057-221";
const CHALLENGE = "ogn-128-298";
const DEFY = "ogn-045-298";

/**
 * P1's turn. Irelia (4) in P1's base; P2's Brute (exactly 4) at bf1 — at 4 Might Irelia would trade and die, at 5 she
 * survives Brute's 4 and kills it. P1: Challenge + [2] + body; P2: Defy + [1] + calm.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { body: 1 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", IRELIA, "irelia")
    .unit(P2, "bf1", { might: 4, name: "Brute" }, "brute")
    .hand(P1, CHALLENGE, "challenge")
    .hand(P2, DEFY, "defy");
}

async function castChallenge(): Promise<Game> {
  const game = await board().build();
  expect(game.state("irelia").might).toBe(4);
  await game.p1.cast("challenge", { targets: ["irelia", "brute"] });
  return game;
}

describe("Ruling 271b5cc1d3c97da2 — Irelia's 'when you choose me' +1 resolves before Challenge and survives a counter", () => {
  test("choosing Irelia with Challenge puts her trigger on the chain ABOVE the spell", async () => {
    const game = await castChallenge();
    expect(game.chain().map((c) => c.cardId)).toEqual(["challenge", "irelia"]);
    expect(game.chain()[1]).toMatchObject({ controller: P1, triggered: true });
    expect(game.state("irelia").might).toBe(4); // not applied until it resolves
  });

  test("LIFO: the trigger resolves first (Irelia 4 → 5) while Challenge still waits; then Challenge has her deal 5 / take 4 — Brute (4) dies, Irelia survives with 4 damage", async () => {
    const game = await castChallenge();
    await game.p1.passPriority();
    await game.p2.passPriority(); // Irelia's trigger resolves
    expect(game.chain().map((c) => c.cardId)).toEqual(["challenge"]);
    expect(game.state("irelia")).toMatchObject({ might: 5, mightModifier: 1 });
    await game.settle(); // Challenge resolves
    expect(game.zoneOf("challenge")).toBe("trash");
    expect(game.zoneOf("brute")).toBe("trash"); // took 5 ≥ 4
    expect(game.zoneOf("irelia")).toBe("base"); // took 4 < 5 — the +1 was there BEFORE the damage
    expect(game.state("irelia")).toMatchObject({ damage: 4, might: 5 });
    expect(game.violations()).toEqual([]);
  });

  test("countered: after her trigger resolves P2 Defies the Challenge — Challenge does nothing (no damage either way) but Irelia KEEPS the +1 (5 Might) for the turn", async () => {
    const game = await castChallenge();
    await game.p1.passPriority();
    await game.p2.passPriority(); // trigger resolves: 5
    expect(game.state("irelia").might).toBe(5);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "defy")).toBe(true);
    await game.p2.cast("defy", { targets: "challenge" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["challenge", "defy"]);
    await game.settle();
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("challenge")).toBe("trash");
    expect(game.zoneOf("brute")).toBe("battlefield-bf1");
    expect(game.state("brute").damage).toBe(0);
    expect(game.state("irelia")).toMatchObject({ damage: 0, might: 5, mightModifier: 1 });
    // …and it is a this-turn bonus: gone next turn.
    await game.advanceTurn();
    expect(game.state("irelia").might).toBe(4);
  });

  test("Defy played IMMEDIATELY (on top of the trigger) changes nothing: Defy → counter, then the trigger still resolves → Irelia 5, no damage dealt", async () => {
    const game = await castChallenge();
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "challenge" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["challenge", "irelia", "defy"]);
    await game.settle();
    expect(game.zoneOf("challenge")).toBe("trash");
    expect(game.state("irelia")).toMatchObject({ damage: 0, might: 5 });
    expect(game.state("brute").damage).toBe(0);
  });
});
