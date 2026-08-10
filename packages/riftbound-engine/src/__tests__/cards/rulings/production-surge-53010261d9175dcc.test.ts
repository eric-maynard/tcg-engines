/**
 * Ruling 53010261d9175dcc — Production Surge (SFD-076 → sfd-076-221) · Spell · Mind · 4
 *     "This costs [2] less if you control a Mech. Play a 3 [Might] Mech unit token to your base. Draw 1."
 *   × Forecaster (sfd-065-221) · 2-Might Mech — "Your Mechs have [Vision]. (When you play us, look at the top card of
 *     your Main Deck. You may recycle it.)"
 *
 * Q: A unit with Vision enters during the resolution of a spell. Does the Vision trigger resolve before the spell
 *    finishes resolving?
 * A: No. A resolving spell cannot be interrupted: the token enters (Vision triggers, held pending), the spell finishes
 *    ALL its text (so Surge's "Draw 1" happens first), leaves the chain, then the pending Vision trigger is finalized onto
 *    the chain, players may react, and it resolves. So Vision cannot look at the card Surge is about to draw.
 * Rules: 337.1 / 354.3 (triggers during a resolution wait as Pending Items), 359 (finish every instruction), 340 (then
 *        priority), 817 (Vision).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PRODUCTION_SURGE = "sfd-076-221";
const FORECASTER = "sfd-065-221";
const FILLER = "ogn-175-298";

const mechTokens = (ids: string[]) => ids.filter((c) => c.startsWith("token-mech-"));

/** P1's turn: Forecaster (a Mech → Surge costs 2) in base, exactly 2 energy + [mind], Surge in hand; deck = top, second, third. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { mind: 1 } })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", FORECASTER, "forecaster")
    .hand(P1, PRODUCTION_SURGE, "surge")
    .fillDecks(false)
    .deck(P1, [FILLER, FILLER, FILLER], ["top", "second", "third"]);
}

/** Cast Surge and let ONLY the spell resolve (both pass once). */
async function surgeResolves(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("surge");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } }); // discounted by the Forecaster Mech
  expect(game.chain().map((c) => c.cardId)).toEqual(["surge"]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  if (game.decision()?.kind === "order") {
    await game.acceptTriggerOrder();
  }
  return game;
}

describe("Ruling 53010261d9175dcc — the Mech token's Vision waits for Production Surge to finish; Surge draws first", () => {
  test("Surge resolves completely in one go: the Mech token is in base AND 'top' has already been drawn; the spell is in the trash — and only NOW is the token's Vision trigger on the chain (no look was offered mid-spell)", async () => {
    const game = await surgeResolves();
    const toks = mechTokens(game.p1.base());
    expect(toks).toHaveLength(1);
    expect(game.state(toks[0]!).keywords).toContain("Vision"); // granted by Forecaster
    expect(game.p1.hand()).toEqual(["top"]); // Draw 1 already happened
    expect(game.zoneOf("surge")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: toks[0], controller: P1, triggered: true })]);
    // The pending decision is a priority window on that trigger, not a Vision look.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("both players get a reaction window on the Vision item before it resolves (P1 then P2 hold priority with it on the chain)", async () => {
    const game = await surgeResolves();
    const tok = mechTokens(game.p1.base())[0]!;
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.chain().map((c) => c.cardId)).toEqual([tok]);
  });

  test("when Vision finally resolves it looks at 'second' — the card AFTER the one Surge drew — never at 'top'; recycling it sends 'second' to the bottom", async () => {
    const game = await surgeResolves();
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const shown = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(shown).toEqual(["second"]);
    expect(shown).not.toContain("top");
    await game.p1.pick(d?.kind === "pick" ? (d.options[0]?.key as string) : "second"); // recycle it
    await game.settle();
    expect(game.p1.hand()).toEqual(["top"]);
    expect(game.p1.deck()).toEqual(["third", "second"]);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
