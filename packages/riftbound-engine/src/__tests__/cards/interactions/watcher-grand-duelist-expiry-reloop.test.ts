/**
 * Interaction: Thousand-Tailed Watcher (ogn-116-298) · Unit · Mind · 7+[mind] · 7 Might
 *     "When you play me, give enemy units -3 [Might] this turn, to a minimum of 1 [Might]."      — P2's
 *   × Grand Duelist (sfd-205-221) · Legend (Fiora)
 *     "When one of your units becomes [Mighty], you may exhaust me to channel 1 rune exhausted."  — P1's
 *   × Playful Phantom (ogn-049-298, 5 Might) and Mega-Mech (ogn-088-298, 8 Might)                — P1's
 *
 * Board: P2's turn. P1: Grand Duelist (ready), Playful Phantom 5, Mega-Mech 8, empty rune pool. P2 plays the
 * Watcher → Phantom 2, Mega-Mech 5. P2 ends the turn.
 *
 * Rules: 317.2.c (3d: all "this turn" effects expire simultaneously in the Ending Special Cleanup), 710 (a unit is
 * evaluated on CURRENT Might — the rule's own example is a bonus expiring at end of turn), 709 (BECOMES Mighty =
 * crosses from <5 to ≥5; 5→8 does not), 320.1 (pending items may be added during a cleanup), 334.2/336.1 (they
 * then undergo FEPR), 317.2.e–f (an item underwent FEPR during the Expiration Step → return to the START of the
 * Expiration Step) before 317.3 (next player becomes Turn Player), 324.2, 383.3.d.1.
 *
 * Expected: at 3d Phantom 2→5 becomes Mighty → Grand Duelist triggers for P1 during P2's Ending Phase; Mega-Mech
 * 5→8 was Mighty throughout → no second trigger. P1 may exhaust the legend → +1 rune, exhausted, BEFORE the turn
 * passes; the Expiration Step re-runs (nothing new), then P1 becomes Turn Player and Awaken readies legend + rune:
 * P1 opens the main phase with 3 runes (2 channelled + 1). Contrast (Mega-Mech only): no trigger, 2 runes.
 * (RiftJudge: Grand Duelist DOES trigger when a -Might effect expires at the opponent's end of turn.)
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const WATCHER = "ogn-116-298";
const GRAND_DUELIST = "sfd-205-221";
const PLAYFUL_PHANTOM = "ogn-049-298";
const MEGA_MECH = "ogn-088-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** P2 to act on turn 2 with exactly the Watcher's cost floating; P1 has the legend, Mega-Mech and (optionally) Phantom. */
function board(opts: { phantom?: boolean; legendExhausted?: boolean } = {}) {
  let s = scenario()
    .turn(2)
    .active(P2)
    .resources(P2, { energy: 7, power: { mind: 1 } })
    .card("gd", { def: GRAND_DUELIST, meta: opts.legendExhausted ? { exhausted: true } : undefined, owner: P1, zone: "legendZone" })
    .unit(P1, "base", MEGA_MECH, "mech")
    .hand(P2, WATCHER, "watcher");
  if (opts.phantom !== false) {
    s = s.unit(P1, "base", PLAYFUL_PHANTOM, "phantom");
  }
  return s;
}

/** P2 plays the Watcher and its play trigger resolves. */
async function watcherLands(game: Game): Promise<void> {
  await game.p2.play("watcher");
  await game.settle();
}

describe("Thousand-Tailed Watcher expiry × Grand Duelist — 'becomes Mighty' at 3d of the opponent's Expiration Step", () => {
  test("premise: the Watcher's play trigger takes Phantom 5 → 2 and Mega-Mech 8 → 5 for the turn; Grand Duelist is NOT asked (nothing became Mighty — Mech only dropped TO 5)", async () => {
    const game = await board().build();
    expect(game.state("phantom").might).toBe(5);
    expect(game.state("mech").might).toBe(8);
    await watcherLands(game);
    expect(game.zoneOf("watcher")).toBe("base");
    expect(game.state("phantom").might).toBe(2);
    expect(game.state("mech").might).toBe(5);
    expect(game.state("watcher").might).toBe(7); // "enemy units" only
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.state("gd").isExhausted).toBe(false);
    expect(game.p1.runes()).toHaveLength(0);
  });

  test("after the turn passes the -3 is gone: Phantom is 5 and Mega-Mech 8 again in P1's main phase (317.2.c)", async () => {
    // Phantom 2 → 5 becomes Mighty at 3d, so Grand Duelist asks on the way out (rule 709); decline it.
    const game = await board().script(P1, ["no"]).build();
    await watcherLands(game);
    await game.p2.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.state("phantom").might).toBe(5);
    expect(game.state("mech").might).toBe(8);
    expect(game.state("phantom").mightModifier).toBe(0);
  });

  // rule 710 + 317.2.c + 320.1: when the -3 expires at 3d Phantom goes 2 → 5 and BECOMES Mighty, so
  // Grand Duelist's optional trigger is offered to P1 right there, still inside P2's Ending Phase (before 317.3).
  test("P2 ends the turn → P1 is offered Grand Duelist's 'you may exhaust me' while it is still P2's Ending Phase (Phantom became Mighty at 3d)", async () => {
    const game = await board().build();
    await watcherLands(game);
    await game.p2.endTurn();
    const d = game.decision();
    expect(d).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "gd" } });
    expect(game.turnPlayer()).toBe(P2); // 317.2.f loops the Expiration Step BEFORE 317.3 hands the turn over
    expect(game.phase()).toBe("ending");
    expect(game.state("phantom").might).toBe(5); // the expiry already happened when the prompt appears
  });

  // rule 709: exactly ONE Grand Duelist item — for Phantom (2→5). Mega-Mech (5→8) was Mighty the whole
  // time and does not "become" Mighty.
  test("exactly one Grand Duelist trigger (Phantom), not two — Mega-Mech 5 → 8 never stopped being Mighty", async () => {
    const game = await board().build();
    await watcherLands(game);
    await game.p2.endTurn();
    let offers = 0;
    for (let i = 0; i < 4; i++) {
      const d = game.decision();
      if (d?.kind !== "yes-no" || d.source?.cardId !== "gd") {
        break;
      }
      offers++;
      await game.p1.yes();
      await game.settle();
    }
    expect(offers).toBe(1);
  });

  // rule 383.3.b.1 + 430.2: 'yes' exhausts the legend at once and, on resolution (FEPR during the
  // cleanup, 334.2), channels the top rune EXHAUSTED into P1's pool — all before P1 becomes Turn Player.
  test("accepting exhausts Grand Duelist and channels 1 rune EXHAUSTED for P1 during P2's Expiration Step", async () => {
    const game = await board().build();
    const runeDeck = game.p1.runeDeck().length;
    await watcherLands(game);
    await game.p2.endTurn();
    await game.p1.yes();
    expect(game.state("gd").isExhausted).toBe(true);
    // Resolve the item (both pass) but stop before P1's Awaken would ready things: inspect right after resolution.
    for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "gd"); i++) {
      await game.acting().passPriority();
    }
    if (game.turnPlayer() === P2) {
      expect(game.p1.runes()).toHaveLength(1);
      expect(game.p1.runes({ ready: false })).toHaveLength(1);
      expect(game.p1.runeDeck()).toHaveLength(runeDeck - 1);
    }
    await game.settle();
    // After 317.3 → P1's Awaken/Channel: 1 (Grand Duelist) + 2 (Channel Phase) = 3 runes, rune deck down by 3.
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.runes()).toHaveLength(3);
    expect(game.p1.runeDeck()).toHaveLength(runeDeck - 3);
  });

  // End state of the whole sequence (317.2.f second pass is a no-op, then 317.3; P1's Awaken readies
  // the legend and the exhausted rune): P1's main phase opens with 3 READY runes and a READY Grand Duelist.
  test("net result at P1's main phase — 3 runes (all readied by Awaken), Grand Duelist ready again, Phantom 5 / Mech 8, no violations", async () => {
    const game = await board().script(P1, ["yes"]).build();
    await watcherLands(game);
    await game.p2.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.state("phantom").might).toBe(5);
    expect(game.state("mech").might).toBe(8);
    expect(game.state("gd").isExhausted).toBe(false);
    expect(game.p1.runes({ ready: true })).toHaveLength(3);
    expect(game.p1.runes()).toHaveLength(3);
    expect(game.violations()).toEqual([]);
  });

  test("declining path / no trigger path converge: if P1 never exhausts the legend, P1 opens with exactly the 2 Channel-Phase runes and a ready legend", async () => {
    const game = await board().script(P1, ["no"]).build();
    await watcherLands(game);
    await game.p2.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.state("gd").isExhausted).toBe(false);
    expect(game.chain()).toEqual([]);
  });

  test("contrast — only Mega-Mech (no Phantom): 5 → 8 at expiry is not 'becoming Mighty' → no Grand Duelist prompt at all; single Expiration pass, straight to P1's turn with 2 runes", async () => {
    const game = await board({ phantom: false }).build();
    await watcherLands(game);
    expect(game.state("mech").might).toBe(5);
    await game.p2.endTurn();
    // No prompt for P1 between P2's end of turn and P1's open main phase.
    const d = game.decision();
    expect(d?.kind === "yes-no").toBe(false);
    expect(game.chain().some((c) => c.cardId === "gd")).toBe(false);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("mech").might).toBe(8);
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.state("gd").isExhausted).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — the Watcher's minimum-1 clamp: a 3-Might P1 unit goes to 1 (not 0) and is back to 3 next turn; 1 → 3 is not Mighty either → no prompt", async () => {
    const game = await board({ phantom: false }).unit(P1, "base", { might: 3, name: "Squire" }, "squire").build();
    await watcherLands(game);
    expect(game.state("squire").might).toBe(1);
    await game.p2.endTurn();
    expect(game.decision()?.kind === "yes-no").toBe(false);
    await game.settle();
    expect(game.state("squire").might).toBe(3);
    expect(game.p1.runes()).toHaveLength(2);
  });
});
