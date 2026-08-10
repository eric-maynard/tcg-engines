/**
 * Interaction: Baited Hook (ogn-242-298, Gear) "[1][order], [Exhaust]: Kill a friendly unit. Look at
 *   the top 5 cards of your Main Deck. You may banish a unit from among them that has Might up to 1
 *   more than the killed unit and play it, ignoring its cost. Then recycle the rest."
 *   × Vicious Snapjaws (unl-129-219, 5) "When another friendly unit dies, gain 1 XP."
 *   × Scorchclaw (unl-016-219, printed 3) "[Hunt 2] [Level 3][>] I have +1 [Might] and enter ready."
 *   (bait: Daring Poro ogn-210-298 — 2 Might at rest, [Assault] is attacker-only)
 *
 * Question: P1 sits at exactly 2 XP with Snapjaws + Poro in base and Scorchclaw among the top 5.
 * Hook kills the Poro (Snapjaws triggers) and banishes-and-plays Scorchclaw. In what order are the
 * Snapjaws trigger and the Scorchclaw play finalized / resolved, how much XP does P1 have at the
 * instant Scorchclaw ENTERS (ready or exhausted? what Might?), and does the trigger resolving
 * afterwards (2→3 XP) retroactively ready it? YES side: P1 already at 3 XP. NO side: no Snapjaws.
 *
 * Rules: 354.3 (Hook finishes resolving top-down before anything new is processed) → the kill
 * appends Snapjaws' trigger as a Pending item, the look/banish/"play it" appends Scorchclaw as a
 * Pending play; 337.1.b (Pending items finalize oldest-first) → Snapjaws' trigger finalizes and
 * WAITS, 337.3 loops, Scorchclaw finalizes and — being a unit — resolves IMMEDIATELY (337.2);
 * 340.4 then hands priority for the still-waiting trigger. 824.1.b.1/824.1.c/824.1.d + 727.1.b/
 * 727.1.c.2: the Level-3 text is Inactive at 2 XP and turns Active the moment XP hits 3; 143.4:
 * units enter exhausted unless told otherwise — "enter ready" only modifies the act of entering
 * (Scorchclaw ruling: nothing readies it retroactively). 365.1/366.1/366.2: "+1 Might" is a board
 * passive, so in the deck Scorchclaw is 3 in every variant and always fits "up to 2+1" (359.3.d).
 * 383.3: the trigger and the play are independent chain items.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BAITED_HOOK = "ogn-242-298";
const SNAPJAWS = "unl-129-219";
const SCORCHCLAW = "unl-016-219";
const DARING_PORO = "ogn-210-298";
const SKULKER = "ogn-175-298"; // Shipyard Skulker — vanilla 3-Might unit (deck padding, itself eligible)
const FOUR = { cardType: "unit", energyCost: 4, might: 4, name: "Too Big" }; // 4 > 2+1 → never eligible

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

function board(xp: number, withSnapjaws = true) {
  const s = scenario()
    .resources(P1, { energy: 1, power: { order: 1 } }) // exactly Hook's [1][order]
    .xp(P1, xp)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 1, name: "Flag Bearer" }, "flag") // durable control → bf1 is a legal destination
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, "base", DARING_PORO, "poro");
  if (withSnapjaws) {
    s.unit(P1, "base", SNAPJAWS, "snapjaws");
  }
  // Top 5 = d1, claw, four, d4, d5; "sixth" must never be looked at.
  return s.deck(P1, [SKULKER, SCORCHCLAW, FOUR, SKULKER, SKULKER, SKULKER], ["d1", "claw", "four", "d4", "d5", "sixth"]);
}

/** Activate Hook on the Poro and let it resolve (P1 then P2 pass) up to the look-at-5 pick. */
async function resolveHook(game: Game): Promise<void> {
  await game.p1.activate("hook", 0, { targets: "poro" });
  await game.p1.passPriority();
  await game.p2.passPriority();
}

function pickOffered(game: Game): (string | undefined)[] {
  const d = game.decision();
  return d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
}

describe("Baited Hook × Vicious Snapjaws × Scorchclaw — XP arrives after Scorchclaw has already entered", () => {
  // ---- (c) eligibility in the deck -------------------------------------------------------------

  test("(c) premise: the Poro is 2 Might at rest (Assault is attacker-only) and Scorchclaw reads 3 in the deck at 2 XP AND at 3 XP (365.1/366.1 — '+1 Might' is a board passive)", async () => {
    const at2 = await board(2).build();
    expect(at2.state("poro").might).toBe(2);
    expect(at2.zoneOf("claw")).toBe("mainDeck");
    expect(at2.state("claw").might).toBe(3);
    const at3 = await board(3).build();
    expect(at3.state("claw").might).toBe(3);
    expect(at3.state("claw").staticMightBonus).toBe(0);
  });

  test("(c) the look-at-5 offers Scorchclaw ('Might up to 3' off a 2-Might kill) in BOTH XP variants; the 4-Might unit and the 6th card are never offered; the pick is optional", async () => {
    for (const xp of [2, 3]) {
      const game = await board(xp).build();
      await resolveHook(game);
      const d = game.decision();
      expect(d).toMatchObject({ kind: "pick", seat: P1, allowDecline: true });
      const offered = pickOffered(game);
      expect(offered).toEqual(expect.arrayContaining(["claw", "d1", "d4", "d5"]));
      expect(offered).not.toContain("four");
      expect(offered).not.toContain("sixth");
    }
  });

  // ---- (a) ordering at 2 XP --------------------------------------------------------------------

  test("(a) Hook resolves top-down (354.3): by the time the look-at-5 is asked the Poro is already dead and Snapjaws' trigger is a chain item — but XP is still 2 (it has not resolved)", async () => {
    const game = await board(2).build();
    await resolveHook(game);
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "snapjaws", controller: P1, triggered: true })]);
    expect(game.p1.xp()).toBe(2);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  });

  test("(a) picking Scorchclaw banishes it and appends its play ABOVE the older Snapjaws trigger (337.1.b); P1 is asked where it enters — base or a battlefield P1 controls", async () => {
    const game = await board(2).build();
    await resolveHook(game);
    await game.p1.pick("claw");
    expect(game.zoneOf("claw")).toBe("banishment"); // banished, play pending
    expect(game.chain().map((c) => c.cardId)).toEqual(["snapjaws", "claw"]);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    const dests = d?.kind === "pick" ? d.options.map((o) => o.zone ?? o.key) : [];
    expect(dests).toEqual(expect.arrayContaining(["base", "battlefield-bf1"]));
    expect(game.p1.xp()).toBe(2);
  });

  test("(a) Scorchclaw, once finalized, resolves IMMEDIATELY (337.2) while the Snapjaws trigger still waits: it ENTERS at 2 XP → Level 3 Inactive → EXHAUSTED at 3 Might (143.4); then 340.4 gives priority for the trigger", async () => {
    const game = await board(2).build();
    await resolveHook(game);
    await game.p1.pick("claw");
    await game.p1.pick("base");
    expect(game.zoneOf("claw")).toBe("base");
    expect(game.p1.xp()).toBe(2);
    expect(game.state("claw").isExhausted).toBe(true);
    expect(game.state("claw").might).toBe(3);
    // The trigger is the only thing left on the chain and someone now holds priority for it.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "snapjaws", triggered: true })]);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "action", context: "chain" });
    // No energy was spent on the 3-cost Scorchclaw ("ignoring its cost"): Hook took the only [1].
    expect(game.p1.energy()).toBe(0);
  });

  // ---- (b) after the trigger resolves ----------------------------------------------------------

  test("(b) the Snapjaws trigger then resolves: 2→3 XP turns the Level line Active at once (824.1.c) → Scorchclaw is 4 Might — but it stays EXHAUSTED ('enter ready' is not retroactive)", async () => {
    const game = await board(2).build();
    await resolveHook(game);
    await game.p1.pick("claw");
    await game.p1.pick("base");
    await game.settle();
    expect(game.chain()).toHaveLength(0);
    expect(game.p1.xp()).toBe(3);
    expect(game.state("claw").might).toBe(4);
    expect(game.state("claw").isExhausted).toBe(true);
  });

  // ---- (d) YES side: 3 XP from the start -------------------------------------------------------

  test("(d) YES side — P1 already at 3 XP: same ordering, but at the instant of entry the Level line is Active → Scorchclaw enters READY at 4 Might while the trigger still waits; Snapjaws then → 4 XP", async () => {
    const game = await board(3).build();
    await resolveHook(game);
    expect(game.chain().map((c) => c.cardId)).toEqual(["snapjaws"]);
    await game.p1.pick("claw");
    expect(game.chain().map((c) => c.cardId)).toEqual(["snapjaws", "claw"]);
    await game.p1.pick("base");
    expect(game.zoneOf("claw")).toBe("base");
    expect(game.p1.xp()).toBe(3); // trigger not yet resolved
    expect(game.state("claw").isReady).toBe(true);
    expect(game.state("claw").might).toBe(4);
    expect(game.chain().map((c) => c.cardId)).toEqual(["snapjaws"]);
    await game.settle();
    expect(game.p1.xp()).toBe(4);
    expect(game.state("claw").isReady).toBe(true);
    expect(game.state("claw").might).toBe(4);
  });

  // ---- (e) NO side: no Snapjaws --------------------------------------------------------------

  test("(e) NO side — no Snapjaws on board at 2 XP: no trigger at all; Scorchclaw is the only chain item, enters exhausted at 3 and stays 3 (2 XP)", async () => {
    const game = await board(2, false).build();
    await resolveHook(game);
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.chain()).toHaveLength(0); // Hook left the chain; nothing triggered
    await game.p1.pick("claw");
    expect(game.chain().map((c) => c.cardId)).toEqual(["claw"]);
    await game.p1.pick("base");
    expect(game.chain()).toHaveLength(0);
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P1 });
    expect(game.state("claw").isExhausted).toBe(true);
    expect(game.state("claw").might).toBe(3);
    await game.settle();
    expect(game.p1.xp()).toBe(2);
    expect(game.state("claw").might).toBe(3);
    expect(game.state("claw").isExhausted).toBe(true);
  });

  // ---- shared end state -------------------------------------------------------------------------

  test("in every variant: Poro in trash, Hook exhausted and paid for, Scorchclaw on the board (not in banishment), the other 4 looked-at cards recycled to the bottom, the 6th card now on top, no invariant violations", async () => {
    for (const [xp, snap] of [
      [2, true],
      [3, true],
      [2, false],
    ] as const) {
      const game = await board(xp, snap).build();
      await resolveHook(game);
      await game.p1.pick("claw");
      await game.p1.pick("base");
      await game.settle();
      expect(game.zoneOf("poro")).toBe("trash");
      expect(game.state("hook").isExhausted).toBe(true);
      expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
      expect(game.zoneOf("claw")).toBe("base");
      expect(game.p1.banishment()).not.toContain("claw");
      const deck = game.p1.deck();
      expect(deck[0]).toBe("sixth");
      expect(deck.slice(-4)).toEqual(expect.arrayContaining(["d1", "four", "d4", "d5"]));
      expect(deck).not.toContain("claw");
      expect(game.locationOf("flag")).toBe("bf1");
      expect(game.violations()).toEqual([]);
    }
  });

  test("P2 may respond to the waiting Snapjaws trigger before it resolves (340.4 → priority passes around): after P1 passes, P2 holds priority with Scorchclaw already on the board at 3", async () => {
    const game = await board(2).build();
    await resolveHook(game);
    await game.p1.pick("claw");
    await game.p1.pick("base");
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("passPriority")).toBe(true);
    expect(game.chain().map((c) => c.cardId)).toEqual(["snapjaws"]);
    expect(game.state("claw").might).toBe(3);
    expect(game.p1.xp()).toBe(2);
    await game.p2.passPriority();
    expect(game.p1.xp()).toBe(3);
    expect(game.state("claw").might).toBe(4);
    expect(game.state("claw").isExhausted).toBe(true);
  });
});
