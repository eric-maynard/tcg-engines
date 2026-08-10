/**
 * Ruling 3686759f5dcfdcb1 — Adaptatron (ogn-056-298) × Honest Broker (sfd-155-221) × Gold token (sfd-t03) [cf. Glasc Mixologist timing]
 *   Adaptatron: 3 Might, "When I conquer, you may kill a gear. If you do, buff me."
 *   Honest Broker: 2 Might, "[Deathknell] — Play a Gold gear token exhausted."
 *
 * Q: If Adaptatron kills Honest Broker in combat and conquers, can its conquer trigger destroy the Gold the Broker's
 *    Deathknell just made?
 * A: Yes. Deathknell triggers from combat damage resolve during the Combat Special Cleanup, BEFORE the combat result is
 *    determined; so the Gold token already exists when Adaptatron conquers and its "when I conquer" trigger can choose it.
 * Rules: 466.1–466.3 (cleanup + its chain items resolve before Determine Combat Result), 466.5.d (establishing control = Conquer).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ADAPTATRON = "ogn-056-298";
const HONEST_BROKER = "sfd-155-221";

const goldOf = (game: Game, seat: typeof P1 | typeof P2) => game.seat(seat).gear().filter((g) => game.state(g).name === "Gold");

describe("Ruling 3686759f5dcfdcb1 — Broker's Deathknell Gold exists before Adaptatron's conquer trigger, which may kill it", () => {
  test("Adaptatron (3) attacks Honest Broker (2): Broker dies, its Deathknell makes P2 a Gold token, THEN Adaptatron conquers and its trigger offers that Gold; killing it buffs Adaptatron", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", HONEST_BROKER, "broker")
      .unit(P1, "base", ADAPTATRON, "ada")
      .gear(P1, { name: "Spare Wrench" }, "wrench") // a second legal gear so the choice is a real prompt
      .build();
    expect(goldOf(game, P2)).toEqual([]);

    await game.p1.move("ada", "bf1");
    // Both pass Focus → combat damage: Broker (2) takes 3 and dies; Adaptatron (3) takes 2 and lives.
    await game.settle();

    // We are now at Adaptatron's optional conquer trigger — and the Gold token is ALREADY on P2's board.
    const optIn = game.decision();
    expect(optIn).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(optIn?.source?.cardId).toBe("ada");
    expect(game.zoneOf("broker")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // conquered
    expect(game.p1.points()).toBe(1);
    const gold = goldOf(game, P2);
    expect(gold).toHaveLength(1);
    expect(game.state(gold[0] as string)).toMatchObject({ isExhausted: true, isToken: true });

    await game.p1.yes();
    await game.settle();
    // "kill a gear": P1 chooses among ALL gear — the fresh Gold token is a legal choice next to P1's own Wrench.
    const pick = game.decision();
    expect(pick).toMatchObject({ kind: "pick", seat: P1 });
    const offered = pick?.kind === "pick" ? pick.options.map((o) => o.card ?? o.key) : [];
    expect(offered).toContain(gold[0]);
    expect(offered).toContain("wrench");
    await game.p1.pick(gold[0] as string);
    await game.settle();

    expect(goldOf(game, P2)).toEqual([]);
    expect(game.zoneOf(gold[0] as string)).toBe("gone"); // a killed token ceases to exist
    expect(game.zoneOf("wrench")).toBe("base");
    expect(game.state("ada")).toMatchObject({ isBuffed: true, might: 4 });
    expect(game.locationOf("ada")).toBe("bf1");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("declining the 'you may' leaves the Gold with P2 and Adaptatron unbuffed (the kill is optional; the conquer still scored)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", HONEST_BROKER, "broker")
      .unit(P1, "base", ADAPTATRON, "ada")
      .build();
    await game.p1.move("ada", "bf1");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(goldOf(game, P2)).toHaveLength(1);
    await game.p1.no();
    await game.settle();
    expect(goldOf(game, P2)).toHaveLength(1);
    expect(game.state("ada")).toMatchObject({ isBuffed: false, might: 3 });
    expect(game.p1.points()).toBe(1);
  });
});
