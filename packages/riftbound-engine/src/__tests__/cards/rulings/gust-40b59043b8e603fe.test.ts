/**
 * Ruling 40b59043b8e603fe — Gust (OGN-169 → ogn-169-298) · Spell · Chaos · 1 · [Reaction]
 *   "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   × Dark Child (Annie legend, ogs-017-024) — "At the end of your turn, ready up to 2 runes."
 *   × Targon's Peak (OGN-289 → ogn-289-298) · Battlefield — "When you conquer here, ready up to 2 runes at the end of this turn."
 *
 * Q: After Annie readies runes at end of turn, can I get priority to Gust an enemy unit off a battlefield before the
 *    opponent scores it (hold) at the start of their turn?
 * A: Not normally — once Annie's trigger resolves the chain is empty and the turn simply ends; there is no window to use
 *    the fresh runes. But with ANOTHER end-of-turn trigger (e.g. Targon's Peak) you get priority between the two
 *    resolutions and can tap the readied runes for Gust then.
 * Rules: 517.2 (Ending step: end-of-turn triggers), 340.2/340.4 (priority only while the chain is non-empty), 383.3.d
 *        (controller orders simultaneous triggers), 444.2.c / 429 (rune [Add] abilities usable at Reaction speed), 442 (hold scoring).
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const DARK_CHILD = "ogs-017-024";
const TARGONS_PEAK = "ogn-289-298";

type OrderD = Extract<Decision, { kind: "order" }>;

/**
 * P1's turn, all spent: 0 energy, both fury runes EXHAUSTED. Legend Dark Child. P2 holds bf1 with Small (2) — a hold point
 * for P2 next Beginning Phase unless it is Gusted. P1 holds Gust (cost 1).
 */
function base() {
  return scenario()
    .legend(P1, DARK_CHILD, "annie")
    .rune(P1, "fury", { alias: "r1", exhausted: true })
    .rune(P1, "fury", { alias: "r2", exhausted: true })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Small" }, "small")
    .hand(P1, GUST, "gust");
}

describe("Ruling 40b59043b8e603fe — no priority after Annie's end-of-turn ready… unless a second end-of-turn trigger provides one", () => {
  test("Annie alone: while her trigger is on the chain P1 has priority but nothing to pay Gust with; once it resolves (2 runes readied) the turn passes with NO further P1 action window, and P2 scores the hold on bf1", async () => {
    const game = await base().build();
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.runes({ ready: true })).toEqual([]);
    await game.p1.endTurn();
    expect(game.phase()).toBe("ending");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "annie", controller: P1, triggered: true })]);
    // rule 402.2 — "ready up to 2 runes" names them while the trigger is finalized; they are still
    // EXHAUSTED until it resolves, so this hands nothing to Gust yet.
    const fin = game.decision();
    if (fin?.kind === "pick" && fin.seat === P1) {
      await game.p1.pick(...fin.options.map((o) => o.key));
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "gust")).toBe(false); // runes still exhausted, 0 energy
    expect(game.p1.can("tapRune")).toBe(false);
    // Step through: record any P1 action decision that occurs AFTER runes became ready and BEFORE P2's turn.
    let windowAfterReady = false;
    for (let i = 0; i < 16; i++) {
      const d = game.decision();
      if (!d || game.turnPlayer() === P2) {
        break;
      }
      if (d.kind === "action" && d.seat === P1 && game.p1.runes({ ready: true }).length > 0) {
        windowAfterReady = true;
      }
      if (d.kind === "action") {
        await game.seat(d.seat).passPriority();
      } else if (d.kind === "pick" && d.seat === P1) {
        await game.p1.pick(...d.options.slice(0, d.max).map((o) => o.key)); // ready r1 + r2
      } else {
        break;
      }
    }
    await game.settle();
    expect(windowAfterReady).toBe(false);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.p1.runes({ ready: true }).sort()).toEqual(["r1", "r2"]); // Annie did ready them…
    expect(game.zoneOf("gust")).toBe("hand"); // …but Gust was never castable in time
    expect(game.zoneOf("small")).toBe("battlefield-bf1");
    expect(game.p2.points()).toBe(1); // P2 scored the hold at the start of its turn
    expect(game.violations()).toEqual([]);
  });

  test("Annie + Targon's Peak (conquered this turn): two end-of-turn triggers — P1 orders Annie to resolve first, then HOLDS PRIORITY on the pending Peak trigger, taps a freshly readied rune and Gusts Small to hand; P2 then scores nothing", async () => {
    const game = await base()
      .battlefield("peak", { controller: null, def: TARGONS_PEAK, inert: false })
      .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
      .build();
    // Conquer the Peak this turn to arm its delayed end-of-turn trigger.
    await game.p1.move("runner", "peak");
    await game.settle();
    expect(game.gameState.battlefields.peak?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.runes({ ready: true })).toEqual([]);

    await game.p1.endTurn();
    // Both triggers are P1's and simultaneous → P1 is offered to order them (383.3.d).
    let ordered = false;
    for (let i = 0; i < 6 && !ordered; i++) {
      const d = game.decision();
      if (d?.kind === "order" && d.seat === P1) {
        const items = (d as OrderD).items;
        expect(items.map((it) => it.card).sort()).toEqual(["annie", "peak"]);
        const key = (card: string) => items.find((it) => it.card === card)?.key as string;
        await game.p1.order([key("peak"), key("annie")]); // last = top → Annie resolves first
        ordered = true;
      } else if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick(...d.options.slice(0, d.max).map((o) => o.key)); // a trigger asking its rune targets up front
      } else {
        break;
      }
    }
    expect(ordered).toBe(true);
    expect(game.chain().map((c) => c.cardId)).toEqual(["peak", "annie"]);

    // Resolve Annie (top): both pass; answer her "up to 2 runes" if asked now.
    await game.p1.passPriority();
    await game.p2.passPriority();
    for (let i = 0; i < 2; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1 && d.source?.cardId === "annie") {
        await game.p1.pick(...d.options.slice(0, d.max).map((o) => o.key));
      }
    }
    expect(game.p1.runes({ ready: true }).length).toBe(2); // Annie's runes are READY now
    expect(game.chain().map((c) => c.cardId)).toEqual(["peak"]); // …and the Peak trigger still holds the chain open
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // ← the priority window
    expect(game.turnPlayer()).toBe(P1);

    // Use it: tap a readied rune (Reaction-speed Add), then Gust the 2-Might Small.
    expect(game.p1.can("tapRune")).toBe(true);
    await game.p1.tapRune("r1");
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.can("cast", "gust")).toBe(true);
    await game.p1.cast("gust", { targets: "small" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["peak", "gust"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Gust resolves
    expect(game.zoneOf("gust")).toBe("trash");
    expect(game.zoneOf("small")).toBe("hand");

    // Let the Peak trigger resolve and the turn roll over to P2.
    game.script(P1, [(d) => (d.kind === "pick" ? d.options.slice(0, d.max).map((o) => o.key) : undefined)]);
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(null); // P2's last unit there is gone
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.p2.points()).toBe(0); // nothing to hold
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
