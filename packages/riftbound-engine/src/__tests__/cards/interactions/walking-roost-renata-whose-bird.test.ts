/**
 * Interaction: Walking Roost (unl-130-219) · Unit · Chaos · 5 · 6 Might
 *     "[Deflect] … When you play me, choose an opponent. They play a 1 [Might] Bird unit token with [Deflect]."
 *   × Renata Glasc, Industrialist (sfd-171-221) · Champion Unit · Order · "Your tokens enter ready."
 *   × Retreat (ogn-104-298) · Spell · Mind · 1 · Reaction
 *     "Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted."
 *   (+ Discipline ogn-058-298 "Give a unit +2 [Might] this turn. Draw 1." as a neutral 'choose a unit' probe)
 *
 * Question: P1 controls Renata and plays Walking Roost choosing P2 (the only opponent); P2 controls bf2.
 *   (a) Who CONTROLS and who OWNS the Bird? Who picks where it is played? READY (P1 has Renata) or EXHAUSTED?
 *   (b) Mirror: P2 has Renata, P1 (no Renata) plays Roost — ready or exhausted?
 *   (c) Deflect direction: who pays [rainbow] to choose the Bird — P1 or P2? Is it friendly to Walking Roost?
 *   (d) P2 casts Retreat on the Bird: legal? whose hand, does it survive, WHO channels? Could P1 Retreat it?
 *
 * Rules: 182 (token controller = effect's controller UNLESS the effect names a different player), 183 / 439.4 /
 * 127.1 (owner = the player who created/played it), 185.2.a (tokens are played by their owner following the normal
 * play steps → that player chooses base / a battlefield they control), 185.2.d (token units enter exhausted by
 * default), 184.1 (only the creating effect or a modifier of THAT player's changes it), 809.1.c (Deflect taxes
 * spells/abilities an OPPONENT of the Bird's controller controls), 740.1.a/b (friendly = same controller; enemy =
 * opposing controllers), 186.1 (a token put into a non-board zone ceases to exist), 056.2 (goes to its OWNER's zone).
 *
 * Expected: (a) controller P2, owner P2; P2 chooses P2's base or bf2 (never a P1 location); with only P1's Renata it
 * enters EXHAUSTED. (b) with P2's Renata it enters READY. (c) P1 pays the Deflect surcharge, P2 does not; the Bird is
 * an ENEMY of the Roost. (d) legal for P2: Bird → P2's hand → ceases to exist (P2's hand unchanged), P2 channels 1
 * exhausted rune, P1 channels nothing; P1's Retreat never offers the Bird.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WALKING_ROOST = "unl-130-219";
const RENATA = "sfd-171-221";
const RETREAT = "ogn-104-298";
const DISCIPLINE = "ogn-058-298";

/** P1's turn; bf1 is P1's, bf2 is P2's. `renata` says who (if anyone) has Renata on the board. */
function board(renata: "p1" | "p2" | "none" = "p1") {
  const s = scenario()
    .resources(P1, { energy: 7 }) // 5 Roost + 2 Discipline, deliberately NO power (Deflect probe)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 2, name: "P2 Holder" }, "holder")
    .hand(P1, WALKING_ROOST, "roost")
    .hand(P1, DISCIPLINE, "p1disc")
    .hand(P1, RETREAT, "p1retreat")
    .hand(P2, DISCIPLINE, "p2disc")
    .hand(P2, RETREAT, "p2retreat");
  if (renata === "p1") {
    s.unit(P1, "base", RENATA, "renata");
  } else if (renata === "p2") {
    s.unit(P2, "base", RENATA, "renata");
  }
  return s;
}

const birdsOf = (game: Game) => game.findAll({ name: "Bird" }).filter((id) => game.has(id) && game.locationOf(id) !== undefined);

/** P1 plays the Roost to base and lets the play trigger resolve (2-player: the only opponent is P2). Returns the Bird id. */
async function playRoost(game: Game): Promise<string> {
  await game.p1.play("roost", { to: "base" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "roost", controller: P1, triggered: true })]);
  await game.settle();
  // rule 185.2.a → 349: P2 performs the play, so P2 picks where the Bird lands.
  const d = game.decision();
  if (d?.kind === "pick" && d.seat === P2) {
    const keys = d.options.map((o) => o.zone ?? o.key);
    await game.p2.pick(keys.find((k) => String(k).includes("base")) as string);
    await game.settle();
  }
  const birds = birdsOf(game);
  expect(birds).toHaveLength(1);
  return birds[0] as string;
}

const targetsOf = (game: Game, seat: "p1" | "p2", spell: string) =>
  [...new Set((game[seat].option("cast", spell)?.fields.find((f) => f.arg === "targets")?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];

describe("Walking Roost × Renata Glasc × Retreat — whose Bird is it?", () => {
  test("(a) the Bird is CONTROLLED by P2 and OWNED by P2 (182 exception + 183/439.4/127.1: P2 performed the play); it exists on the board as a 1-Might Deflect unit token", async () => {
    const game = await board("p1").build();
    const bird = await playRoost(game);
    expect(game.state(bird)).toMatchObject({ controller: P2, isToken: true, might: 1, name: "Bird", owner: P2 });
    expect(game.state(bird).keywords).toContain("Deflect");
    expect(game.has(bird)).toBe(true);
    expect(game.p1.units()).toEqual(expect.arrayContaining(["roost", "renata"]));
    expect(game.p1.units()).not.toContain(bird);
    expect(game.p2.units()).toContain(bird);
  });

  test("(a) it is placed at a P2 location — P2's base or bf2 — never at P1's bf1 or in P1's base (185.2.a)", async () => {
    const game = await board("p1").build();
    const bird = await playRoost(game);
    const loc = game.locationOf(bird);
    expect(["base", "bf2"]).toContain(loc as string);
    expect(loc).not.toBe("bf1");
    if (loc === "base") {
      expect(game.p2.base()).toContain(bird);
      expect(game.p1.base()).not.toContain(bird);
    }
  });

  test("(a) P2 — the player performing the play — should be asked WHERE to play the Bird (P2's base | bf2), and P1 gets no say (185.2.a → 349)", async () => {
    // Expected: once the trigger resolves a destination pick for seat P2 offering base and bf2 (not bf1). Actual: the
    // token is dropped straight into P2's base with no decision for anyone.
    const game = await board("p1").build();
    await game.p1.play("roost", { to: "base" });
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    const keys = d?.kind === "pick" ? d.options.map((o) => o.zone ?? o.key) : [];
    expect(keys.some((k) => String(k).includes("bf2"))).toBe(true);
    expect(keys.some((k) => String(k).includes("base"))).toBe(true);
    expect(keys.some((k) => String(k).includes("bf1"))).toBe(false);
    await game.p2.pick(keys.find((k) => String(k).includes("bf2")) as string);
    await game.settle();
    expect(game.locationOf(birdsOf(game)[0] as string)).toBe("bf2");
  });

  test("(a) with only P1 controlling Renata, P2's Bird is not one of 'your tokens' → it enters EXHAUSTED (185.2.d default; 184.1 not invoked)", async () => {
    // Expected: isExhausted true — Renata's controller is P1, the token's controller is P2. Actual: the engine applies
    // P1's Renata to the token P1's trigger created and the Bird enters ready.
    const game = await board("p1").build();
    const bird = await playRoost(game);
    expect(game.state(bird).controller).toBe(P2);
    expect(game.state(bird).isExhausted).toBe(true);
  });

  test("baseline: nobody has Renata → the Bird enters EXHAUSTED under P2 (185.2.d)", async () => {
    const game = await board("none").build();
    const bird = await playRoost(game);
    expect(game.state(bird)).toMatchObject({ controller: P2, isExhausted: true, owner: P2 });
  });

  test("(b) mirror: P2 controls Renata, P1 (no Renata) plays Roost → the Bird is P2's token and must enter READY ('Your tokens' = Renata's controller's tokens)", async () => {
    // Expected: isReady true — the Bird's controller (P2) has Renata. Actual: the engine keys "your tokens" off the
    // controller of the CREATING trigger (P1), so P2's Renata is ignored and the Bird enters exhausted.
    const game = await board("p2").build();
    const bird = await playRoost(game);
    expect(game.state(bird)).toMatchObject({ controller: P2, isReady: true, owner: P2 });
    expect(game.state("roost").isExhausted).toBe(true); // the Roost itself is P1's non-token unit: exhausted as usual
  });

  test("(c) Deflect taxes P1 (an opponent of the Bird's controller, 809.1.c): with 2 energy and NO power P1's Discipline does not offer the Bird and casting at it is refused; with 1 power of any domain it is offered and the power is spent", async () => {
    const game = await board("p1").build();
    const bird = await playRoost(game);
    expect(game.p1.resources()).toEqual({ energy: 2, power: {} });
    expect(targetsOf(game, "p1", "p1disc")).not.toContain(bird);
    expect(targetsOf(game, "p1", "p1disc")).toContain("roost"); // own Deflect unit: no tax
    expect((await game.p1.try((p) => p.cast("p1disc", { targets: bird }))).ok).toBe(false);
    await game.p1.do("addResources", { power: { fury: 1 } });
    expect(targetsOf(game, "p1", "p1disc")).toContain(bird);
    await game.p1.cast("p1disc", { targets: bird });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.state(bird).might).toBe(3);
  });

  test("(c) …but not P2, its controller: on P2's turn Discipline on the Bird costs exactly 2 energy, no power", async () => {
    const game = await board("p1").build();
    const bird = await playRoost(game);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.tapRunes(2);
    expect(game.p2.resources().energy).toBe(2);
    expect(Object.values(game.p2.resources().power).reduce((a, b) => a + b, 0)).toBe(0);
    expect(targetsOf(game, "p2", "p2disc")).toContain(bird);
    await game.p2.cast("p2disc", { targets: bird });
    expect(game.p2.energy()).toBe(0);
    await game.settle();
    expect(game.state(bird).might).toBe(3);
  });

  test("(c) the Bird is an ENEMY of Walking Roost (740.1.b): different controllers, and P1's 'friendly unit' Retreat never offers it while P2's does (740.1.a)", async () => {
    const game = await board("p1").build();
    const bird = await playRoost(game);
    expect(game.state(bird).controller).not.toBe(game.state("roost").controller);
    // P1's Retreat (friendly to P1): Roost/Renata yes, Bird no — even with power for a would-be Deflect tax.
    await game.p1.do("addResources", { power: { fury: 1 } });
    const p1Friendly = targetsOf(game, "p1", "p1retreat");
    expect(p1Friendly).toEqual(expect.arrayContaining(["roost", "renata"]));
    expect(p1Friendly).not.toContain(bird);
    expect((await game.p1.try((p) => p.cast("p1retreat", { targets: bird }))).ok).toBe(false);
    expect(game.has(bird)).toBe(true);
  });

  test("(d) P2 Retreats the Bird on P2's turn: legal (friendly to P2); it goes to its OWNER's hand = P2's and ceases to exist there (186.1) — P2's hand only shrinks by the Retreat, nothing in P1's hand/base/trash either", async () => {
    const game = await board("p1").build();
    const bird = await playRoost(game);
    await game.advanceTurn();
    await game.p2.tapRune();
    expect(targetsOf(game, "p2", "p2retreat")).toContain(bird);
    const p2hand0 = game.p2.hand().length;
    const p1hand0 = game.p1.hand().length;
    await game.p2.cast("p2retreat", { targets: bird });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.has(bird)).toBe(false);
    expect(game.zoneOf(bird)).toBe("gone");
    expect(game.p2.hand()).toHaveLength(p2hand0 - 1); // −Retreat, +0 (the token vanished)
    expect(game.p2.hand()).not.toContain(bird);
    expect(game.p1.hand()).toHaveLength(p1hand0);
    expect([...game.p1.base(), ...game.p1.trash(), ...game.p2.base(), ...game.p2.trash()]).not.toContain(bird);
    expect(game.zoneOf("p2retreat")).toBe("trash");
    expect(birdsOf(game)).toEqual([]);
  });

  test("(d) 'its owner channels 1 rune exhausted' → P2 (the owner) channels: P2's rune pool +1 exhausted, rune deck −1; P1 channels nothing — the rider still happens although the token vanished", async () => {
    const game = await board("p1").build();
    const bird = await playRoost(game);
    await game.advanceTurn();
    await game.p2.tapRune();
    const p2runes0 = game.p2.runes().length;
    const p2exh0 = game.p2.runes({ ready: false }).length;
    const p2deck0 = game.p2.runeDeck().length;
    const p1runes0 = game.p1.runes().length;
    const p1deck0 = game.p1.runeDeck().length;
    await game.p2.cast("p2retreat", { targets: bird });
    await game.settle();
    expect(game.p2.runes()).toHaveLength(p2runes0 + 1);
    expect(game.p2.runes({ ready: false })).toHaveLength(p2exh0 + 1);
    expect(game.p2.runeDeck()).toHaveLength(p2deck0 - 1);
    expect(game.p1.runes()).toHaveLength(p1runes0);
    expect(game.p1.runeDeck()).toHaveLength(p1deck0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("report (owner, controller, zone, exists) across the steps: after play → (P2, P2, P2 board, true); after P2's Retreat → gone/false", async () => {
    const game = await board("p1").build();
    const bird = await playRoost(game);
    const s = game.state(bird);
    expect([s.owner, s.controller, game.has(bird)]).toEqual([P2, P2, true]);
    expect(s.zone === "base" || s.zone === "battlefield-bf2").toBe(true);
    await game.advanceTurn();
    await game.p2.tapRune();
    await game.p2.cast("p2retreat", { targets: bird });
    await game.settle();
    expect([game.has(bird), game.zoneOf(bird)]).toEqual([false, "gone"]);
  });
});
