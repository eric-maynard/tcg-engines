/**
 * Ruling b634bfaf524895b6 — Zhonya's Hourglass (OGN-077 → ogn-077-298) · Gear · Calm · 2
 *   "[Hidden] If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it."
 *   × Guardian Angel (sfd-051-221, Equipment +1) "If I would die, kill Guardian Angel instead. Heal me, exhaust me, and recall me."
 *
 * Q: With Zhonya's out, if ALL my units at a battlefield die in one combat, who decides which unit is saved?
 * A: The controller of the replacement effect (Zhonya's controller) chooses which of the simultaneous deaths
 *    it replaces — one unit is saved (it never actually dies), the rest die. If two replacement effects would
 *    replace the SAME single death (Zhonya's + GA on one unit), that player chooses which applies first; the
 *    other then has nothing to replace and does not go off (only one is used up).
 * Rules: 373 (single-use replacement vs several simultaneous events — its controller assigns it),
 *        372 (several replacements for one event — affected object's controller orders them), 370.2.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZHONYAS = "ogn-077-298";
const GUARDIAN_ANGEL = "sfd-051-221";

/** P2's turn. P1 holds bf1 with A (2) and B (2), Zhonya's in base. P2's Crusher (8) attacks: 8 ≥ 2+2 kills both at once. */
function twoDeathsBoard() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "A" }, "a")
    .unit(P1, "bf1", { might: 2, name: "B" }, "b")
    .gear(P1, ZHONYAS, "zhonya")
    .unit(P2, "base", { might: 8, name: "Crusher" }, "crusher");
}

/** P2's turn. P1's Knight (3, wearing Guardian Angel → 4) holds bf1; Zhonya's in base. P2's Crusher (8) attacks. */
function doubleShieldBoard() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Knight" }, "knight", { equippedWith: ["ga"] })
    .card("ga", { def: GUARDIAN_ANGEL, meta: { attachedTo: "knight" }, owner: P1, zone: "bf1" })
    .gear(P1, ZHONYAS, "zhonya")
    .unit(P2, "base", { might: 8, name: "Crusher" }, "crusher");
}

/** Crusher attacks bf1; both pass focus; drive combat until P1 is asked something (or it is over). */
async function attackUntilP1Asked(game: Game): Promise<void> {
  await game.p2.move("crusher", "bf1");
  const s = await game.settle();
  expect(s.reason).toBe("unanswered");
}

describe("Ruling b634bfaf524895b6 — Zhonya's vs several simultaneous deaths / vs Guardian Angel on the same unit", () => {
  test("both A and B take lethal combat damage at once: Zhonya's controller (P1) is ASKED which death it replaces (rule 373 — a P1 pick over {A, B})", async () => {
    const game = await twoDeathsBoard().build();
    await attackUntilP1Asked(game);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "replacement-assign", timing: "RPL" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : []).toEqual(["a", "b"]);
    expect(d?.kind === "pick" ? [d.min, d.max] : []).toEqual([1, 1]);
  });

  test("P1 names B: B is 'saved' (never dies — healed, exhausted, recalled to base), Zhonya's is killed instead, A dies for real; Crusher conquers bf1", async () => {
    const game = await twoDeathsBoard().build();
    await attackUntilP1Asked(game);
    await game.p1.pick("b");
    await game.settle();
    expect(game.zoneOf("zhonya")).toBe("trash");
    expect(game.zoneOf("b")).toBe("base");
    expect(game.state("b")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.locationOf("crusher")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("…or P1 names A instead: then A is the one recalled alive and B dies — it is genuinely P1's choice", async () => {
    const game = await twoDeathsBoard().build();
    await attackUntilP1Asked(game);
    await game.p1.pick("a");
    await game.settle();
    expect(game.zoneOf("a")).toBe("base");
    expect(game.state("a")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.zoneOf("zhonya")).toBe("trash");
  });

  test("Zhonya's AND Guardian Angel would both replace the Knight's single death: P1 is asked which applies FIRST (rule 372 — a P1 'replacement-order' decision naming both sources)", async () => {
    const game = await doubleShieldBoard().build();
    expect(game.state("knight")).toMatchObject({ attachments: ["ga"], might: 4 });
    await attackUntilP1Asked(game);
    const d = game.decision();
    expect(d).toMatchObject({ seat: P1, timing: "RPL" });
    expect(d?.kind === "pick" ? d.semantics : d?.kind).toBe(d?.kind === "pick" ? "replacement-order" : "order");
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : d?.kind === "order" ? d.items.map((o) => o.card ?? o.key) : [];
    expect(offered.toSorted()).toEqual(["ga", "zhonya"]);
  });

  test("P1 picks Zhonya's first: Zhonya's is killed instead and saves the Knight; Guardian Angel then has no death left to replace — it is NOT used up (still on the board, on the recalled Knight)", async () => {
    const game = await doubleShieldBoard().build();
    await attackUntilP1Asked(game);
    await game.p1.pick("zhonya");
    await game.settle();
    expect(game.zoneOf("zhonya")).toBe("trash");
    expect(game.zoneOf("knight")).toBe("base");
    expect(game.state("knight")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.zoneOf("ga")).not.toBe("trash"); // only ONE replacement went off
    expect(game.state("ga").attachedTo).toBe("knight");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("P1 picks Guardian Angel first: GA is killed instead and saves the Knight; Zhonya's stays in base unused", async () => {
    const game = await doubleShieldBoard().build();
    await attackUntilP1Asked(game);
    await game.p1.pick("ga");
    await game.settle();
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.zoneOf("knight")).toBe("base");
    expect(game.state("knight")).toMatchObject({ attachments: [], damage: 0, isExhausted: true });
    expect(game.zoneOf("zhonya")).toBe("base"); // not consumed
    expect(game.violations()).toEqual([]);
  });
});
