/**
 * Ruling c7bf35a9c8b2ed16 — Sacrifice (UNL-173 → unl-173-219) · Spell · Order · 1 · [Reaction]
 *     "As an additional cost to play this, kill a friendly [Mighty] unit. Draw 2 and channel 1 rune exhausted."
 *   × Altar of Memories (SFD-169 → sfd-169-221) · Gear · Order · 2
 *     "When a friendly unit dies, you may exhaust me to draw 1, then put a card from your hand on the top or
 *      bottom of your Main Deck."
 *
 * Q: I Sacrifice my Mighty unit with a ready Altar of Memories in play. What is the order — do I draw for
 *    Sacrifice before handling the Altar trigger?
 * A: Yes. Killing the unit (Sacrifice's cost) meets the Altar's condition, but the trigger is only a PENDING
 *    item; Sacrifice resolves fully first (draw 2, channel 1 rune), and only then does the Altar trigger
 *    finalize onto the chain, where you may exhaust the Altar to draw 1 and put a card back.
 * Rules: 356 (additional cost paid on finalize), 340.3 (pending items finalize), 383.3.
 *
 * RULING-CONFLICT (order facet only): riftjudge c7bf35a9c8b2ed16 says the Altar trigger stays Pending until
 * Sacrifice has fully resolved; CR 337.1.b/337.3/340.1 say the opposite — Sacrifice is appended to the chain
 * first and its additional cost is paid during ITS finalization, so the Altar trigger is appended AFTER it,
 * finalizes above it (337.3), and — being the newest Finalized item — resolves FIRST. Engine follows CR.
 * The end state (last test) is the same either way and matches the ruling.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SACRIFICE = "unl-173-219";
const ALTAR = "sfd-169-221";
const FILLER = "ogn-175-298";

/** P1's turn with exactly 1 energy, a READY Altar, a 5-Might (Mighty) Brute in base, one other card in hand, known deck. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .gear(P1, ALTAR, "altar")
    .unit(P1, "base", { might: 5, name: "Brute" }, "brute")
    .deck(P1, [FILLER, FILLER, FILLER, FILLER], ["d1", "d2", "d3", "d4"])
    .hand(P1, FILLER, "keep")
    .hand(P1, SACRIFICE, "sac");
}

const chainIds = (game: Game) => game.chain().map((c) => c.cardId);

describe("Ruling c7bf35a9c8b2ed16 — Sacrifice draws before the Altar of Memories trigger reaches the chain", () => {
  test("paying Sacrifice's additional cost kills the Mighty Brute immediately (before anything resolves)", async () => {
    const game = await board().build();
    expect(game.p1.option("cast", "sac")?.fields.find((f) => f.arg === "sacrifice")?.options).toEqual(["brute"]);
    await game.p1.cast("sac", { sacrifice: "brute" });
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("brute")).toBe("trash");
    expect(chainIds(game)).toContain("sac");
    expect(game.p1.hand()).toEqual(["keep"]); // nothing drawn yet
  });

  // RULING-CONFLICT: riftjudge c7bf35a9c8b2ed16 wants the chain to be just [Sacrifice] here, with the Altar
  // trigger held Pending until Sacrifice has resolved. CR 337.1.b/337.3 finalize the Altar trigger as soon as
  // Sacrifice's own finalization (which paid the kill) ends, i.e. ABOVE Sacrifice — so the opt-in is asked
  // straight away and the Altar resolves first (340.1, newest Finalized item). Engine follows CR.
  // rule 337.3: after finalizing an item, remaining Pending items finalize before anyone gains Priority.
  test("ruling c7bf35a9c8b2ed16 (RULING-CONFLICT → CR 337/340) — the Altar trigger finalizes above Sacrifice and resolves before it", async () => {
    const game = await board().build();
    await game.p1.cast("sac", { sacrifice: "brute" });
    // Altar finalized above Sacrifice; its "you may exhaust me" opt-in is asked during finalization (383.3.a).
    expect(chainIds(game)).toEqual(["sac", "altar"]);
    const optIn = game.decision() as Decision;
    expect(optIn).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
    await game.p1.yes();
    expect(game.p1.hand()).toEqual(["keep"]); // still nothing drawn — finalizing does not resolve
    // Both pass → the Altar (newest) resolves first: exhaust, draw 1, put a card back.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("altar").isExhausted).toBe(true);
    const reveal = game.decision() as Decision;
    expect(reveal).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("keep");
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("mainDeck-top");
    }
    // Sacrifice is still on the chain, undrawn; it resolves only after the Altar is done.
    expect(chainIds(game)).toEqual(["sac"]);
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.runes()).toHaveLength(0);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("sac")).toBe("trash");
    expect(new Set(game.p1.hand())).toEqual(new Set(["d1", "keep", "d2"])); // "keep" went back on top and was redrawn
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.chain()).toEqual([]);
  });

  test("whatever the order, the end state after opting in: Brute and Sacrifice in trash, Altar exhausted, 3 cards drawn in total and 1 put back (hand 1 → 3), 1 rune channeled", async () => {
    const game = await board().build();
    await game.p1.cast("sac", { sacrifice: "brute" });
    for (let i = 0; i < 16; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "yes-no") {
        expect(d.seat).toBe(P1);
        await game.p1.yes();
      } else if (d.kind === "action") {
        await game.seat(d.seat).pass();
      } else if (d.kind === "order") {
        await game.acceptTriggerOrder();
      } else if (d.kind === "pick") {
        expect(d.seat).toBe(P1);
        const keys = d.options.map((o) => o.key);
        await game.p1.pick(keys.includes("keep") ? "keep" : keys.includes("mainDeck-bottom") ? "mainDeck-bottom" : (keys[0] as string));
      }
    }
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.zoneOf("sac")).toBe("trash");
    expect(game.state("altar").isExhausted).toBe(true);
    expect(game.p1.hand()).toHaveLength(3);
    expect(game.p1.hand()).not.toContain("keep");
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.seat(P2).hand()).toBeDefined();
    expect(game.violations()).toEqual([]);
  });
});
