/**
 * Interaction: Jhin, Murderous Artist (unl-022-219) — "[Deflect] [Ganking]
 *   When I move, [Add] [1][rainbow]. (Abilities that add resources can't be reacted to.)"
 *   × Treasure Hunter (sfd-130-221) — "When I move, play a Gold gear token exhausted."
 *   × Discipline (ogn-058-298) — "[Reaction] Give a unit +2 [Might] this turn. Draw 1."
 *
 * Both units are group-Standard-Moved from P1's base onto a battlefield P1
 * ALREADY controls (no contest, no showdown), so two "When I move" triggers
 * become pending simultaneously under ONE controller.
 *
 * Q: (a) who orders them and does the order matter once P1 actually has the
 * [1][rainbow]?  (b) is there any priority window before the Add resolves?
 * (c) may P1 spend the Jhin resources on a [Reaction] while the Hunter trigger
 * is still unresolved?  (d) where does the gear the trigger PLAYS go, and does
 * P2 get a window on it?  (e) Jhin moving ALONE — is there ever a chain?
 *
 * Rules: 337.1.a (finalizing passes no Priority), 337.1.b (finalize oldest
 * first), 337.2 (a unit/gear/[Add] ability resolves the instant it is
 * finalized), 337.4 (Priority to the controller of the next chain item),
 * 340.3 / 340.4, 354.2 (a play made mid-resolution becomes a Pending Item),
 * 383.3.d (same controller orders their simultaneous triggers), 400.2 / 429.2 /
 * 429.2.a ([Add] abilities resolve as soon as finalized, before any other
 * outstanding item is finalized, and never pass Priority or Focus), 309.1 /
 * 309.1.a (a chain ⇒ Closed State ⇒ [Reaction]s only), 309.2 / 335 (no chain ⇒
 * Open State, turn player keeps Priority), 414.1.b (an already-Exhausted object
 * cannot be Exhausted again), 144.3 (tokens).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const JHIN = "unl-022-219";
const HUNTER = "sfd-130-221";
const DISCIPLINE = "ogn-058-298";

/**
 * P1 already controls bf1 (an anchor unit holds it, rule 323.6), so the move is
 * uncontested: no showdown, only the two "When I move" triggers.
 * P1's pool is deliberately ONE energy short of Discipline (cost [2]) so the
 * Jhin [Add] is what makes the Reaction payable.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 5 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 1 }, "anchor")
    .unit(P1, "base", JHIN, "jhin")
    .unit(P1, "base", HUNTER, "hunter")
    .hand(P1, DISCIPLINE, "disc")
    .hand(P2, DISCIPLINE, "disc2");
}

describe("Jhin's [Add] resolves before the Treasure Hunter trigger", () => {
  test("(a) both triggers are pending under one controller, yet the Add is already gone from the chain when P1 first sees it — only the Hunter trigger is left", async () => {
    const game = await board().build();
    await game.p1.move(["jhin", "hunter"], "bf1");
    // 383.3.d gives P1 the ordering, but 337.1.b + 429.2.a make it immaterial:
    // whichever slot Jhin's trigger takes, its [Add] resolves at finalization
    // and jumps ahead of the still-unfinalized/unresolved Hunter item.
    const chain = game.chain();
    expect(chain).toHaveLength(1);
    expect(chain[0]).toMatchObject({ cardId: "hunter", controller: P1, triggered: true });
    expect(chain.some((i) => i.cardId === "jhin")).toBe(false);
  });

  test("(a) the resources exist BEFORE anybody receives priority — pool is +1 energy and +1 rainbow", async () => {
    const game = await board().build();
    expect(game.p1.resources()).toEqual({ energy: 1, power: {} });
    await game.p1.move(["jhin", "hunter"], "bf1");
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.power("rainbow")).toBe(1);
  });

  test("(a) 383.3.d ordering is a SOFT offer — settling never stalls on it", async () => {
    const game = await board().build();
    await game.p1.move(["jhin", "hunter"], "bf1");
    // DESIGN (FIXER-PRIMER §Known DESIGN deviations, 383.3.d): the same-controller
    // trigger order is a soft/stack prompt; the harness must not have to answer it.
    expect(game.decision()?.kind).toBe("action");
  });

  test("(b) P2 never gets a window on the Add — the first seat with priority is P1, controller of the only remaining item (337.4)", async () => {
    const game = await board().build();
    await game.p1.move(["jhin", "hunter"], "bf1");
    expect(game.actingSeat()).toBe(P1);
    // and by the time P2 does get one, the energy is already in the pool.
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.chain().map((i) => i.cardId)).toEqual(["hunter"]);
  });

  test("(c) the state is Closed, so P1 may answer with Discipline — payable only because the Add already resolved", async () => {
    const game = await board().build();
    // Before the move the pool is [1]: Discipline ([2]) is unaffordable.
    expect(game.p1.can("cast", "disc")).toBe(false);
    await game.p1.move(["jhin", "hunter"], "bf1");
    expect(game.p1.can("cast", "disc")).toBe(true);

    await game.p1.cast("disc", { targets: "jhin" });
    // 309.1 / 309.1.a: Discipline is a [Reaction], and it stacked ON TOP of the
    // still-unresolved Hunter trigger.
    expect(game.chain().map((i) => i.cardId)).toEqual(["hunter", "disc"]);
    expect(game.p1.energy()).toBe(0);

    await game.settle();
    expect(game.state("jhin").might).toBe(6); // printed 4 + 2 this turn
    expect(game.zoneOf("disc")).toBe("trash");
  });

  test("(d) the Hunter trigger PLAYS a Gold gear token during its own resolution: it resolves on finalization with no window, enters EXHAUSTED, and cannot pay its own [Exhaust] cost (414.1.b)", async () => {
    const game = await board().build();
    await game.p1.move(["jhin", "hunter"], "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority(); // Hunter's trigger resolves → plays the token

    // 354.2/337.2: the play becomes a Pending Item and, being a Gear, resolves
    // as soon as it is finalized — the chain is empty again with nobody offered
    // a response to the token.
    expect(game.chain()).toEqual([]);
    expect(game.actingSeat()).toBe(P1);

    const gear = game.p1.gear();
    expect(gear).toHaveLength(1);
    const token = gear[0] as string;
    const st = game.state(token);
    expect(st.name).toBe("Gold");
    expect(st.isToken).toBe(true);
    expect(st.controller).toBe(P1);
    expect(st.isExhausted).toBe(true); // "…exhausted" overrides the gear default
    // Its only ability costs [Exhaust]; an exhausted object cannot be exhausted again.
    expect(game.p1.can("activate", token)).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("(e) Jhin moving ALONE: the [Add] resolves with no other item, so no Chain ever exists — the turn stays Open and P1 keeps priority", async () => {
    const game = await board().build();
    await game.p1.move("jhin", "bf1");
    expect(game.chain()).toEqual([]);
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.power("rainbow")).toBe(1);
    // 309.2 / 335: Open State, turn player still acting in their main phase.
    const d = game.decision();
    expect(d?.kind).toBe("action");
    expect(d?.seat).toBe(P1);
    expect((d as { context?: string }).context).toBe("main");
    expect(game.p1.gear()).toEqual([]); // no Hunter, no token
  });
});
