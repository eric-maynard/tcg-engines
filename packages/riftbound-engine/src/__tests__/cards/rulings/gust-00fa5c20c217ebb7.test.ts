/**
 * Ruling 00fa5c20c217ebb7 — Gust (OGN-169 → ogn-169-298) · Spell · Chaos · [1] · [Reaction]
 *     "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   × [Assault] keyword — exercised with Chemtech Enforcer (OGN-003 → ogn-003-298) · 2 Might · "[Assault 2] … When you
 *     play me, discard 1." and Daring Poro (OGN-210 → ogn-210-298) · 2 Might · "[Assault]".
 *
 * Q: Does Assault go on the chain (so Gust could answer it before the Might is added), or does it apply immediately?
 * A: Assault is a passive: it applies immediately and continuously while the unit is an attacker. Nothing goes on the
 *    chain, so there is no window to Gust the unit "before" the bonus — once it is attacking, the bonus is already there.
 * Rules: 727 (Assault: +N Might while attacking — a passive keyword), 383 (only triggered abilities use the chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const CHEMTECH_ENFORCER = "ogn-003-298"; // 2 Might, Assault 2
const DARING_PORO = "ogn-210-298"; // 2 Might, Assault (1)

/** P1's turn. P2 holds bf1 with a 6-Might Guard and has Gust + [1]. P1: Enforcer (2, Assault 2) and Poro (2, Assault) ready in base. */
function board() {
  return scenario()
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 6, name: "Guard" }, "guard")
    .unit(P1, "base", CHEMTECH_ENFORCER, "enforcer")
    .unit(P1, "base", DARING_PORO, "poro")
    .hand(P2, GUST, "gust");
}

const gustTargets = (game: Game): unknown[] => (game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();

describe("Ruling 00fa5c20c217ebb7 — Assault is a passive, not a chain item; Gust cannot pre-empt it", () => {
  test("before attacking: both units read their printed 2 (Assault inert off-attack)", async () => {
    const game = await board().build();
    expect(game.state("enforcer")).toMatchObject({ combatRole: null, might: 2 });
    expect(game.state("poro")).toMatchObject({ combatRole: null, might: 2 });
  });

  test("the Enforcer attacks: it is an attacker at 4 Might IMMEDIATELY, with NO item on the chain (nothing for Gust to respond to) — P1 simply holds Focus in the showdown", async () => {
    const game = await board().build();
    await game.p1.move("enforcer", "bf1");
    expect(game.chain()).toEqual([]);
    expect(game.state("enforcer")).toMatchObject({ combatRole: "attacker", might: 4 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("consequence: when P2 does get to act (P1 passes Focus), the Enforcer already counts as 4 Might — above Gust's 'with 3 [Might] or less' — so Gust cannot even choose it", async () => {
    const game = await board().build();
    await game.p1.move("enforcer", "bf1");
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(gustTargets(game)).not.toContain("enforcer");
    expect(game.p2.can("cast", "gust")).toBe(false); // no legal target at all
    expect((await game.p2.try((p) => p.cast("gust", { targets: "enforcer" }))).ok).toBe(false);
    expect(game.zoneOf("enforcer")).toBe("battlefield-bf1");
  });

  test("contrast — the Poro (2 + Assault 1 = 3) stays within Gust's range: Gust can bounce it, but that is just removing the attacker, not 'responding to Assault' (its 3 already included the bonus)", async () => {
    const game = await board().build();
    await game.p1.move("poro", "bf1");
    expect(game.chain()).toEqual([]);
    expect(game.state("poro")).toMatchObject({ combatRole: "attacker", might: 3 });
    await game.p1.passFocus();
    expect(gustTargets(game)).toContain("poro");
    await game.p2.cast("gust", { targets: "poro" });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("hand");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});
