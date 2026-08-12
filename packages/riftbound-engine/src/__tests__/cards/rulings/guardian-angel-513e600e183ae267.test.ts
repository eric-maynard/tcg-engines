/**
 * Ruling 513e600e183ae267 — Guardian Angel (SFD-051 → sfd-051-221) · Equipment · [2] · "[Equip] [calm]"
 *   "If I would die, kill Guardian Angel instead. Heal me, exhaust me, and recall me."
 *
 * Q: Can you react to Guardian Angel before its recall effect resolves?
 * A: No. It is a replacement effect, not a triggered ability: it never uses the chain, so there is no moment at
 *    which it is "waiting to resolve". When the bearer would die, the whole substitution — kill the Angel, heal,
 *    exhaust and recall the unit — happens at once as part of that single event.
 * Rules: 369 / 369.1 (replacement effects intercede during an event and do not use the chain), 370.1.a.1 (the
 *        replaced death never happens), 340 (only spells and abilities go on the chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUARDIAN_ANGEL = "sfd-051-221";

/** Inline P2 Action spell: deal 6 to a unit — lethal for the 3-Might Hero even wearing the Angel. */
const BIG_BOLT = {
  abilities: [{ effect: { amount: 6, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Big Bolt",
  timing: "action",
};

/** P2's turn. P1's Hero (3) at bf1 wears P1's own Guardian Angel (→ 4); P2 has Big Bolt, P1 holds a [Reaction] + [2]. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 3 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Hero" }, "hero", { equippedWith: ["ga"] } as Record<string, unknown>)
    .card("ga", { def: GUARDIAN_ANGEL, meta: { attachedTo: "hero" } as Record<string, unknown>, owner: P1, zone: "bf1" })
    .hand(P2, BIG_BOLT, "bolt")
    .hand(P1, "ogn-058-298", "disc"); // Discipline — a [Reaction] P1 could hold up
}

/** P2 bolts the Hero for lethal; both pass, so the bolt resolves and the replacement fires. */
async function bolted(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("bolt", { targets: "hero" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["bolt"]);
  await game.p2.passPriority();
  await game.p1.passPriority();
  return game;
}

describe("Ruling 513e600e183ae267 — Guardian Angel is a replacement effect: no chain item, no reaction window", () => {
  test("setup: the Angel is attached and the Hero is 3 + 1 = 4, and a 6-damage bolt is lethal", async () => {
    const game = await board().build();
    expect(game.state("ga").attachedTo).toBe("hero");
    expect(game.state("hero").might).toBe(4);
  });

  test("ruling: the substitution never goes on the chain — after the bolt resolves the chain is empty and nothing is pending", async () => {
    const game = await bolted();
    expect(game.chain()).toEqual([]);
    expect(game.chain().some((c) => c.cardId === "ga")).toBe(false);
    expect(game.decision()).toMatchObject({ kind: "action" });
    expect(game.decision()?.source?.cardId).toBeUndefined(); // no Guardian Angel item to respond to
  });

  test("ruling: all of it happened at once — the Angel is dead, the Hero is healed, exhausted and recalled to base", async () => {
    const game = await bolted();
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.p1.trash()).toContain("ga");
    expect(game.zoneOf("hero")).toBe("base");
    expect(game.state("hero")).toMatchObject({ attachments: [], damage: 0, isExhausted: true, might: 3 });
    expect(game.p1.trash()).not.toContain("hero");
    expect(game.violations()).toEqual([]);
  });

  test("ruling: there is no window between the Angel's death and the recall — P1's [Reaction] was only ever playable BEFORE the bolt resolved", async () => {
    const game = await board().build();
    await game.p2.cast("bolt", { targets: "hero" });
    await game.p2.passPriority();
    expect(game.p1.can("cast", "disc")).toBe(true); // the last chance to act is while the bolt is on the chain
    await game.p1.passPriority();
    // The bolt resolved and the replacement ran to completion in the same step.
    expect(game.zoneOf("hero")).toBe("base");
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
