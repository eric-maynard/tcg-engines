/**
 * Ruling 10116d28a80433e5 — Stormbringer (OGN-250 → ogn-250-298) · Spell · [6]+[rainbow][rainbow]
 *     "Choose a friendly unit in your base. Deal damage equal to its Might to all enemy units at a battlefield,
 *      then move your unit there."
 *   × Yone, Blademaster (SFD-116 → sfd-116-221) "When I conquer a battlefield that was uncontrolled, deal damage
 *     equal to my Might to an enemy unit in a base."
 *   × Guardian Angel (SFD-051 → sfd-051-221) Equipment "If I would die, kill Guardian Angel instead. Heal me,
 *     exhaust me, and recall me."   (× Hostile Takeover FAQ, sfd-202-221 — source of the control-loss stop-gap.)
 *
 * Q: Stormbringer with my 10-Might Yone (in base) at an enemy battlefield whose only unit wears Guardian Angel:
 *    does GA recall it before Yone moves? Does Yone's conquer damage trigger?
 * A: Damage is dealt and Yone moves; during cleanup GA saves the unit (healed, exhausted, recalled to base), the
 *    opponent LOSES control (battlefield becomes uncontrolled though contested), ONE non-combat showdown opens with
 *    only Yone, Yone conquers the now-uncontrolled battlefield and his ability DOES trigger: 5+ damage to a unit
 *    in a base.
 * Rules: 370–373 (GA replacement), 318/323 (cleanup; control lost when vacated — FAQ stop-gap while contested),
 *        344.2 (non-combat showdown), 442 (conquer), Yone's "was uncontrolled" condition.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STORMBRINGER = "ogn-250-298";
const YONE = "sfd-116-221";
const GUARDIAN_ANGEL = "sfd-051-221";

/**
 * P1's turn with exactly [6] + 2 rainbow. P1's Yone in base at 10 Might (5 printed + 5 from an earlier buff this
 * turn). P2 holds bf1 with a 4-Might Guarded unit wearing Guardian Angel (→ 5), and keeps a 3-Might Camper in base.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", YONE, "yone", { mightModifier: 5 } as Record<string, unknown>)
    .unit(P2, "bf1", { might: 4, name: "Guarded" }, "guarded", { equippedWith: ["ga"] } as Record<string, unknown>)
    .card("ga", { def: GUARDIAN_ANGEL, meta: { attachedTo: "guarded" } as Record<string, unknown>, owner: P2, zone: "bf1" })
    .unit(P2, "base", { might: 3, name: "Camper" }, "camper")
    .hand(P1, STORMBRINGER, "storm");
}

function showdowns(game: Game) {
  return game.gameState.interaction?.showdownStack ?? [];
}

/** Cast Stormbringer (Yone → bf1) and let the spell itself resolve; stops at whatever the cleanup hands back. */
async function stormResolves(): Promise<Game> {
  const game = await board().build();
  expect(game.state("yone").might).toBe(10);
  expect(game.state("guarded")).toMatchObject({ attachments: ["ga"], might: 5 });
  await game.p1.cast("storm", { targets: ["yone", "bf1"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["storm"]);
  const stop = await game.settle(); // Stormbringer resolves; the auto-begun showdown is handed back once
  expect(stop.reason).toBe("open");
  return game;
}

describe("Ruling 10116d28a80433e5 — Stormbringer + Yone into a Guardian Angel'd defender", () => {
  test("Stormbringer resolves: lethal damage is dealt, Guardian Angel dies instead and the Guarded unit is healed, exhausted and RECALLED to P2's base; Yone has moved to bf1", async () => {
    const game = await stormResolves();
    expect(game.zoneOf("storm")).toBe("trash");
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.zoneOf("guarded")).toBe("base");
    expect(game.state("guarded")).toMatchObject({ attachments: [], damage: 0, isExhausted: true, might: 4 });
    expect(game.locationOf("yone")).toBe("bf1");
    expect(game.cardsAt("bf1")).toEqual(["yone"]);
  });

  test("P2 LOSES control even though bf1 is contested (FAQ stop-gap): bf1 is uncontrolled + contested by P1, and exactly ONE showdown opens — a NON-combat one with only Yone present", async () => {
    const game = await stormResolves();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: null });
    expect(showdowns(game)).toHaveLength(1);
    expect(showdowns(game)[0]).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: false });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("when that showdown closes Yone CONQUERS the uncontrolled bf1 (P1 scores) and his ability triggers — P1 is asked for an enemy unit in a base (Camper or the recalled Guarded)", async () => {
    const game = await stormResolves();
    const stop = await game.settle(); // both pass focus → showdown ends → conquer → Yone's trigger
    expect(stop.reason).toBe("unanswered");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "yone", controller: P1, triggered: true })]);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target", source: { cardId: "yone" } });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card).sort() : [];
    expect(offered).toEqual(["camper", "guarded"]);
    // Still only the one showdown ever happened (it is now closed).
    expect(showdowns(game).filter((s) => s.active)).toEqual([]);
  });

  test("choosing Camper: Yone deals damage equal to his Might (10) — the 3-Might Camper dies; the whole line ends in P1's open main phase with no invariant violations", async () => {
    const game = await stormResolves();
    await game.settle();
    await game.p1.pick("camper");
    await game.settle();
    expect(game.zoneOf("camper")).toBe("trash");
    expect(game.zoneOf("guarded")).toBe("base");
    expect(game.locationOf("yone")).toBe("bf1");
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
