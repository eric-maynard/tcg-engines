/**
 * Bard, Mercurial — sfd-079-221 · Champion Unit (Bard) · Mind · 4 energy + 1 [mind] · 4 might
 *
 *   You may exhaust your legend as an additional cost to play me.
 *   When you play me, if you paid the additional cost, move any number of your units to an
 *   open battlefield.
 *
 * Head-judge notes (the tricky spots this file covers):
 *  1. The extra cost is OPTIONAL and NON-STANDARD (356.2.b, 356.7): exhausting your own legend. It
 *     can only be paid if the legend is ready (414.4) — an exhausted legend means the option is off,
 *     but the plain 4+[mind] play stays legal.
 *  2. The play trigger is gated on "if you paid": plain play → no movement at all, legend untouched.
 *  3. "open battlefield" = unoccupied AND uncontrolled (170.11.c): an empty battlefield you or the
 *     opponent controls is not a legal destination; neither is one holding any unit.
 *  4. "any number of your units" — 0 is fine, several at once is one effect-driven move (449); the
 *     moved units contest the open battlefield and conquer it when the dust settles.
 *  5. No open battlefield at all → the trigger resolves doing nothing (cost stays paid, 425.1.c).
 *  6. Parser status: the cost line came out as a stray "exhaust a unit" spell ability and the
 *     trigger's destination as "base" — so today no extra cost is offered and nothing ever moves.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness/game";
import { P1, P2, scenario } from "../../harness";

const CARD = "sfd-079-221";
const LEGEND = "sfd-189-221"; // Fire Below the Mountain (Ornn, calm/mind) — has its own [Exhaust] ability

function board(opts: { legendExhausted?: boolean; energy?: number; mind?: number } = {}) {
  return scenario()
    .resources(P1, { energy: opts.energy ?? 4, power: { mind: opts.mind ?? 1 } })
    .card("legend", { def: LEGEND, meta: opts.legendExhausted ? { exhausted: true } : undefined, owner: P1, zone: "legendZone" })
    .battlefield("open", { controller: null }) // unoccupied + uncontrolled → open
    .battlefield("theirs", { controller: P2 }) // empty but enemy-controlled → NOT open
    .battlefield("held", { controller: P1 }) // empty but ours → NOT open
    .unit(P1, "base", { might: 2, name: "Chime A" }, "a")
    .unit(P1, "base", { might: 2, name: "Chime B" }, "b")
    .unit(P2, "base", { might: 3, name: "Foe" }, "foe")
    .hand(P1, CARD, "bard");
}

/** Answer whatever the (future) trigger asks: which units → `units`, which battlefield → `dest`. */
async function answerTrigger(game: Game, units: string[], dest: string): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await game.settle();
    const d = game.decision();
    if (d?.kind !== "pick" || d.seat !== P1) return;
    const cards = d.options.map((o) => o.card).filter(Boolean) as string[];
    if (cards.some((c) => units.includes(c))) {
      await game.p1.pick(...units);
    } else {
      const key = d.options.find((o) => o.key === dest || o.key === `battlefield-${dest}` || o.zone === `battlefield-${dest}`)?.key;
      expect(key).toBeDefined();
      await game.p1.pick(key!);
    }
  }
}

describe("Bard, Mercurial (sfd-079-221)", () => {
  test.failing("BUG: parsed abilities should be [optional additional cost: exhaust your legend] + [play trigger, if paid: move any number of friendly units to an OPEN battlefield]", async () => {
    // Actual parse: [0] = { type: "spell", effect: exhaust a unit }, [1].effect.to = "base".
    const abilities = (await import("../../../../riftbound-cards/src/data/all-cards")).getAllCards().find((c) => c.id === CARD)?.abilities as unknown as { type: string; effect?: Record<string, unknown> }[];
    expect(abilities).toHaveLength(2);
    expect(abilities[0]).toMatchObject({ effect: { optional: true, type: "additional-cost-option" }, type: "static" });
    expect(abilities[1]).toMatchObject({
      condition: { type: "paid-additional-cost" },
      effect: { target: { controller: "friendly", quantity: "any", type: "unit" }, type: "move" },
      trigger: { event: "play-self" },
      type: "triggered",
    });
    expect(abilities[1]!.effect!.to).not.toBe("base");
  });

  test("cost: 4 energy + 1 [mind]; a 4-Might champion unit that enters exhausted; short on either resource → not playable", async () => {
    const game = await board().build();
    await game.p1.play("bard", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.zoneOf("bard")).toBe("base");
    expect(game.state("bard")).toMatchObject({ isExhausted: true, might: 4 });
    expect((await board({ energy: 3 }).build()).p1.can("play", "bard")).toBe(false);
    expect((await board({ mind: 0 }).build()).p1.can("play", "bard")).toBe(false);
    const wrongPower = await scenario().resources(P1, { energy: 4, power: { fury: 1 } }).hand(P1, CARD, "bard").build();
    expect(wrongPower.p1.can("play", "bard")).toBe(false);
  });

  test("plain play (additional cost declined): legend stays ready, no trigger does anything, no unit moves", async () => {
    const game = await board().build();
    await game.p1.play("bard", { to: "base" });
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("legend").isReady).toBe(true);
    expect(game.locationOf("a")).toBe("base");
    expect(game.locationOf("b")).toBe("base");
    expect(game.locationOf("bard")).toBe("base");
    expect(game.gameState.battlefields.open?.controller).toBeNull();
    // The legend's own [Exhaust] ability is still usable afterwards — nothing consumed it.
    expect(game.p1.can("activate", "legend")).toBe(true);
  });

  test("legend already exhausted (414.4): the extra cost cannot be offered, yet the plain play is still legal", async () => {
    const game = await board({ legendExhausted: true }).build();
    expect(game.state("legend").isExhausted).toBe(true);
    expect(game.p1.can("play", "bard")).toBe(true);
    const pay = game.p1.option("play", "bard")?.fields.find((f) => f.arg === "payOptional");
    expect(pay?.options ?? [false]).not.toContain(true);
    const t = await game.p1.try((p) => p.play("bard", { payOptional: true, to: "base" }));
    expect(t.ok).toBe(false);
    await game.p1.play("bard", { to: "base" });
    await game.settle();
    expect(game.zoneOf("bard")).toBe("base");
    expect(game.locationOf("a")).toBe("base");
  });

  test.failing("BUG: with a ready legend the optional cost is offered; paying it exhausts the legend on top of 4 energy + [mind] and puts the play trigger on the chain", async () => {
    // Expected: a payOptional variant; after playing with it the legend is exhausted, pool empty,
    // and Bard's triggered ability is the sole chain item. Actual: no such variant exists.
    const game = await board().build();
    const pay = game.p1.option("play", "bard")?.fields.find((f) => f.arg === "payOptional");
    expect(pay?.options).toContain(true);
    await game.p1.play("bard", { payOptional: true, to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.state("legend").isExhausted).toBe(true);
    expect(game.zoneOf("bard")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bard", controller: P1, triggered: true })]);
  });

  test.failing("BUG: paid → move both Chimes to the OPEN battlefield (not the empty enemy-held or own-held ones); they contest and conquer it", async () => {
    // Expected: only `open` is a legal destination (170.11.c); a and b end up there, P1 conquers it
    // (+1 point). Actual: the additional cost / trigger are not implemented, nothing moves.
    const game = await board().build();
    await game.p1.play("bard", { payOptional: true, to: "base" });
    await answerTrigger(game, ["a", "b"], "open");
    await game.settle();
    expect(game.locationOf("a")).toBe("open");
    expect(game.locationOf("b")).toBe("open");
    expect(game.locationOf("foe")).toBe("base"); // "your units" only
    expect(game.p1.units("theirs")).toEqual([]);
    expect(game.p1.units("held")).toEqual([]);
    expect(game.gameState.battlefields.open?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("legend").isExhausted).toBe(true);
  });

  test.failing("BUG: 'any number' includes just one — moving only Chime A leaves Chime B and Bard in base", async () => {
    const game = await board().build();
    await game.p1.play("bard", { payOptional: true, to: "base" });
    await answerTrigger(game, ["a"], "open");
    await game.settle();
    expect(game.locationOf("a")).toBe("open");
    expect(game.locationOf("b")).toBe("base");
    expect(game.locationOf("bard")).toBe("base");
    expect(game.state("legend").isExhausted).toBe(true);
  });

  test.failing("BUG: paid but NO open battlefield exists (every battlefield is controlled or occupied) → the trigger resolves doing nothing; the legend stays exhausted (425.1.c)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { mind: 1 } })
      .legend(P1, LEGEND, "legend")
      .battlefield("theirs", { controller: P2 })
      .battlefield("busy", { controller: null })
      .unit(P2, "busy", { might: 1, name: "Squatter" }, "squatter") // occupied → not open
      .unit(P1, "base", { might: 2, name: "Chime A" }, "a")
      .hand(P1, CARD, "bard")
      .build();
    await game.p1.play("bard", { payOptional: true, to: "base" });
    expect(game.state("legend").isExhausted).toBe(true);
    await game.settle({ policy: "first" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.locationOf("a")).toBe("base");
    expect(game.locationOf("bard")).toBe("base");
    expect(game.state("legend").isExhausted).toBe(true);
  });

  test("timing: a unit — not playable on the opponent's turn even with resources and a ready legend", async () => {
    const game = await board().active(P2).build();
    expect(game.p1.can("play", "bard")).toBe(false);
  });
});
