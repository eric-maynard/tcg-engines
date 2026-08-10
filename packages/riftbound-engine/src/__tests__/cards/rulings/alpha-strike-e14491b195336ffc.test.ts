/**
 * Ruling e14491b195336ffc — Alpha Strike (UNL-192 → unl-192-219) · Spell · Calm/Body · 3+[rainbow] · Action
 *     "Choose a friendly unit. It deals damage equal to its Might split among enemy units at battlefields. Then for each
 *      unit this kills, do this: Gain 1 XP."
 *   × Guardian Angel (SFD-051 → sfd-051-221) · Equipment (+1) "If I would die, kill Guardian Angel instead. Heal me,
 *     exhaust me, and recall me."
 *
 * Q: Do I get XP if Alpha Strike "kills" an enemy unit wearing Guardian Angel?
 * A: No. Guardian Angel replaces the death: the Angel is killed instead and the unit is healed, exhausted and recalled —
 *    it never died / never went to the trash, so Alpha Strike killed nothing and its XP instruction does not fire.
 * Rules: 366/373 (replacement effects), 428 (kill = board → trash), 387 (reflexive "for each unit this kills").
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ALPHA_STRIKE = "unl-192-219";
const GUARDIAN_ANGEL = "sfd-051-221";

/** P1's turn with exactly 3 + 1 rainbow; Champ (4) in base. P2 holds bf1 with a 3-Might Guarded unit wearing Guardian Angel (→ 4). */
function board(withAngel = true) {
  const s = scenario()
    .resources(P1, { energy: 3, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 4, name: "Champ" }, "champ")
    .hand(P1, ALPHA_STRIKE, "alpha");
  return withAngel
    ? s
        .unit(P2, "bf1", { might: 3, name: "Guarded" }, "guarded", { equippedWith: ["ga"] })
        .card("ga", { def: GUARDIAN_ANGEL, meta: { attachedTo: "guarded" }, owner: P2, zone: "bf1" })
    : s.unit(P2, "bf1", { might: 4, name: "Guarded" }, "guarded");
}

describe("Ruling e14491b195336ffc — no XP when Guardian Angel saves Alpha Strike's victim", () => {
  test("Alpha Strike (Champ → Guarded): 4 damage is lethal, Guardian Angel dies INSTEAD — Guarded is healed, exhausted and recalled to P2's base, never in the trash", async () => {
    const game = await board().build();
    expect(game.state("guarded")).toMatchObject({ attachments: ["ga"], might: 4 });
    await game.p1.cast("alpha", { targets: ["champ", "guarded"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await game.settle();
    expect(game.zoneOf("alpha")).toBe("trash");
    const hits = (game.gameState.damageLog ?? []).filter((r) => !r.combat);
    expect(hits).toEqual([expect.objectContaining({ amount: 4, target: "guarded" })]);
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.zoneOf("guarded")).toBe("base");
    expect(game.p2.trash()).not.toContain("guarded");
    expect(game.state("guarded")).toMatchObject({ attachments: [], damage: 0, isExhausted: true, might: 3 });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // Expected: the death was replaced (unit recalled, only the GEAR Guardian Angel was killed — and by its own effect),
  // so "for each unit this kills" counts zero and P1 stays at 0 XP. Actual: the engine credits Alpha Strike with a
  // kill and P1 gains 1 XP.
  test("ruling e14491b195336ffc — engine awards 1 XP although Guardian Angel replaced the death (no unit was killed)", async () => {
    const game = await board().build();
    await game.p1.cast("alpha", { targets: ["champ", "guarded"] });
    await game.settle();
    expect(game.zoneOf("guarded")).toBe("base");
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.p1.xp()).toBe(0);
  });

  test("contrast — the same 4 into an unprotected 4-Might Guarded kills it (to P2's trash) and P1 DOES gain 1 XP", async () => {
    const game = await board(false).build();
    await game.p1.cast("alpha", { targets: ["champ", "guarded"] });
    await game.settle();
    expect(game.zoneOf("guarded")).toBe("trash");
    expect(game.p2.trash()).toContain("guarded");
    expect(game.p1.xp()).toBe(1);
  });
});
