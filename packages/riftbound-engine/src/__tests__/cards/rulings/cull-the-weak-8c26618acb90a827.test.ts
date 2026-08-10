/**
 * Ruling 8c26618acb90a827 — Cull the Weak (OGN-209 → ogn-209-298) · Spell · Order · 2 + [order]
 *     "Each player kills one of their units."   (scrape also lists Cull sfd-134-221 — name collision only)
 *
 * Q: Can you play Cull the Weak if you have no units?
 * A: Yes. It does not target, so nothing needs to be chosen to finalize it onto the chain; both players choose
 *    their unit on RESOLUTION. You need no valid unit of your own to play it.
 * Rules: 355.5 (targets chosen at play) vs 355.16 (resolution-time choices), 359.3.e.11 (do as much as you can).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CULL_THE_WEAK = "ogn-209-298";

function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Ranger" }, "ranger")
    .unit(P2, "base", { might: 2, name: "Squire" }, "squire")
    .hand(P1, CULL_THE_WEAK, "cull");
}

describe("Ruling 8c26618acb90a827 — Cull the Weak is playable with no units; choices happen on resolution", () => {
  test("with zero friendly units the cast is legal, asks for NO target, is paid for and finalized onto the chain", async () => {
    const game = await board().build();
    expect(game.p1.units()).toEqual([]);
    expect(game.p1.can("cast", "cull")).toBe(true);
    const targetsField = game.p1.option("cast", "cull")?.fields.find((f) => f.name === "targets");
    // Nothing must be chosen to play it: the only "target set" on offer is the empty one.
    expect((targetsField?.options ?? [[]]).every((o) => Array.isArray(o) && o.length === 0)).toBe(true);
    await game.p1.cast("cull");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" }); // straight to priority — no pick was asked
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cull", controller: P1, triggered: false })]);
    expect(game.chain()[0]?.targets ?? []).toEqual([]);
  });

  test("the unit choice is made ON RESOLUTION: only after both pass is P2 asked which of its units dies (P1, with none, is skipped)", async () => {
    const game = await board().build();
    await game.p1.cast("cull");
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // still just priority
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", seat: P2 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["ranger", "squire"]);
    await game.p2.pick("ranger");
    await game.settle();
    expect(game.zoneOf("ranger")).toBe("trash");
    expect(game.zoneOf("squire")).toBe("base");
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // Cull the Weak does not target, so even a caster WITH units names nothing at play time; the caster's own pick
  // (like the opponent's) is a resolution-time choice — a bare cast goes straight to priority and P1 is only
  // asked after both pass. rule 355.10.e
  test.failing("BUG: ruling 8c26618acb90a827 — the caster's own unit is chosen on resolution, not as a play-time target", async () => {
    const game = await board().unit(P1, "base", { might: 1, name: "Pawn" }, "pawn").build();
    await game.p1.cast("cull"); // no targets: nothing is chosen when finalizing
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
    expect(game.chain()[0]?.targets ?? []).toEqual([]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    // Now, on resolution, each player picks — P1 included.
    const seatsAsked = new Set<string>();
    for (let i = 0; i < 4 && game.decision()?.kind === "pick"; i++) {
      const d = game.decision() as Extract<ReturnType<typeof game.decision>, { kind: "pick" }>;
      seatsAsked.add(d.seat);
      await game.seat(d.seat).pick(d.options[0]?.key as string);
    }
    await game.settle();
    expect(seatsAsked.has(P1) || game.zoneOf("pawn") === "trash").toBe(true);
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.zoneOf("cull")).toBe("trash");
  });

  test("even with NO units anywhere it is still playable and simply resolves doing nothing", async () => {
    const game = await scenario().resources(P1, { energy: 2, power: { order: 1 } }).hand(P1, CULL_THE_WEAK, "cull").build();
    expect(game.p1.can("cast", "cull")).toBe(true);
    await game.p1.cast("cull");
    const stop = await game.settle();
    expect(stop.reason).toBe("open");
    expect(game.zoneOf("cull")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  });
});
