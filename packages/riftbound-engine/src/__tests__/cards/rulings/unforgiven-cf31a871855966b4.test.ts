/**
 * Ruling cf31a871855966b4 — Unforgiven (Yasuo legend, OGN-259 → ogn-259-298) "[2], [Exhaust]: Move a friendly unit to or
 *   from its base."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · Spell · [Action] · 2 + [chaos] · "Move a friendly unit and ready it."
 *
 * Q: Yasuo enters an opponent's battlefield and a showdown starts. Can his owner Ride the Wind him to another battlefield
 *    and then move out of there before that showdown starts?
 * A: During the showdown a spell (Ride the Wind) may move him — that removes him from the showdown and queues another
 *    showdown at the new battlefield — but the ORIGINAL showdown must still be resolved first (now with no attackers);
 *    only then does the new one open. Units cannot Standard-Move during showdowns; Yasuo's legend ability has no
 *    [Reaction] tag, so it cannot be used to react (though it can be reacted to).
 * Rules: 144.1.c (no Standard Move during a Showdown/Combat), 335 / 344 (Action timing; one showdown at a time),
 *        460 (a staged combat opens when no other showdown is ongoing), 464–466 (combat with no attackers just ends),
 *        376 (activated abilities without [Reaction] can't be played in Closed states).
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const UNFORGIVEN = "ogn-259-298";
const RIDE_THE_WIND = "ogn-173-298";
/** A 1-cost [Reaction] for P2, to show Yasuo's legend ability can be responded to. */
const QUICK = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  name: "Quick Thought",
  timing: "reaction",
} as const;

/**
 * P1's turn (Unforgiven legend). P2 holds bfA (Guard 3) and bfB (Weakling 1). P1: "Yasuo" (4) and Pal (1) in base,
 * Ride the Wind + 4 energy + [chaos]. P2: a Reaction + 1 energy.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { chaos: 1 } })
    .resources(P2, { energy: 1 })
    .legend(P1, UNFORGIVEN, "unforgiven")
    .battlefield("bfA", { controller: P2 })
    .battlefield("bfB", { controller: P2 })
    .unit(P2, "bfA", { might: 3, name: "Guard" }, "guard")
    .unit(P2, "bfB", { might: 1, name: "Weakling" }, "weak")
    .unit(P1, "base", { might: 4, name: "Yasuo" }, "yas")
    .unit(P1, "base", { might: 1, name: "Pal" }, "pal")
    .hand(P1, RIDE_THE_WIND, "rtw")
    .hand(P2, QUICK, "quick");
}

const showdowns = (game: Game) =>
  (game.gameState.interaction?.showdownStack ?? []).filter((s) => s.active).map((s) => s.battlefieldId);

/** Yasuo attacks bfA (showdown, P1 Focus); P1 Rides the Wind on him → bfB; the spell resolves. */
async function rideYasuoToB(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("yas", "bfA");
  expect(game.state("yas").combatRole).toBe("attacker");
  expect(game.state("guard").combatRole).toBe("defender");
  expect(showdowns(game)).toEqual(["bfA"]);
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("rtw", { targets: "yas" });
  const d = game.decision() as PickDecision;
  expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
  expect(d.options.map((o) => o.key)).toContain("battlefield-bfB");
  await game.p1.pick("battlefield-bfB");
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("rtw")).toBe("trash");
  return game;
}

describe("Ruling cf31a871855966b4 — moving Yasuo out of his showdown with Ride the Wind: old showdown resolves empty first, then the new one", () => {
  test("in the showdown P1 (Focus) may cast Ride the Wind, but has NO Standard Move and cannot use the legend ability (no [Reaction]/[Action] tag)", async () => {
    const game = await board().build();
    await game.p1.move("yas", "bfA");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "rtw")).toBe(true);
    expect(game.p1.can("move")).toBe(false); // Pal cannot Standard-Move now
    expect(game.p1.can("gank")).toBe(false);
    expect(game.p1.energy()).toBe(4);
    expect(game.p1.can("activate", "unforgiven")).toBe(false);
  });

  test("Ride the Wind resolves mid-showdown: Yasuo is at bfB (readied), no longer an attacker; the ORIGINAL showdown at bfA is still the open one and bfB is merely pending", async () => {
    const game = await rideYasuoToB();
    expect(game.locationOf("yas")).toBe("bfB");
    expect(game.state("yas")).toMatchObject({ combatRole: null, isReady: true });
    expect(showdowns(game)).toEqual(["bfA"]); // still resolving A
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: true, controller: P2 });
    expect(game.gameState.battlefields.bfB).toMatchObject({ contested: true, controller: P2 }); // queued, not started
    expect(game.state("weak").combatRole).toBeNull(); // no combat at B yet
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("the bfA showdown resolves first with no attackers (nothing happens, P2 keeps A); THEN the showdown at bfB opens with Yasuo as attacker, and he conquers it", async () => {
    const game = await rideYasuoToB();
    // Finish A: both pass focus.
    for (let i = 0; i < 2; i++) {
      const d = game.decision();
      expect(d).toMatchObject({ context: "showdown", kind: "action" });
      expect(showdowns(game)).toEqual(["bfA"]);
      await game.seat(d!.seat).passFocus();
    }
    expect(game.gameState.battlefields.bfA).toMatchObject({ contested: false, controller: P2 });
    expect(game.zoneOf("guard")).toBe("battlefield-bfA");
    expect(game.state("guard").damage).toBe(0);
    // Now B.
    expect(showdowns(game)).toEqual(["bfB"]);
    expect(game.state("yas").combatRole).toBe("attacker");
    expect(game.state("weak").combatRole).toBe("defender");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.settle();
    expect(game.zoneOf("weak")).toBe("trash");
    expect(game.gameState.battlefields.bfB?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("Yasuo's legend ability itself opens a chain in P1's main phase and CAN be reacted to: P2 gets priority and may play a Reaction before it resolves", async () => {
    const game = await board().build();
    expect(game.p1.can("activate", "unforgiven")).toBe(true);
    await game.p1.activate("unforgiven", 0, { targets: "pal" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "unforgiven", controller: P1 })]);
    expect(game.state("unforgiven").isExhausted).toBe(true);
    // Answer a destination prompt if the engine asks now; otherwise it asks on resolution.
    game.script(P1, [(d) => (d.kind === "pick" && d.semantics === "destination" ? (d.options.find((o) => o.key !== "base")?.key ?? d.options[0]?.key) : undefined)]);
    if (game.decision()?.kind === "pick") {
      await game.settle({ maxSteps: 1 });
    }
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "quick")).toBe(true);
    await game.p2.cast("quick");
    expect(game.chain().map((c) => c.cardId)).toEqual(["unforgiven", "quick"]);
  });
});
