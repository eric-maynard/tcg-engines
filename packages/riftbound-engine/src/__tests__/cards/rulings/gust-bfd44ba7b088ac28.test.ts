/**
 * Ruling bfd44ba7b088ac28 — Gust (OGN-169 → ogn-169-298) × Ride the Wind (OGN-173 → ogn-173-298)
 *   Gust ([1], Reaction): "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   Ride the Wind ([2][chaos], Action): "Move a friendly unit and ready it."
 *
 * Q: Does combat damage reduce a unit's Might — can I Gust a creature after it takes damage in combat?
 * A: No. Damage is counted separately; Might is unchanged (a 6-Might unit with 3 damage is still 6 Might → not Gust-able). All combat
 *    damage is dealt at once; spells must be played during the showdown — there is no window after the showdown but before damage —
 *    and after combat all units heal. You can't standard-move into a showdown in progress, but an effect like Ride the Wind can.
 * Rules: 143.3 (damage marked, Might unchanged), 465–466 (combat damage simultaneous; Combat Cleanup heals all units),
 *        343–345 (showdown: Focus/priority windows), 431 (standard move only in an Open state on your turn).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const RIDE_THE_WIND = "ogn-173-298";

/**
 * P1's turn with [3][chaos] (Gust + Ride the Wind). P2 holds bf1 with Big — 6 Might carrying 3 damage "from combat" — P1 has a
 * 2-Might Poker (attacks) and a 2-Might Late unit in base.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 6, name: "Big" }, "big", { damage: 3 })
    .unit(P1, "base", { might: 2, name: "Poker" }, "poker")
    .unit(P1, "base", { might: 2, name: "Late" }, "late")
    .hand(P1, GUST, "gust")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

const gustTargets = (game: Awaited<ReturnType<ReturnType<typeof board>["build"]>>) =>
  (game.p1.option("cast", "gust")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();

describe("Ruling bfd44ba7b088ac28 — damage doesn't lower Might, so a damaged 6-Might unit is no Gust target; spells go in the showdown", () => {
  test("Big with 3 damage still reads 6 Might (damage tracked separately) — Gust cannot choose it, neither in the main phase nor during a showdown at its battlefield", async () => {
    const game = await board().unit(P2, "bf1", { might: 3, name: "Small" }, "small").build();
    expect(game.state("big")).toMatchObject({ baseMight: 6, damage: 3, might: 6 });
    expect(gustTargets(game)).toEqual(["small"]); // the genuine ≤3 unit only
    const r = await game.p1.try((p) => p.cast("gust", { targets: "big" }));
    expect(r.ok).toBe(false);
    await game.p1.move("poker", "bf1"); // showdown at bf1, P1 has Focus
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(gustTargets(game).sort()).toEqual(["poker", "small"]); // Poker (2) is now at a battlefield too — Big still isn't offered
    expect(gustTargets(game)).not.toContain("big");
    expect(game.zoneOf("gust")).toBe("hand");
  });

  test("the showdown is the window: Gust is playable while P1 holds Focus; once both pass, combat damage is dealt all at once with no further prompt in between, and afterwards surviving units are healed (Big back to 0 damage, still 6 Might)", async () => {
    const game = await board().build();
    await game.p1.move("poker", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.legal().map((o) => o.key)).toContain("playSpell:gust"); // the Reaction is playable in this window (Poker is a legal ≤3 unit here)
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.passFocus();
    // straight to the result: Poker (2) died to Big's 6; Big took 2 (3+2 < 6) and survived — then Combat Cleanup healed it
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("poker")).toBe("trash");
    expect(game.zoneOf("big")).toBe("battlefield-bf1");
    expect(game.state("big")).toMatchObject({ damage: 0, might: 6 });
    expect(game.violations()).toEqual([]);
  });

  test("no standard move into a showdown in progress — but Ride the Wind (an Action, legal in the showdown) can move Late in, where it joins as an attacker", async () => {
    const game = await board().build();
    await game.p1.move("poker", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.legal().filter((o) => o.verb === "move")).toEqual([]); // Late is ready, yet no standard move is offered
    expect(game.p1.can("cast", "rtw")).toBe(true);
    await game.p1.cast("rtw", { targets: "late" });
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("battlefield-bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.locationOf("late")).toBe("bf1");
    expect(game.state("late")).toMatchObject({ combatRole: "attacker", isReady: true });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });
});
