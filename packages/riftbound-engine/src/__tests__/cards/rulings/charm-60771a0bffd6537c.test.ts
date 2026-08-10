/**
 * Ruling 60771a0bffd6537c — Charm (OGN-043 → ogn-043-298) · Calm spell · [1][calm] "Move an enemy unit."
 *   (× Blitzcrank, Impassive ogn-067-298 cited as working the same way.)
 *
 * Q: Can Charm move a unit from one battlefield to another without Ganking?
 * A: Yes. The Ganking requirement (and exhausting) are limitations of the STANDARD Move only; movement caused by a spell
 *    or effect ignores them and does not exhaust the unit.
 * Rules: 447–449 (Standard Move: base↔battlefield only unless [Ganking]; exhaust as the cost), 450 (moves by effects
 *        are not Standard Moves), 813 (Ganking).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";

/** P2's ready 4-Might Brute (no Ganking) holds bf1; bf2 is uncontrolled and empty; bf3 is P1's with a Guard. */
function board(active: typeof P1 | typeof P2 = P1) {
  return scenario()
    .active(active)
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .battlefield("bf3", { controller: P1 })
    .unit(P2, "bf1", { might: 4, name: "Brute" }, "brute")
    .unit(P1, "bf3", { might: 6, name: "Guard" }, "guard")
    .hand(P1, CHARM, "charm");
}

describe("Ruling 60771a0bffd6537c — Charm moves battlefield → battlefield with no Ganking and no exhaust", () => {
  test("control: as a STANDARD move on its own turn the Brute (no [Ganking]) cannot go bf1 → bf2 — only back to base", async () => {
    const game = await board(P2).build();
    expect(game.state("brute").keywords).not.toContain("Ganking");
    const moveKeys = game.p2.legal().filter((o) => o.verb === "move" || o.verb === "gank").map((o) => o.key);
    expect(moveKeys).toEqual(["standardMove:to:base"]); // to base is fine — no battlefield destination at all
    const r = await game.p2.try((p) => p.move("brute", "bf2"));
    expect(r.ok).toBe(false);
    expect((await game.p2.try((p) => p.gank("brute", "bf2"))).ok).toBe(false);
    expect(game.locationOf("brute")).toBe("bf1");
  });

  test("Charm on the Brute offers OTHER BATTLEFIELDS as destinations (bf2, bf3) as well as its base", async () => {
    const game = await board().build();
    await game.p1.cast("charm", { targets: "brute" });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    const keys = d?.kind === "pick" ? d.options.map((o) => o.key).toSorted() : [];
    expect(keys).toContain("battlefield-bf2");
    expect(keys).toContain("battlefield-bf3");
    expect(keys).toContain("base");
    expect(keys).not.toContain("battlefield-bf1"); // where it already is
  });

  test("ruling: choosing bf2 — Charm resolves and the Brute goes straight from bf1 to bf2, stays READY (not a Standard Move), and P2 gives up bf1", async () => {
    const game = await board().build();
    await game.p1.cast("charm", { targets: "brute" });
    await game.p1.pick("battlefield-bf2");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "charm", targets: ["brute"] })]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.locationOf("brute")).toBe("bf2");
    expect(game.state("brute")).toMatchObject({ controller: P2, isExhausted: false, isReady: true });
    expect(game.p2.units("bf1")).toEqual([]);
    await game.settle();
    await game.settle(); // (through any showdown the arrival at empty bf2 stages)
    expect(game.locationOf("brute")).toBe("bf2");
    expect(game.state("brute").isReady).toBe(true);
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.violations()).toEqual([]);
  });

  test("and into a DEFENDED battlefield too: Charm the Brute from bf1 into P1's bf3 — it arrives ready and a combat opens there with P2 as the attacker", async () => {
    const game = await board().build();
    await game.p1.cast("charm", { targets: "brute" });
    await game.p1.pick("battlefield-bf3");
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.locationOf("brute")).toBe("bf3");
    expect(game.state("brute").isReady).toBe(true);
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, attackingPlayer: P2, battlefieldId: "bf3", isCombatShowdown: true });
    expect(game.state("brute").combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
  });
});
