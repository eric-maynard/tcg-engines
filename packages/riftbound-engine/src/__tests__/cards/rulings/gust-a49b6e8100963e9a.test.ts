/**
 * Ruling a49b6e8100963e9a — Gust (OGN-169 → ogn-169-298) · Reaction · [1] · "Return a unit at a battlefield with
 *     3 [Might] or less to its owner's hand."
 *   × Mystic Reversal (OGN-080 → ogn-080-298) · Reaction · [4][calm]×3 · "Gain control of a spell. You may make new
 *     choices for it."
 *
 * Q: Player A holds both battlefields — an 8-Might unit at one, a 3-Might unit at the other. Player B Gusts the 3.
 *    Can A Mystic-Reverse the Gust to avoid bouncing their own unit?
 * A: No. A gains control of Gust and may make new choices, but must still choose a LEGAL target and cannot pick
 *    "no target". The only legal target is A's own 3-Might unit, so it is bounced anyway — the Reversal is wasted.
 * Rules: 751–755 (new choices for a controlled chain item must be legal), 355.10 (a target must be chosen when one
 *        exists), 425 vs. resolve (nothing counters Gust here).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const MYSTIC_REVERSAL = "ogn-080-298";

/** P2 (Player B)'s turn. P1 (Player A) holds bf1 with Giant (8) and bf2 with Small (3); P1: Mystic Reversal + [4]+3 calm. P2: Gust + [1]. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 8, name: "Giant" }, "giant")
    .unit(P1, "bf2", { might: 3, name: "Small" }, "small")
    .unit(P2, "base", { might: 2, name: "B's Homebody" }, "home") // in base: not "at a battlefield"
    .hand(P1, MYSTIC_REVERSAL, "reversal")
    .resources(P1, { energy: 4, power: { calm: 3 } })
    .hand(P2, GUST, "gust")
    .resources(P2, { energy: 1 });
}

/** B Gusts Small; A answers with Mystic Reversal on Gust; the Reversal resolves. */
async function reversedGust(): Promise<Game> {
  const game = await board().build();
  const gustTargets = (game.p2.option("cast", "gust")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
  expect(gustTargets).toEqual(["small"]); // the only ≤3 unit at a battlefield
  await game.p2.cast("gust", { targets: "small" });
  expect(game.p2.energy()).toBe(0);
  await game.p2.passPriority();
  expect(game.p1.can("cast", "reversal")).toBe(true);
  await game.p1.cast("reversal", { targets: "gust" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["gust", "reversal"]);
  await game.p1.passPriority();
  await game.p2.passPriority(); // Mystic Reversal resolves
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gust", controller: P1 })]); // A controls Gust now
  return game;
}

describe("Ruling a49b6e8100963e9a — Mystic Reversal on a Gust whose only legal target is your own unit is a wasted Reversal", () => {
  test("after the Reversal resolves A gets NO way to aim Gust elsewhere: either a new-choices pick offering only A's own Small (min 1 — no 'no target'), or — the single legal choice being forced — straight back to priority with Gust still on Small", async () => {
    const game = await reversedGust();
    const d = game.decision();
    expect(d?.seat).toBe(P1);
    if (d?.kind === "pick") {
      expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "gust" } });
      expect(d.options.map((o) => o.card ?? o.key)).toEqual(["small"]);
      expect(d.min).toBeGreaterThanOrEqual(1);
      expect((await game.p1.try((p) => p.pick("giant"))).ok).toBe(false);
      expect((await game.p1.try((p) => p.pick("home"))).ok).toBe(false);
      expect((await game.p1.try((p) => p.answer({ keys: [], kind: "pick" }))).ok).toBe(false);
    } else {
      expect(d).toMatchObject({ context: "chain", kind: "action", seat: P1 });
      expect(game.p1.legal().map((o) => o.verb).sort()).toEqual(["concede", "passPriority"]);
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gust", controller: P1, targets: ["small"] })]);
  });

  test("Gust then resolves under A's control and bounces A's OWN Small to hand; the Giant stays; both spells → trash — the Reversal was wasted", async () => {
    const game = await reversedGust();
    if (game.decision()?.kind === "pick") {
      await game.p1.keepChoices();
    }
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("small")).toBe("hand");
    expect(game.p1.hand()).toContain("small");
    expect(game.zoneOf("giant")).toBe("battlefield-bf1");
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("reversal")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("control: without the Reversal the outcome is identical — Small is bounced — so the 4 + [calm]×3 bought nothing", async () => {
    const game = await board().build();
    await game.p2.cast("gust", { targets: "small" });
    await game.settle();
    expect(game.zoneOf("small")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 4, power: { calm: 3 } });
  });
});
