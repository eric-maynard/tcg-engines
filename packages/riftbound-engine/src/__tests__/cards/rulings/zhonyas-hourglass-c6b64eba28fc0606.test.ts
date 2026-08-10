/**
 * Ruling c6b64eba28fc0606 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · 2
 *     "[Hidden] If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × Guardian Angel (SFD-051 → sfd-051-221) · Equipment · +1
 *     "If I would die, kill Guardian Angel instead. Heal me, exhaust me, and recall me."
 *   × a [Temporary] unit (Sprite token, unl-t07 — "Kill me at the start of your Beginning Phase").
 *
 * Q: What happens when a Temporary unit is protected by Zhonya's Hourglass or Guardian Angel?
 * A: Temporary's start-of-Beginning-Phase kill is a death event, so the replacement applies: the protector
 *    is killed instead and the unit is healed, exhausted and recalled — it survives that turn. The unit
 *    KEEPS Temporary, so it triggers again at the start of its controller's next Beginning Phase and
 *    (with nothing left to save it) dies then. One attempt per Beginning Phase.
 * Rules: 816.1.b (Temporary), 369–373 (replacement effects, single use), 186.1 (token off-board ceases to exist).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const GUARDIAN_ANGEL = "sfd-051-221";
const SPRITE = "unl-t07"; // 3-Might unit token with [Temporary]

/** Killed = in the trash, or (token) ceased to exist altogether. */
const dead = (game: Game, id: string) => !game.has(id) || game.zoneOf(id) === "trash";

/** P2's turn 3; P1 holds bf1 with a Temporary Sprite plus a plain Anchor (so control questions don't interfere). */
function base() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Anchor" }, "anchor");
}

describe("Ruling c6b64eba28fc0606 — Zhonya's Hourglass saves a Temporary unit once; Temporary stays and kills it next turn", () => {
  test("P1's Beginning Phase: Temporary tries to kill the Sprite, the face-up Hourglass is killed instead; Sprite healed, exhausted, recalled to base — and it still has Temporary", async () => {
    const game = await base().unit(P1, "bf1", SPRITE, "sprite", { damage: 0 }).gear(P1, ZHONYAS, "zhonyas").build();
    expect(game.state("sprite").keywords).toContain("Temporary");
    await game.advanceTurn(); // P2 ends → P1's turn; Beginning Phase trigger settles
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.zoneOf("zhonyas")).toBe("trash"); // killed instead
    expect(game.has("sprite")).toBe(true);
    expect(game.zoneOf("sprite")).toBe("base"); // recalled
    expect(game.state("sprite")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.state("sprite").keywords).toContain("Temporary"); // keyword persists
    expect(game.violations()).toEqual([]);
  });

  test("one attempt per phase: the saved Sprite is not re-killed later in that same turn", async () => {
    const game = await base().unit(P1, "bf1", SPRITE, "sprite").gear(P1, ZHONYAS, "zhonyas").build();
    await game.advanceTurn();
    expect(game.zoneOf("sprite")).toBe("base");
    await game.settle();
    expect(game.zoneOf("sprite")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("subsequent turn: with the Hourglass spent, Temporary triggers again at P1's NEXT Beginning Phase and the Sprite dies", async () => {
    const game = await base().unit(P1, "bf1", SPRITE, "sprite").gear(P1, ZHONYAS, "zhonyas").build();
    await game.advanceTurn(); // → P1 (saved)
    expect(game.zoneOf("sprite")).toBe("base");
    await game.advanceTurn(); // → P2
    expect(game.zoneOf("sprite")).toBe("base"); // survives the opponent's whole turn
    await game.advanceTurn(); // → P1 again: Temporary fires, nothing saves it
    expect(game.turnPlayer()).toBe(P1);
    expect(dead(game, "sprite")).toBe(true);
  });
});

describe("Ruling c6b64eba28fc0606 — Guardian Angel behaves the same for the unit it is attached to", () => {
  function withGA() {
    return base()
      .unit(P1, "bf1", SPRITE, "sprite", { equippedWith: ["ga"] })
      .card("ga", { def: GUARDIAN_ANGEL, meta: { attachedTo: "sprite" }, owner: P1, zone: "bf1" });
  }

  test("P1's Beginning Phase: GA is killed instead; the Sprite is healed, exhausted, recalled, unequipped — and keeps Temporary", async () => {
    const game = await withGA().build();
    expect(game.state("sprite")).toMatchObject({ attachments: ["ga"], might: 4 }); // 3 + GA's +1
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.zoneOf("sprite")).toBe("base");
    expect(game.state("sprite")).toMatchObject({ attachments: [], damage: 0, isExhausted: true, might: 3 });
    expect(game.state("sprite").keywords).toContain("Temporary");
    expect(game.violations()).toEqual([]);
  });

  test("next time P1's Beginning Phase starts the (now unprotected) Sprite dies to Temporary", async () => {
    const game = await withGA().build();
    await game.advanceTurn(); // → P1 (saved by GA)
    expect(game.zoneOf("sprite")).toBe("base");
    await game.advanceTurn(); // → P2
    expect(game.zoneOf("sprite")).toBe("base");
    await game.advanceTurn(); // → P1: dies
    expect(dead(game, "sprite")).toBe(true);
    expect(game.zoneOf("ga")).toBe("trash");
  });
});
