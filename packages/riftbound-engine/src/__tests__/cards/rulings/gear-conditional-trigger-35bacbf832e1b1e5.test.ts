/**
 * Ruling 35bacbf832e1b1e5 — (no specific card) does a conditional ability go on the chain when the
 *   condition is false, and can it be reacted to?
 *   Exercised with Dropboarder (SFD-072 → sfd-072-221) "When you play me, if you control two or more
 *   gear, ready me." (the "condition after the comma" shape) and Disintegrate (OGN-005 → ogn-005-298)
 *   "[Action] Deal 3 to a unit at a battlefield. If this kills it, do this: draw 1." (a Reflexive Trigger).
 *
 * Q: If a card reads "if condition met, do X", does it put a trigger on the chain when the condition
 *    is not met — and can I react to it?
 * A (riftjudge): a condition AFTER the comma goes on the chain either way and just does nothing; a
 *    Reflexive Trigger ("…, do this: …") creates a chain item only when its condition is met.
 * Engine: the reflexive half matches. The intervening-if half does NOT — see RULING-CONFLICT below.
 * Rules: 383.2.a.1 (intervening if is part of the Trigger Condition), 387/388.1 (Reflexive Triggers).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DROPBOARDER = "sfd-072-221"; // 4 Energy unit
const DISINTEGRATE = "ogn-005-298"; // 4 Energy [Action]

/** A vanilla gear, to satisfy "two or more gear". */
const TRINKET = { cardType: "gear", energyCost: 0, name: "Test Trinket", rulesText: "" } as const;

/** [Reaction] "Deal 1 to a unit." — the opponent's would-be answer. */
const STING = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Sting",
  rulesText: "[Reaction] Deal 1 to a unit.",
  timing: "reaction",
} as const;

describe("Ruling 35bacbf832e1b1e5 — conditional triggers: intervening 'if' vs Reflexive Trigger", () => {
  // ── "When you play me, IF <condition>, <effect>" ────────────────────────────────────────────────

  test("condition MET: the ability is on the chain, the opponent may answer it, and it resolves", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .gear(P1, TRINKET, "g1")
      .gear(P1, TRINKET, "g2")
      .hand(P1, DROPBOARDER, "drop")
      .hand(P2, STING, "sting")
      .build();
    await game.p1.play("drop");
    expect(game.chain().map((i) => i.cardId)).toEqual(["drop"]);
    await game.p1.passPriority();
    expect(game.p2.can("cast", "sting")).toBe(true); // it IS on the chain, so it IS reactable
    await game.settle();
    expect(game.state("drop").isReady).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("condition NOT met: nothing reaches the chain and nothing happens", async () => {
    // RULING-CONFLICT: riftjudge 35bacbf832e1b1e5 (via FAQ #8211) says a condition written after the
    // comma still puts the ability on the chain, where it resolves with no effect and can be reacted
    // to; CR 383.2.a.1 says such a clause is part of the TRIGGER CONDITION, so a false clause means
    // the ability does not trigger at all — no chain item, no priority window — engine follows CR.
    // (Settled by core-rules/intervening-if.test.ts.)
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .gear(P1, TRINKET, "g1") // only ONE gear
      .hand(P1, DROPBOARDER, "drop")
      .hand(P2, STING, "sting")
      .build();
    await game.p1.play("drop");
    expect(game.chain()).toEqual([]);
    expect(game.p2.can("cast", "sting")).toBe(false); // no chain ⇒ no window
    await game.settle();
    expect(game.state("drop").isReady).toBe(false);
    expect(game.zoneOf("drop")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  // ── "…, do this: <effect>" (Reflexive Trigger) ─────────────────────────────────────────────────

  test("reflexive, condition met: a NEW chain item appears after the spell resolves and can be responded to", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Small" }, "small")
      .unit(P1, "base", { might: 5, name: "Bystander" }, "bystander") // something for STING to aim at
      .hand(P1, DISINTEGRATE, "dis")
      .hand(P2, STING, "sting")
      .build();
    const handBefore = game.p1.hand().length;
    await game.p1.cast("dis", { targets: "small" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Disintegrate resolves: 3 damage kills the 2-Might unit
    expect(game.zoneOf("small")).toBe("trash");
    // The reflexive "draw 1" is a separate chain item — reactable in its own right (388.1).
    expect(game.chain()).toHaveLength(1);
    await game.p1.passPriority(); // its controller acts first (340.4)…
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "sting")).toBe(true); // …then the opponent may answer it
    await game.settle();
    expect(game.p1.hand().length).toBe(handBefore - 1 + 1); // Disintegrate left hand, the draw came in
    expect(game.violations()).toEqual([]);
  });

  test("reflexive, condition NOT met: no chain item is created at all, so there is nothing to react to", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 9, name: "Big" }, "big")
      .hand(P1, DISINTEGRATE, "dis")
      .hand(P2, STING, "sting")
      .build();
    const handBefore = game.p1.hand().length;
    await game.p1.cast("dis", { targets: "big" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("big").damage).toBe(3); // damaged, not killed
    expect(game.chain()).toEqual([]); // the reflexive trigger never fired
    expect(game.p2.can("cast", "sting")).toBe(false);
    expect(game.p1.hand().length).toBe(handBefore - 1); // no draw
    expect(game.violations()).toEqual([]);
  });
});
