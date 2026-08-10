/**
 * Ruling c233bf1fa47addf6 — Radiant Dawn (OGN-261 → ogn-261-298) · Legend (Leona)
 *     "When you stun one or more enemy units, buff a friendly unit."
 *   × Thwonk! (SFD-040 → sfd-040-221) · Action · [2] · [Repeat] [2] "Stun an attacking unit."
 *   × Leona, Determined (OGN-238 → ogn-238-298) · 4 Might · "[Shield] When I attack, stun an enemy unit here."
 *
 * Q: If Leona's player stuns several units (Thwonk with Repeat, or several Leonas attacking), how many buffs?
 * A: Depends on how the stuns are made. ONE effect stunning several units (a repeated Thwonk is one spell resolving once
 *    with a doubled effect) triggers the legend ONCE. SEPARATE stun effects (two Leona attack triggers, each its own chain
 *    item) each trigger it → one buff per stun effect.
 * Rules: 820.1.d / 820.2 (Repeat = the same chain item executed again, not a second spell), 383 ("one or more" triggers
 *        once per event batch), 340.1 (each trigger is its own chain item).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RADIANT_DAWN = "ogn-261-298";
const THWONK = "sfd-040-221";
const LEONA_DETERMINED = "ogn-238-298";

const isDawnPick = (d: Decision | null) => d?.kind === "pick" && d.seat === P1 && d.source?.cardId === "dawn";

/** Pass priority for whoever holds it until something other than a chain-priority window is pending. */
async function passBoth(game: Game): Promise<void> {
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain") {
      return;
    }
    await game.seat(d.seat).passPriority();
  }
}

describe("Ruling c233bf1fa47addf6 — Radiant Dawn: one buff per stun EFFECT, not per stunned unit", () => {
  /**
   * P2's turn. P1 (Radiant Dawn) holds bf1 with vanilla A and B (2 each); P2 attacks with Raiders R1 and R2 (3 each).
   * P2 passes Focus; P1 (4 energy) Thwonks with Repeat: R1 then R2.
   */
  async function thwonkBoth(): Promise<Game> {
    const game = await scenario()
      .active(P2)
      .legend(P1, RADIANT_DAWN, "dawn")
      .resources(P1, { energy: 4 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "A" }, "a1")
      .unit(P1, "bf1", { might: 2, name: "B" }, "b1")
      .unit(P2, "base", { might: 3, name: "Raider One" }, "r1")
      .unit(P2, "base", { might: 3, name: "Raider Two" }, "r2")
      .hand(P1, THWONK, "thwonk")
      .build();
    await game.p2.move(["r1", "r2"], "bf1");
    expect(game.state("r1").combatRole).toBe("attacker");
    await game.p2.passFocus();
    expect(game.p1.can("cast", "thwonk")).toBe(true);
    await game.p1.cast("thwonk", { repeat: 1, targets: ["r1", "r2"] });
    expect(game.p1.energy()).toBe(0); // [2] + [2] repeat
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "thwonk", triggered: false })]); // ONE spell on the chain
    return game;
  }

  test("Thwonk with Repeat is a single chain item that stuns BOTH attackers when it resolves", async () => {
    const game = await thwonkBoth();
    await passBoth(game); // Thwonk resolves
    expect(game.zoneOf("thwonk")).toBe("trash");
    expect(game.state("r1").isStunned).toBe(true);
    expect(game.state("r2").isStunned).toBe(true);
  });

  // The one resolving spell stunned "one or more enemy units" once → exactly ONE Radiant Dawn trigger on the chain and one buff.
  test.failing("BUG: ruling c233bf1fa47addf6 — a single repeated Thwonk stunning two units gives ONE Radiant Dawn trigger / ONE buff", async () => {
    const game = await thwonkBoth();
    await passBoth(game); // Thwonk resolves
    // The buff target is asked as the trigger is put on the chain.
    expect(isDawnPick(game.decision())).toBe(true);
    await game.p1.pick("a1");
    expect(game.chain().filter((c) => c.cardId === "dawn" && c.triggered)).toHaveLength(1);
    expect(isDawnPick(game.decision())).toBe(false); // no second trigger to aim
    await passBoth(game);
    expect(game.chain()).toEqual([]);
    expect(game.state("a1").isBuffed).toBe(true);
    expect(game.state("b1").isBuffed).toBe(false);
    expect([game.state("a1").isBuffed, game.state("b1").isBuffed].filter(Boolean)).toHaveLength(1);
  });

  /** P1's turn. P1 (Radiant Dawn) has two ready Leona, Determined in base; P2 holds bf1 with Guard and Squire (2 each). */
  async function twoLeonasAttack(): Promise<Game> {
    const game = await scenario()
      .legend(P1, RADIANT_DAWN, "dawn")
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
      .unit(P2, "bf1", { might: 2, name: "Squire" }, "squire")
      .unit(P1, "base", LEONA_DETERMINED, "leo1")
      .unit(P1, "base", LEONA_DETERMINED, "leo2")
      .build();
    await game.p1.move(["leo1", "leo2"], "bf1");
    // Each Leona's "When I attack" trigger asks its own stun target as it goes on the chain.
    let d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "leo1" } });
    await game.p1.pick("guard");
    d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "leo2" } });
    await game.p1.pick("squire");
    // Two same-controller triggers → P1 may order them.
    d = game.decision();
    expect(d).toMatchObject({ kind: "order", seat: P1 });
    await game.acceptTriggerOrder();
    expect(game.chain().filter((c) => c.triggered && (c.cardId === "leo1" || c.cardId === "leo2"))).toHaveLength(2);
    return game;
  }

  test("two Leonas attacking: two SEPARATE stun triggers on the chain; the first to resolve stuns its unit and Radiant Dawn triggers (buff → leo1)…", async () => {
    const game = await twoLeonasAttack();
    await passBoth(game); // top Leona trigger resolves
    expect([game.state("guard").isStunned, game.state("squire").isStunned].filter(Boolean)).toHaveLength(1);
    expect(isDawnPick(game.decision())).toBe(true);
    await game.p1.pick("leo1");
    expect(game.chain().filter((c) => c.cardId === "dawn")).toHaveLength(1);
    await passBoth(game); // Dawn resolves
    expect(game.state("leo1").isBuffed).toBe(true);
    expect(game.state("leo2").isBuffed).toBe(false);
  });

  test("…then the second Leona trigger resolves, stuns the other unit, and Radiant Dawn triggers AGAIN → a second buff (leo2): two stun effects = two buffs", async () => {
    const game = await twoLeonasAttack();
    await passBoth(game);
    await game.p1.pick("leo1");
    await passBoth(game);
    await passBoth(game); // second Leona trigger resolves
    expect(game.state("guard").isStunned).toBe(true);
    expect(game.state("squire").isStunned).toBe(true);
    expect(isDawnPick(game.decision())).toBe(true);
    await game.p1.pick("leo2");
    await passBoth(game);
    expect(game.chain()).toEqual([]);
    expect(game.state("leo1").isBuffed).toBe(true);
    expect(game.state("leo2").isBuffed).toBe(true);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.violations()).toEqual([]);
  });
});
