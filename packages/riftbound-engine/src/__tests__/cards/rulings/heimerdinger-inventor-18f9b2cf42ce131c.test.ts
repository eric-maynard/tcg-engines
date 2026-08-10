/**
 * Ruling 18f9b2cf42ce131c — Heimerdinger, Inventor (OGN-111 → ogn-111-298) · Unit · Mind · 3
 *   "I have all [Exhaust] abilities of all friendly legends, units, and gear."
 *   × Vanguard Armory (SFD-168 → sfd-168-221) "[Exhaust]: Play three 1 [Might] Recruit unit tokens."
 *   × Viktor, Leader (OGN-246 → ogn-246-298) — triggered ability only (no [Exhaust] ability).
 *   (+ Seal of Insight ogn-120-298 "[Exhaust]: [Reaction] — [Add] [mind]" as a second [Exhaust] source.)
 *
 * Q: With several sources of [Exhaust] abilities, can Heimerdinger activate multiple copied abilities at once?
 * A: He HAS all of them simultaneously, but each activation exhausts Heimerdinger himself (not the source), so he can
 *    use only one until he is readied. Viktor, Leader has no [Exhaust] ability, so there is nothing to copy from him.
 * Rules: 377.3 (activated ability costs are paid on activation), 740.1.a (friendly), 727 ([Exhaust] cost).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HEIMERDINGER = "ogn-111-298";
const VANGUARD_ARMORY = "sfd-168-221";
const VIKTOR_LEADER = "ogn-246-298";
const SEAL_OF_INSIGHT = "ogn-120-298";

function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "base", HEIMERDINGER, "heimer")
    .gear(P1, VANGUARD_ARMORY, "armory")
    .gear(P1, SEAL_OF_INSIGHT, "seal")
    .unit(P1, "base", VIKTOR_LEADER, "viktor")
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker");
}

/** The source cards whose [Exhaust] abilities Heimerdinger currently offers. */
function heimerSources(game: Game): string[] {
  return game.p1
    .legal()
    .filter((o) => o.moveId === "activateAbility" && o.card === "heimer")
    .flatMap((o) => o.variants.map((v) => String(v.params.sourceCardId)))
    .sort();
}

describe("Ruling 18f9b2cf42ce131c — Heimerdinger has every friendly [Exhaust] ability but can use only one per ready", () => {
  test("he has ALL of them at once: both the Armory's and the Seal's [Exhaust] abilities are offered on Heimerdinger; Viktor, Leader (no [Exhaust] ability) contributes nothing", async () => {
    const game = await board().build();
    expect(heimerSources(game)).toEqual(["armory", "seal"]);
    expect(heimerSources(game)).not.toContain("viktor");
  });

  test("activating the copied Armory ability exhausts HEIMERDINGER (the Armory stays ready) and plays three Recruit tokens", async () => {
    const game = await board().build();
    await game.p1.activate("heimer", 0, { source: "armory" });
    expect(game.state("heimer").isExhausted).toBe(true);
    expect(game.state("armory").isExhausted).toBe(false);
    // Resolve: pass priorities, then place each Recruit (destination prompts) in base.
    for (let i = 0; i < 20; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "action") {
        await game.acting().passPriority();
      } else if (d.kind === "pick") {
        expect(d.seat).toBe(P1);
        await game.p1.pick("base");
      } else {
        break;
      }
    }
    const recruits = game.p1.units("base").filter((u) => game.state(u).name === "Recruit");
    expect(recruits).toHaveLength(3);
    expect(recruits.every((r) => game.state(r).might === 1)).toBe(true);
  });

  test("…after which he cannot activate the OTHER copied ability (he is exhausted): no Heimerdinger activation is offered and forcing the Seal's fails — while the Seal and Armory themselves remain usable", async () => {
    const game = await board().build();
    await game.p1.activate("heimer", 0, { source: "armory" });
    await game.settle({ policy: "first" });
    expect(game.state("heimer").isExhausted).toBe(true);
    expect(heimerSources(game)).toEqual([]);
    const r = await game.p1.try((p) => p.activate("heimer", 0, { source: "seal" }));
    expect(r.ok).toBe(false);
    expect(game.p1.power("mind")).toBe(0);
    // The originals were never tapped — their own permanents can still use them.
    expect(game.p1.can("activate", "seal")).toBe(true);
    expect(game.p1.can("activate", "armory")).toBe(true);
  });

  test("once Heimerdinger is READY again (his next turn) the copied abilities are available once more", async () => {
    const game = await board().build();
    await game.p1.activate("heimer", 0, { source: "seal" });
    await game.settle();
    expect(game.p1.power("mind")).toBe(1);
    expect(game.state("heimer").isExhausted).toBe(true);
    expect(heimerSources(game)).toEqual([]);
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1 (Heimerdinger readies)
    expect(game.state("heimer").isReady).toBe(true);
    expect(heimerSources(game)).toEqual(["armory", "seal"]);
    expect(game.violations()).toEqual([]);
  });
});
