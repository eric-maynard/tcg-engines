/**
 * Ruling 88e3511bfc4e2fb2 — Stupefy (OGN-095 → ogn-095-298, Reaction: "Give a unit -1 [Might] this turn, to a
 *   minimum of 1 [Might]. Draw 1.") × Master Yi's legend — the ruling lists Wuju Master (UNL-191 → unl-191-219,
 *   "[Level 6] Your units have +1 [Might]") while the question describes the defending bonus of Wuju Bladesman
 *   (ogs-019-024, "While a friendly unit defends alone, it gets +2 [Might]"). Both are "while" passives.
 *
 * Q: Can I Stupefy "in response to" Master Yi's legend ability when they defend, killing the buffed unit before the
 *    'when I defend' trigger resolves?
 * A: No. The legend ability is a passive ("while"), not a triggered ability: it never goes on the chain, so there is
 *    nothing to respond to — the bonus is simply on as soon as its condition holds (like Shield).
 * Rules: 365–367 (passive abilities are continuous, no chain), 383 (only "when" abilities trigger), 727 (Shield).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const STUPEFY = "ogn-095-298";
const WUJU_BLADESMAN = "ogs-019-024";
const WUJU_MASTER = "unl-191-219";

describe("Ruling 88e3511bfc4e2fb2 — Master Yi's legend bonus is a passive: no chain item, nothing for Stupefy to respond to", () => {
  test("Wuju Bladesman: the lone defender is +2 the instant it is designated — the chain is EMPTY (no legend trigger), the attacker just gets Focus", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .legend(P2, WUJU_BLADESMAN, "yi")
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Disciple" }, "disciple")
      .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
      .hand(P1, STUPEFY, "stupefy")
      .build();
    expect(game.state("disciple").might).toBe(2);
    await game.p1.move("raider", "bf1");
    expect(game.state("disciple").combatRole).toBe("defender");
    expect(game.state("disciple").might).toBe(4); // passive: already applied
    expect(game.chain()).toEqual([]); // no "legend ability" on the chain …
    expect(game.chain().some((c) => c.cardId === "yi")).toBe(false);
    // … so the state is OPEN: P1 holds showdown Focus, not chain priority "in response" to anything.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    // Stupefy can of course still be played now — but it lands on a unit that ALREADY has the +2 (4 → 3), it cannot pre-empt it.
    await game.p1.cast("stupefy", { targets: "disciple" });
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.zoneOf("stupefy")).toBe("trash");
    expect(game.state("disciple").might).toBe(3);
    await game.settle();
    // 3 vs 3: both die — the Disciple was never a 2-Might (or 1-Might) unit during this combat.
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("disciple")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("Wuju Master (Level 6): P2's units are +1 continuously — again no chain item appears when its unit defends, and Stupefy merely nets against the standing bonus", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .legend(P2, WUJU_MASTER, "yi")
      .xp(P2, 6)
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Disciple" }, "disciple")
      .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
      .hand(P1, STUPEFY, "stupefy")
      .build();
    expect(game.state("disciple").might).toBe(3); // +1 before any combat at all
    await game.p1.move("raider", "bf1");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.cast("stupefy", { targets: "disciple" });
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.state("disciple").might).toBe(2); // 2 +1 (passive) -1 (Stupefy)
    await game.settle();
    expect(game.zoneOf("disciple")).toBe("trash");
    expect(game.locationOf("raider")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
