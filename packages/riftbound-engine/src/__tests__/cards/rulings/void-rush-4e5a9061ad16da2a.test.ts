/**
 * Ruling 4e5a9061ad16da2a — Void Rush (SFD-188 → sfd-188-221) · Spell · [2][rainbow]
 *     "Reveal the top 2 cards of your Main Deck. You may banish one, then play it, reducing its cost by [2]. Draw any you
 *      didn't banish."
 *   × Sun Disc (OGN-021 → ogn-021-298) · Gear · [2][fury] · "[Exhaust]: [Legion] — The next unit you play this turn enters ready."
 *
 * Q: If I play Void Rush, can I exhaust Sun Disc before playing my unit from Void Rush?
 * A: No. Sun Disc's ability has no [Reaction]: it can only be activated in an Open state (no chain, nothing resolving) and
 *    only with Legion met (another card played earlier this turn). While Void Rush is on the chain / resolving the state
 *    is Closed. Correct line: play a card → exhaust Sun Disc while Open → play Void Rush → the unit it plays enters ready.
 * Rules: 369 / 151.2 (activated abilities: Open state unless Reaction), 813 (Legion), 336–343 (closed state).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOID_RUSH = "sfd-188-221";
const SUN_DISC = "ogn-021-298";
const SKULKER = "ogn-175-298"; // [3] vanilla 3-Might unit — the unit Void Rush will play (for [1] after the reduction)
const CLEAVE = "ogn-004-298"; // the other revealed card (drawn)
const CHEAP = { cardType: "unit", energyCost: 1, might: 1, name: "Cheap Recruit" } as const; // the Legion enabler

/** P1's turn: Sun Disc ready in base; hand Void Rush + a [1] unit; [6] + [rainbow]; deck top: Skulker, Cleave. */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { rainbow: 1 } })
    .gear(P1, SUN_DISC, "disc")
    .hand(P1, VOID_RUSH, "vr")
    .hand(P1, CHEAP, "cheap")
    .deck(P1, [SKULKER, CLEAVE], ["sk", "cl"]);
}

/** Resolve Void Rush's reveal by banishing-and-playing the Skulker; asserts Sun Disc is never activatable in between. */
async function rushOutSkulker(game: Game): Promise<void> {
  await game.p1.cast("vr");
  // Void Rush on the chain: Closed state — Sun Disc's non-Reaction ability is not on P1's menu.
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.p1.can("activate", "disc")).toBe(false);
  await game.p1.passPriority();
  await game.p2.passPriority();
  // Mid-resolution (the reveal-and-pick prompt): still nothing but the prompt itself — no way to slip the Disc in.
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "from-revealed", source: { cardId: "vr" } });
  expect(d?.kind === "pick" ? d.options.map((o) => o.card) : []).toEqual(["sk", "cl"]);
  expect(game.p1.can("activate", "disc")).toBe(false);
  expect(game.p1.legal().some((o) => o.card === "disc")).toBe(false);
  await game.p1.pick("sk");
  for (let i = 0; i < 6; i++) {
    const next = game.decision();
    if (next?.kind === "yes-no" && next.seat === P1) {
      await game.p1.yes();
    } else if (next?.kind === "pick" && next.seat === P1) {
      expect(game.p1.can("activate", "disc")).toBe(false);
      await game.p1.pick(next.options[0]!.key);
    } else if (next?.kind === "action" && next.context === "chain" && next.passKey) {
      await game.seat(next.seat).pass();
    } else {
      break;
    }
  }
  expect(game.zoneOf("sk")).toBe("base");
  expect(game.zoneOf("cl")).toBe("hand"); // "Draw any you didn't banish"
  expect(game.zoneOf("vr")).toBe("trash");
}

describe("Ruling 4e5a9061ad16da2a — Sun Disc cannot be exhausted in the middle of Void Rush", () => {
  test("Legion first: with no other card played this turn, Sun Disc's ability is not even available in the Open state", async () => {
    const game = await board().build();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "disc")).toBe(false);
    await game.p1.play("cheap");
    await game.settle();
    expect(game.p1.can("activate", "disc")).toBe(true); // Legion now met, state Open
  });

  test("playing Void Rush WITHOUT having exhausted Sun Disc: no window exists on the chain or during resolution to activate it, so the Skulker played off Void Rush enters EXHAUSTED (Disc still ready, unused)", async () => {
    const game = await board().build();
    await game.p1.play("cheap"); // Legion satisfied — the only obstacle left is timing
    await game.settle();
    await rushOutSkulker(game);
    expect(game.state("sk").isExhausted).toBe(true);
    expect(game.state("disc").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 0 } }); // 6 − 1 (Cheap) − 2 (Void Rush) − 1 (Skulker 3−2)
    expect(game.violations()).toEqual([]);
  });

  test("the correct sequence: play a card (Legion) → exhaust Sun Disc while Open (its item resolves) → Void Rush → the Skulker it plays enters READY", async () => {
    const game = await board().build();
    await game.p1.play("cheap");
    await game.settle();
    await game.p1.activate("disc");
    expect(game.state("disc").isExhausted).toBe(true); // [Exhaust] paid
    await game.settle(); // its chain item resolves in the Open state
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    await rushOutSkulker(game);
    expect(game.state("sk").isReady).toBe(true); // "the next unit you play this turn enters ready"
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 0 } });
    expect(game.violations()).toEqual([]);
  });
});
