/**
 * Interaction: Tactical Retreat (unl-175-219) · Spell (Reaction) · Order · 2
 *     "Choose a friendly unit. The next time it would die this turn, heal it, exhaust it, and recall it
 *      instead. (Send it to base. This isn't a move.)"
 *   × Conscription (unl-140-219) · Spell (Action) · Chaos · 5 + [chaos][chaos]
 *     "You may spend 5 XP as an additional cost… Choose an enemy unit at a battlefield with 3 [Might] or
 *      less. … Take control of it, exhaust it, and recall it."
 *   × Cruel Patron (ogn-208-298) · Unit · Order · 4 · 6 Might
 *     "As an additional cost to play me, kill a friendly unit."
 *
 * Rules: 390.3 / 391 ("the next time … this turn" = a delayed replacement, Guillotine-style), 392 (delayed
 * abilities are independent of their source), 371.2 (only a "may" replacement offers a choice — Retreat has
 * none), 357.2.a (a cost replaced by a replacement effect is still PAID — the CR's own Cruel Patron example),
 * 428.1.a.1 (a cost-kill is a Kill Instruction → the unit "would die"), 455 / 456 / 458.1 (recall = to ITS
 * base, not a move, damage kept), 359.3.e.4 (only a non-board zone change makes a new object; a control
 * change / recall does not), 127.1 (killed cards go to their OWNER's trash), 740.1.a (friendly = same
 * controller).
 *
 * Question: P1's turn. P2's X (3 Might, 2 damage) sits at bf2; P2 holds Tactical Retreat with 2 energy. P1
 * casts Conscription on X; in response P2 Retreats X. Retreat resolves, then Conscription (X → P1's base,
 * exhausted, P1 controls it). Later this turn P1 plays Cruel Patron killing X as the cost. (a) Is Retreat's
 * shield still on X after the control change + recall? (b) What happens to X — die to P2's trash, or healed
 * / exhausted / recalled, and to whose base? (c) Is Patron's cost paid so it enters? (d) Does anyone choose
 * anything when the replacement applies? (e) Contrast without Retreat.
 *
 * Expected: (a) still armed — tied to the object X, not to P2's control or X's location. (b) the cost-kill
 * is "the next time it would die" → instead X is healed to 0, (already) exhausted, and recalled to its
 * CURRENT controller P1's base where it already is; it never touches a trash and stays P1's. (c) yes —
 * Patron enters P1's base, 4 energy spent; the shield is now used up, so a later lethal hit this turn kills X
 * for real (→ owner P2's trash). (d) nobody — no "may". (e) without Retreat X is killed as the cost → P2's
 * trash (owner), Patron enters.
 */
import { describe, expect, test } from "bun:test";
import type { Game, Seat } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TACTICAL_RETREAT = "unl-175-219";
const CONSCRIPTION = "unl-140-219";
const CRUEL_PATRON = "ogn-208-298";

/** Inline free Action spells P1 uses as alternative / follow-up death events on X. */
const KILL_SPELL = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "order",
  energyCost: 0,
  name: "Test Execute",
  rulesText: "Kill a unit.",
  timing: "action",
};
const BOLT = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Bolt",
  rulesText: "Deal 3 to a unit.",
  timing: "action",
};

/**
 * P1's turn. P2: X (3 Might, 2 damage) at bf2 (P2's), a Homebody in base, 2 energy, optionally Tactical
 * Retreat in hand. P1: a Homebody in base, 9 energy + 2 chaos (Conscription 5+[C][C], then Patron 4),
 * Conscription + Cruel Patron + a free Execute and Bolt in hand.
 */
function board(opts: { retreat: boolean }) {
  const b = scenario()
    .resources(P1, { energy: 9, power: { chaos: 2 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 3, name: "Unit X" }, "x", { damage: 2 })
    .unit(P2, "base", { might: 2, name: "P2 Homebody" }, "p2home")
    .unit(P1, "base", { might: 2, name: "P1 Homebody" }, "p1home")
    .hand(P1, CONSCRIPTION, "con")
    .hand(P1, CRUEL_PATRON, "patron")
    .hand(P1, KILL_SPELL, "execute")
    .hand(P1, BOLT, "bolt");
  return opts.retreat ? b.hand(P2, TACTICAL_RETREAT, "tr") : b;
}

function offered(game: Game, seat: Seat, verb: string, alias: string, field: string): string[] {
  const f = game.seat(seat).option(verb, alias)?.fields.find((x) => x.name === field || x.arg === field);
  return [...new Set((f?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/** P1 Conscriptions X; P2 responds with Tactical Retreat on X (if held); everything resolves (Retreat first, then Conscription). */
async function conscripted(opts: { retreat: boolean }): Promise<Game> {
  const game = await board(opts).build();
  await game.p1.cast("con", { targets: "x" });
  await game.p1.passPriority();
  if (opts.retreat) {
    await game.p2.cast("tr", { targets: "x" });
    expect(game.chain().map((c) => [c.cardId, c.controller])).toEqual([
      ["con", P1],
      ["tr", P2],
    ]);
  }
  const r = await game.settle();
  expect(r.reason).toBe("open");
  expect(game.chain()).toEqual([]);
  return game;
}

const snapshot = (game: Game, card: string) => {
  if (!game.has(card)) {
    return { zone: "gone" };
  }
  const s = game.state(card);
  return { controller: s.controller, damage: s.damage, isExhausted: s.isExhausted, location: s.location, owner: s.owner, zone: s.zone };
};

describe("setup: Conscription with Tactical Retreat in response", () => {
  test("with Conscription on the chain, P2's Retreat offers P2's FRIENDLY units — X (still P2's) and P2 Homebody — never P1's", async () => {
    const game = await board({ retreat: true }).build();
    expect(offered(game, P1, "cast", "con", "targets")).toEqual(["x"]); // enemy, ≤3, at a battlefield
    await game.p1.cast("con", { targets: "x" });
    expect(game.p1.resources()).toEqual({ energy: 4, power: { chaos: 0 } });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "tr")).toBe(true);
    expect(offered(game, P2, "cast", "tr", "targets").sort()).toEqual(["p2home", "x"]);
  });

  test("Retreat resolves first and changes nothing visible; then Conscription: X is in P1's base, controlled by P1, owned by P2, exhausted, STILL carrying its 2 damage (455/456/458.1)", async () => {
    const game = await conscripted({ retreat: true });
    expect(snapshot(game, "x")).toEqual({ controller: P1, damage: 2, isExhausted: true, location: "base", owner: P2, zone: "base" });
    expect(game.p1.units("base").sort()).toEqual(["p1home", "x"]);
    expect(game.cardsAt("bf2")).toEqual([]);
    expect(game.p2.trash()).toEqual(["tr"]);
    expect(game.p1.trash()).toEqual(["con"]);
    expect(game.p2.energy()).toBe(0);
  });

  test("Cruel Patron now counts X as a FRIENDLY unit to kill (740.1.a): sacrifice candidates are exactly {P1 Homebody, X}; P2 Homebody is not one", async () => {
    const game = await conscripted({ retreat: true });
    expect(game.p1.can("play", "patron")).toBe(true);
    expect(offered(game, P1, "play", "patron", "sacrifice").sort()).toEqual(["p1home", "x"]);
    await expect(game.p1.play("patron", { sacrifice: "p2home" })).rejects.toThrow();
  });
});

describe("(a) the shield survives the control change and recall — shown with a plain Kill instruction", () => {
  test("P1 Executes its own stolen X: 'would die' → instead healed to 0, exhausted, recalled to its controller P1's base; no trash touched; still P1's (392, 359.3.e.4, 455)", async () => {
    const game = await conscripted({ retreat: true });
    await game.p1.cast("execute", { targets: "x" });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(snapshot(game, "x")).toEqual({ controller: P1, damage: 0, isExhausted: true, location: "base", owner: P2, zone: "base" });
    expect(game.p1.units("base")).toContain("x");
    expect(game.p2.units()).not.toContain("x");
    expect(game.p2.trash()).toEqual(["tr"]);
    expect(game.p1.trash().sort()).toEqual(["con", "execute"]);
  });

  test("(d) it applies automatically — neither player is asked anything (no 'may', 371.2): the cast settles straight back to P1's open main phase", async () => {
    const game = await conscripted({ retreat: true });
    await game.p1.cast("execute", { targets: "x" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Execute resolves here
    const d = game.decision();
    expect(d?.seat).toBe(P1);
    expect(d).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("x").damage).toBe(0);
  });

  test("one-shot: after that save, a lethal Bolt the same turn kills X for real → its OWNER P2's trash (127.1)", async () => {
    const game = await conscripted({ retreat: true });
    await game.p1.cast("execute", { targets: "x" });
    await game.settle();
    await game.p1.cast("bolt", { targets: "x" });
    await game.settle();
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.p2.trash()).toContain("x");
    expect(game.p1.trash()).not.toContain("x");
  });
});

describe("(b)(c)(d) Cruel Patron kills the conscripted, shielded X as its cost", () => {
  // Expected (428.1.a.1 → 390.3, 357.2.a): paying the cost is a Kill Instruction on X, the shield replaces
  // it: X healed to 0 damage, exhausted, recalled to P1's base (where it is), never in a trash, still P1's.
  // Actual: Cruel Patron's cost-kill does nothing at all to a friendly unit its player controls but does not
  // OWN — X is neither killed nor "would die", so the replacement never applies and X keeps its 2 damage.
  test("(b) Patron's cost-kill on a controlled-not-owned unit is a no-op; X should be saved by Retreat — healed to 0, exhausted, in P1's base, P1's, no trash", async () => {
    const game = await conscripted({ retreat: true });
    await game.p1.play("patron", { sacrifice: "x" });
    await game.settle();
    expect(game.p2.trash()).toEqual(["tr"]);
    expect(game.p1.trash()).toEqual(["con"]);
    expect(snapshot(game, "x")).toEqual({ controller: P1, damage: 0, isExhausted: true, location: "base", owner: P2, zone: "base" });
  });

  test("(b) what does hold today: X never reaches either trash and is still a P1-controlled, P2-owned unit in P1's base after Patron is played", async () => {
    const game = await conscripted({ retreat: true });
    await game.p1.play("patron", { sacrifice: "x" });
    await game.settle();
    expect(game.has("x")).toBe(true);
    expect(snapshot(game, "x")).toMatchObject({ controller: P1, isExhausted: true, location: "base", owner: P2, zone: "base" });
    expect(game.p1.units("base")).toContain("x");
    expect(game.p2.trash()).not.toContain("x");
    expect(game.p1.trash()).not.toContain("x");
  });

  test("(c) the (replaced) cost counts as PAID: Cruel Patron enters P1's base and the 4 energy is spent — P1 keeps X AND gets Patron (357.2.a)", async () => {
    const game = await conscripted({ retreat: true });
    expect(game.p1.energy()).toBe(4);
    await game.p1.play("patron", { sacrifice: "x" });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("patron")).toBe("base");
    expect(game.p1.units("base").sort()).toEqual(["p1home", "patron", "x"]);
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([]);
  });

  test("(d) nobody chooses anything: after declaring the play there is no yes/no, order or P2 prompt — straight back to P1's open main phase (371.2)", async () => {
    const game = await conscripted({ retreat: true });
    await game.p1.play("patron", { sacrifice: "x" });
    const d = game.decision();
    expect(d?.seat).toBe(P1);
    expect(d?.kind === "yes-no" || d?.kind === "order" || d?.kind === "pick").toBe(false);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // Expected: the shield was consumed by the cost-kill, so a lethal Bolt later this turn kills X → P2's
  // trash. Actual: the cost-kill never happened (see above), the shield is still armed and saves X here.
  test("(c) the shield should be USED UP by Patron's cost-kill — a later lethal Bolt this turn must kill X into its owner P2's trash", async () => {
    const game = await conscripted({ retreat: true });
    await game.p1.play("patron", { sacrifice: "x" });
    await game.settle();
    await game.p1.cast("bolt", { targets: "x" });
    await game.settle();
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.p2.trash()).toContain("x");
    expect(game.zoneOf("patron")).toBe("base");
  });
});

describe("(e) contrast: the same line WITHOUT Tactical Retreat", () => {
  test("Conscription alone: X in P1's base, P1's, exhausted, 2 damage; P2 spent nothing", async () => {
    const game = await conscripted({ retreat: false });
    expect(snapshot(game, "x")).toEqual({ controller: P1, damage: 2, isExhausted: true, location: "base", owner: P2, zone: "base" });
    expect(game.p2.energy()).toBe(2);
  });

  // Expected (127.1, 428.1.a.1): X is killed as Patron's cost and goes to its OWNER's — P2's — trash; Patron
  // enters. Actual: the cost-kill on the controlled-not-owned X is a no-op — X stays in P1's base (Patron
  // still enters, so P1 effectively skipped the cost).
  test("(e) without Retreat, Patron's cost-kill must put X into its owner P2's trash (not P1's) — the engine leaves X on the board", async () => {
    const game = await conscripted({ retreat: false });
    await game.p1.play("patron", { sacrifice: "x" });
    await game.settle();
    expect(game.zoneOf("patron")).toBe("base");
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.p2.trash()).toEqual(["x"]);
    expect(game.p1.trash()).toEqual(["con"]);
    expect(game.p1.units("base").sort()).toEqual(["p1home", "patron"]);
  });

  test("(e) without Retreat, Patron does enter P1's base for 4 energy when X is named as the kill", async () => {
    const game = await conscripted({ retreat: false });
    await game.p1.play("patron", { sacrifice: "x" });
    await game.settle();
    expect(game.zoneOf("patron")).toBe("base");
    expect(game.p1.energy()).toBe(0);
  });

  test("(e) control: other deaths of the stolen X do route to its OWNER's trash — a Kill spell sends X to P2's trash, not P1's (127.1)", async () => {
    const game = await conscripted({ retreat: false });
    await game.p1.cast("execute", { targets: "x" });
    await game.settle();
    expect(game.zoneOf("x")).toBe("trash");
    expect(game.p2.trash()).toEqual(["x"]);
    expect(game.p1.trash().sort()).toEqual(["con", "execute"]);
  });

  test("(e) control: Patron's cost-kill on P1's OWN unit works — P1 Homebody → P1's trash, Patron enters, X untouched", async () => {
    const game = await conscripted({ retreat: false });
    await game.p1.play("patron", { sacrifice: "p1home" });
    await game.settle();
    expect(game.zoneOf("p1home")).toBe("trash");
    expect(game.p1.trash()).toContain("p1home");
    expect(game.zoneOf("patron")).toBe("base");
    expect(snapshot(game, "x")).toMatchObject({ controller: P1, damage: 2, zone: "base" });
    expect(game.violations()).toEqual([]);
  });
});
