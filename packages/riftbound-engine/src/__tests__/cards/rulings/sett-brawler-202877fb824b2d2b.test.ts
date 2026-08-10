/**
 * Ruling 202877fb824b2d2b — Sett, Brawler (OGN-164 → ogn-164-298) · Champion Unit · Body · 5 + [body] · 4 Might
 *     "When I'm played and when I conquer, buff me. Spend my buff: Give me +4 [Might] this turn."
 *   × Monastery of Hirana (OGN-282 → ogn-282-298) · Battlefield "When you conquer here, you may spend a buff to draw 1."
 *
 * Q: Why can't Sett conquer the Monastery, get his conquer buff, and spend THAT buff on the Monastery's draw?
 * A: Both triggers fire simultaneously on the conquer. "Spend a buff" is the COST of the Monastery's trigger and must be
 *    paid to finalize that trigger onto the chain (383.3.b) — i.e. before anything resolves, so before Sett's trigger can
 *    hand him a buff. You need a PRE-EXISTING buff; without one the Monastery does nothing and Sett simply gets buffed.
 * Rules: 383.3.b.1–2 (a triggered ability's cost is paid as it is put on the chain, not on resolution), 383.3.d (owner
 *        orders simultaneous triggers).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SETT = "ogn-164-298";
const MONASTERY = "ogn-282-298";

/** P1's turn. Live Monastery of Hirana held by P2 with no units; Sett (4) ready in P1's base, buffed or not. P1's hand empty. */
function board(preBuffed: boolean) {
  return scenario()
    .battlefield("mon", { controller: P2, def: MONASTERY, inert: false })
    .unit(P1, "base", SETT, "sett", preBuffed ? { buffed: true } : undefined);
}

const chainIds = (game: Game) => game.chain().map((c) => c.cardId);

/** Sett walks into the empty Monastery; both pass Focus → P1 conquers (triggers fire). */
async function settConquers(game: Game): Promise<void> {
  await game.p1.move("sett", "mon");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  await game.p2.passFocus();
  expect(game.p1.points()).toBe(1);
  expect(game.gameState.battlefields.mon?.controller).toBe(P1);
}

describe("Ruling 202877fb824b2d2b — Monastery of Hirana's 'spend a buff' must be paid from a buff Sett ALREADY has", () => {
  test("no pre-existing buff: the Monastery's trigger can't be paid for and never reaches the chain — only Sett's 'buff me' does; Sett ends buffed (5) and P1 draws nothing", async () => {
    const game = await board(false).build();
    expect(game.state("sett")).toMatchObject({ isBuffed: false, might: 4 });
    await settConquers(game);
    expect(chainIds(game)).toEqual(["sett"]);
    expect(game.chain()[0]).toMatchObject({ controller: P1, triggered: true });
    // P1 is not even offered the Monastery's option: there is no buff to spend right now.
    expect(game.decision()?.kind).toBe("action");
    await game.settle();
    expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 5 });
    expect(game.p1.hand()).toEqual([]); // the conquer buff could NOT be turned into a card
    expect(game.locationOf("sett")).toBe("mon");
    expect(game.violations()).toEqual([]);
  });

  test("WITH a pre-existing buff: P1 is asked whether to use the Monastery (yes-no, P1) and then orders the two simultaneous triggers (order, P1); default order → Monastery draws 1 and Sett's trigger re-buffs him", async () => {
    const game = await board(true).build();
    expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 5 });
    await settConquers(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "order", seat: P1 });
    expect(d?.kind === "order" ? d.items.map((i) => i.card).sort() : []).toEqual(["mon", "sett"]);
    await game.acceptTriggerOrder(); // listed order: Sett bottom, Monastery top
    expect(chainIds(game)).toEqual(["sett", "mon"]);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(1); // drew 1 off the OLD buff
    expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 5 }); // Sett's conquer buff replaced it
    expect(game.violations()).toEqual([]);
  });

  // 383.3.b.2: the buff is spent the moment the Monastery trigger is finalized onto the chain — before either trigger
  // resolves — so with both items pending Sett is already un-buffed, and even if P1 orders Sett's trigger to resolve FIRST
  // he ends buffed (spent → re-buffed) with the card drawn.
  test("the buff is spent as the Monastery trigger is PUT ON THE CHAIN (not on resolution): Sett is un-buffed while both items are pending, and with Sett's trigger on top he still ends buffed + 1 card", async () => {
    const game = await board(true).build();
    await settConquers(game);
    await game.p1.yes();
    const d = game.decision();
    expect(d?.kind).toBe("order");
    const items = d?.kind === "order" ? d.items : [];
    const monKey = items.find((i) => i.card === "mon")?.key as string;
    const settKey = items.find((i) => i.card === "sett")?.key as string;
    await game.p1.order([monKey, settKey]); // Monastery bottom, Sett on top (resolves first)
    expect(chainIds(game)).toEqual(["mon", "sett"]);
    // Cost already paid at finalize:
    expect(game.state("sett").isBuffed).toBe(false);
    expect(game.p1.hand()).toEqual([]); // …but the draw (the effect) has not happened yet
    await game.settle();
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 5 });
  });
});
