/**
 * Ruling 736d50c0c92ec3a7 — Overzealous Fan (SFD-128 → sfd-128-221) · Unit · Chaos · 2 · 2 Might
 *     "When I defend, you may kill me to move an attacking unit to its base."
 *   × Scorn of the Moon (Diana legend, UNL-197 → unl-197-219) "[Reaction] ▸ [Exhaust]: [Add] [1]. Spend this Energy only
 *     during showdowns."
 *   × Gust (OGN-169 → ogn-169-298) · 1 · [Reaction] "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *
 * Q: I attack into Overzealous Fan. Can I exhaust Diana to pay for Gust on the Fan BEFORE the opponent gets to use the
 *    Fan's trigger?
 * A: The opponent decides on the Fan's "may" immediately as the trigger is put on the chain — before I get any window.
 *    If they use it, the Fan is killed up front as the cost; I can still Diana + Gust in that Closed state, but the Fan is
 *    no longer at a battlefield to be Gusted. If they decline, nothing goes on the chain, I still hold Focus, and I may
 *    exhaust Diana for [1] and Gust the Fan back to hand.
 * Rules: 383.3.b.1 (optional trigger cost paid as it is put on the chain), 345 (attacker gains Focus), 813 (Reaction
 *        timing), 160-ish Add abilities resolve immediately.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const OVERZEALOUS_FAN = "sfd-128-221";
const SCORN_OF_THE_MOON = "unl-197-219";
const GUST = "ogn-169-298";

/** P1 (Diana legend, 0 energy, Gust in hand) attacks P2's bf1 held by a lone Overzealous Fan with a 5-Might Charger. */
function board() {
  return scenario()
    .legend(P1, SCORN_OF_THE_MOON, "diana")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", OVERZEALOUS_FAN, "fan")
    .unit(P1, "base", { might: 5, name: "Charger" }, "charger")
    .hand(P1, GUST, "gust");
}

async function attack(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.energy()).toBe(0);
  await game.p1.move("charger", "bf1");
  expect(game.state("charger").combatRole).toBe("attacker");
  expect(game.state("fan").combatRole).toBe("defender");
  return game;
}

describe("Ruling 736d50c0c92ec3a7 — the Fan's controller chooses first; Diana + Gust only pre-empts a DECLINED Fan", () => {
  test("timing: the very first decision after the attack is P2's yes/no on the Fan (a finalization-time choice) — P1 has no legal action yet, so there is no window to Gust first", async () => {
    const game = await attack();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P2 });
    expect(d?.kind === "yes-no" ? d.source?.cardId : undefined).toBe("fan");
    expect(game.actingSeat()).toBe(P2);
    expect(game.p1.legal()).toEqual([]);
    expect(game.p1.can("activate", "diana")).toBe(false);
    expect(game.p1.can("cast", "gust")).toBe(false);
  });

  test("path A — P2 uses it: the Fan is killed UP FRONT as the cost; P1 may still exhaust Diana for [1] in the closed state, but Gust has no legal target (Fan is in the trash, Charger is 5 Might); the trigger then sends Charger home", async () => {
    const game = await attack();
    await game.p2.yes();
    if (game.decision()?.kind === "pick" && game.actingSeat() === P2) {
      await game.p2.pick("charger"); // "an attacking unit" — the only one
    }
    expect(game.zoneOf("fan")).toBe("trash"); // cost paid before anyone responds
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fan", controller: P2, triggered: true })]);
    // P1 gets priority on the closed chain.
    if (game.actingSeat() === P2) {
      await game.p2.passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "diana")).toBe(true);
    await game.p1.activate("diana"); // [Add] [1] — resolves immediately, no chain item
    expect(game.p1.energy()).toBe(1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["fan"]);
    expect(game.p1.can("cast", "gust")).toBe(false); // nothing ≤3 Might at a battlefield
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("charger")).toBe("base");
    expect(game.zoneOf("gust")).toBe("hand");
  });

  test("path B — P2 declines: no trigger on the chain, the Fan lives, the showdown is open and P1 (attacker) holds Focus", async () => {
    const game = await attack();
    await game.p2.no();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("fan")).toBe("battlefield-bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("path B cont. — P1 exhausts Diana for [1] (usable: we are in a showdown), then Gusts the 2-Might Fan back to P2's hand before anything else happens", async () => {
    const game = await attack();
    await game.p2.no();
    expect(game.p1.can("cast", "gust")).toBe(false); // 0 energy
    await game.p1.activate("diana");
    expect(game.p1.energy()).toBe(1);
    expect(game.state("diana").isExhausted).toBe(true);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 }); // Add: no chain, Focus kept
    expect(game.p1.can("cast", "gust")).toBe(true);
    await game.p1.cast("gust", { targets: "fan" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("fan")).toBe("hand");
    expect(game.p2.hand()).toContain("fan");
    expect(game.zoneOf("gust")).toBe("trash");
    // With the lone defender gone the Charger takes bf1.
    expect(game.locationOf("charger")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
