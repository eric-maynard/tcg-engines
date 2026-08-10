/**
 * Ruling 4b80c8eb50e389f1 — Traveling Merchant (OGN-185 → ogn-185-298) · Unit · Chaos · [2] · 2 Might
 *     "When I move, discard 1, then draw 1."
 *   × Zhonya's Hourglass (OGN-077 → ogn-077-298) "If a friendly unit would die, kill this instead. Heal that unit, exhaust
 *     it, and recall it. (Send it to base. This isn't a move.)"
 *   × Charm (OGN-043 → ogn-043-298) "Move an enemy unit."  (Portal Rescue / Fight or Flight / Flash are cited as further
 *     examples of the same two categories and are not needed to decide the question.)
 *
 * Q: When the Merchant goes from a battlefield to base with the standard move action, is that a move (trigger) or a recall?
 * A: A MOVE — the ability triggers and you discard 1 / draw 1. Something is only a recall when a rule or effect says
 *    "recall" (e.g. Zhonya's Hourglass), and recalls do not trigger "When I move". Effects that say "move" (Charm, …)
 *    trigger it regardless of destination.
 * Rules: 140 / 608 (Standard Move: to base or to a battlefield), 453 (Recall is not a move), 383 (triggered abilities).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const MERCHANT = "ogn-185-298";
const ZHONYAS = "ogn-077-298";
const CHARM = "ogn-043-298";
const HEXTECH_RAY = "ogn-009-298"; // [1][fury] — Deal 3 to a unit at a battlefield (makes the Merchant "would die")

const JUNK = { cardType: "unit", might: 1, name: "Junk" } as const;

describe("Ruling 4b80c8eb50e389f1 — battlefield → base by Standard Move is a move: Traveling Merchant triggers", () => {
  test("Standard Move from bf1 to base: the Merchant is exhausted, lands in base, and its 'When I move' item goes on the chain; resolving it P1 discards 1 (chooses Junk) then draws 1", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", MERCHANT, "merchant")
      .hand(P1, JUNK, "junk")
      .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"])
      .build();
    await game.p1.move("merchant", "base"); // the Standard Move discretionary action (throws if illegal)
    expect(game.locationOf("merchant")).toBe("base");
    expect(game.state("merchant").isExhausted).toBe(true); // the standard move's exhaust — not a recall's
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", controller: P1, triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.key) : []).toEqual(["junk"]);
    await game.p1.pick("junk");
    expect(game.zoneOf("junk")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — a RECALL is not a move: the Merchant at bf1 takes lethal spell damage, Zhonya's dies instead and recalls it to base — no move trigger, no discard prompt, hand untouched", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", MERCHANT, "merchant")
      .gear(P1, ZHONYAS, "zhonyas")
      .hand(P1, HEXTECH_RAY, "ray")
      .hand(P1, JUNK, "junk")
      .build();
    await game.p1.cast("ray", { targets: "merchant" });
    await game.settle();
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.locationOf("merchant")).toBe("base"); // sent to base …
    expect(game.state("merchant")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.chain()).toEqual([]); // … but nothing triggered
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.hand()).toEqual(["junk"]);
    expect(game.p1.trash()).not.toContain("junk");
  });

  test("an effect that says MOVE (Charm, cast by the opponent, sending the Merchant from bf1 to base) does trigger it: P1 discards then draws", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { calm: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", MERCHANT, "merchant")
      .hand(P1, JUNK, "junk")
      .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"])
      .hand(P2, CHARM, "charm")
      .build();
    await game.p2.cast("charm", { targets: "merchant" });
    // Charm's destination is the caster's (P2's) choice; with bf1 the only battlefield, "base" is the sole (locked) option.
    const dest = game.decision();
    if (dest?.kind === "pick") {
      expect(dest).toMatchObject({ seat: P2, semantics: "destination" });
      await game.p2.pick("base");
    }
    await game.p2.passPriority();
    await game.p1.passPriority(); // Charm resolves → the Merchant moves → its trigger
    expect(game.locationOf("merchant")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", controller: P1, triggered: true })]);
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("junk");
    }
    await game.settle();
    expect(game.zoneOf("junk")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.violations()).toEqual([]);
  });
});
