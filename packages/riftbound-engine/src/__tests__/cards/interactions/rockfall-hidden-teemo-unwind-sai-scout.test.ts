/**
 * Interaction: Rockfall Path (sfd-216-221) · Battlefield · "Units can't be played here."
 *   × Teemo, Strategist (ogn-121-298) · Unit · Mind · [2] · 2 Might · "[Hidden] … When I defend, …"
 *   × Sai Scout (ogn-174-298) · Unit · Chaos · [6] · 5 Might · "[Vision] … You may play me to an open battlefield."
 *   (+ Hidden Blade ogn-213-298 · "[Hidden] [Action] Kill a unit at a battlefield. Its controller draws 2." as
 *    the hidden-SPELL contrast.)
 *
 * Board: R = Rockfall Path, controlled by P1 via vanilla G standing there; O = a vanilla open (uncontrolled)
 * battlefield. P1 holds Teemo and Sai Scout.
 *   (a) May P1 HIDE Teemo facedown at R (pay [rainbow])?
 *   (b) From the next turn on, is "play Teemo from facedown" ever offered? If attempted anyway, what is the
 *       post-state? Contrast: a hidden SPELL facedown at R.
 *   (c) Which play locations is Sai Scout offered — base? R (P1 controls it)? O (open)? And if R were the
 *       open battlefield instead?
 *   (d) Is a Standard Move base → R offered (and a Ganking move into R)?
 *   (e) P2 later takes R from P1 — what happens to the still-facedown Teemo?
 *
 * Rules: 054.1 (can't beats can), 811.1.c.1 (Hide is not Play), 811.1.d.1 (a hidden permanent must be
 * played TO that battlefield), 811.6 (Hidden grants Reaction — a WHEN permission only), 355.2.a / 355.2.b
 * (valid locations; permissions add locations but do not lift prohibitions), 358.3 / 358.5 (illegal play is
 * undone), 144.4.a (moving is not playing), 107.3.d / 323.7 (facedown card trashed when control is lost).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ROCKFALL_PATH = "sfd-216-221";
const TEEMO_STRATEGIST = "ogn-121-298";
const SAI_SCOUT = "ogn-174-298";
const HIDDEN_BLADE = "ogn-213-298";

type G = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

const playTo = (game: G, card: string): unknown[] => [...(game.p1.option("play", card)?.fields.find((f) => f.arg === "to")?.options ?? [])];

/**
 * P1's turn 2. R = live Rockfall Path controlled by P1 (G, 2 Might, stands there). O = inert open battlefield.
 * P1: Teemo + Sai Scout in hand, Walker (2) in base, [8] + 2×[rainbow] + [chaos]. P2: Crusher (8) in base.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { chaos: 1, rainbow: 2 } })
    .battlefield("rock", { controller: P1, def: ROCKFALL_PATH, inert: false, owner: P1 })
    .battlefield("open", { controller: null })
    .unit(P1, "rock", { might: 2, name: "G" }, "g")
    .unit(P1, "base", { might: 2, name: "Walker" }, "walker")
    .unit(P2, "base", { might: 8, name: "Crusher" }, "crusher")
    .hand(P1, TEEMO_STRATEGIST, "teemo")
    .hand(P1, SAI_SCOUT, "sai");
}

/** P1 hides Teemo at R, then the turn goes round to P1 again (turn 4) so the facedown card is "live". */
async function teemoHiddenATurnLater(): Promise<G> {
  const game = await board().build();
  await game.p1.hide("teemo", "rock");
  await game.advanceTurn(); // → P2 (turn 3)
  await game.advanceTurn(); // → P1 (turn 4)
  expect(game.turnPlayer()).toBe(P1);
  expect(game.zoneOf("teemo")).toBe("facedown-rock");
  return game;
}

describe("Rockfall Path × hidden Teemo × Sai Scout", () => {
  // ── (a) Hide is not Play ────────────────────────────────────────────────────────────────

  test("(a) P1 may HIDE Teemo facedown at Rockfall (811.1.c.1 — Hide is not a play): R is the offered hide location, Teemo goes to R's facedown zone and P1 pays [rainbow]; no chain opens", async () => {
    const game = await board().build();
    expect(game.p1.can("hide", "teemo")).toBe(true);
    expect(game.p1.option("hide", "teemo")?.fields.find((f) => f.arg === "to")?.options).toEqual(["rock"]);
    await game.p1.hide("teemo", "rock");
    expect(game.zoneOf("teemo")).toBe("facedown-rock");
    expect(game.state("teemo").isHidden).toBe(true);
    expect(game.p1.facedown("rock")).toEqual(["teemo"]);
    expect(game.p1.resources()).toEqual({ energy: 8, power: { chaos: 1, rainbow: 1 } });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ── (b) playing the hidden unit is never offered; a forced attempt unwinds ─────────────

  test("(b) on a later turn 'play Teemo from facedown' is NOT in P1's action list — the only legal location is R (811.1.d.1) and units can't be played there (054.1)", async () => {
    const game = await teemoHiddenATurnLater();
    expect(game.p1.can("reveal", "teemo")).toBe(false);
    expect(game.p1.can("playFrom", "teemo")).toBe(false);
    expect(game.p1.legal().some((o) => o.card === "teemo")).toBe(false);
  });

  test("(b) nor as a Reaction during a showdown at R: P2's Crusher attacks R, P2 passes Focus → P1 still cannot flip Teemo there", async () => {
    const game = await board().build();
    await game.p1.hide("teemo", "rock");
    await game.advanceTurn(); // → P2 (turn 3): Teemo was hidden on a previous turn now
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.move("crusher", "rock");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "teemo")).toBe(false);
    expect(game.zoneOf("teemo")).toBe("facedown-rock");
  });

  test("(b) if an attempt is forced anyway it is rejected and fully undone (358.3/358.5): Teemo stays facedown at R, no chain, pool unchanged, P1 still to act in its main phase", async () => {
    const game = await teemoHiddenATurnLater();
    const pool = game.p1.resources();
    const r = await game.p1.try((p) => p.reveal("teemo"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("teemo")).toBe("facedown-rock");
    expect(game.state("teemo").isHidden).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.p1.resources()).toEqual(pool);
    expect(game.p1.units("rock")).toEqual(["g"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(b) contrast — a hidden SPELL at R is unaffected by Rockfall: Hidden Blade facedown at R flips for [0], its target is restricted to R (G, not Walker in base), G dies and P1 draws 2", async () => {
    const game = await scenario()
      .turn(4)
      .resources(P1, { energy: 0 })
      .battlefield("rock", { controller: P1, def: ROCKFALL_PATH, inert: false, owner: P1 })
      .battlefield("open", { controller: null })
      .unit(P1, "rock", { might: 2, name: "G" }, "g")
      .unit(P1, "base", { might: 2, name: "Walker" }, "walker")
      .facedown(P1, "rock", HIDDEN_BLADE, "blade")
      .build();
    expect(game.p1.can("reveal", "blade")).toBe(true);
    const hand = game.p1.hand().length;
    await game.p1.reveal("blade");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", controller: P1, type: "spell" })]);
    // Walker (base) is never a candidate: either G was locked in as the only legal target, or the ask lists only G.
    const d = game.decision();
    if (d?.kind === "pick") {
      expect(d.options.map((o) => o.key)).toEqual(["g"]);
    }
    await game.settle();
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("g")).toBe("trash");
    expect(game.zoneOf("walker")).toBe("base");
    expect(game.p1.hand()).toHaveLength(hand + 2);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // played from hidden for [0]
  });

  // ── (c) Sai Scout's extra permission does not unlock Rockfall ────────────────────────

  test("(c) Sai Scout is offered {base, O} — R is excluded even though P1 controls it (355.2.a would allow; Rockfall forbids; 054.1); forcing to=R is rejected and nothing is spent", async () => {
    const game = await board().build();
    expect(playTo(game, "sai").sort()).toEqual(["base", "battlefield-open"].sort());
    const r = await game.p1.try((p) => p.play("sai", { to: "rock" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("sai")).toBe("hand");
    expect(game.p1.energy()).toBe(8);
  });

  test("(c) choosing the open battlefield plays Sai Scout there normally (355.2.b): 6 energy paid, Sai Scout at O, the Vision trigger goes on the chain and asks about the top card (P1 declines the recycle)", async () => {
    const game = await board().build();
    const top = game.p1.deck()[0];
    await game.p1.play("sai", { to: "open" });
    expect(game.locationOf("sai")).toBe("open");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sai", controller: P1, triggered: true })]);
    const s = await game.settle();
    expect(s.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    expect((game.decision() as { options: { key: string }[] }).options.map((o) => o.key)).toEqual([top]);
    await game.p1.decline();
    await game.settle();
    expect(game.p1.deck()[0]).toBe(top);
    expect(game.p1.energy()).toBe(2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(c) if R were the OPEN battlefield instead: 'may play me to an open battlefield' still cannot override Rockfall — offered = {base, the other controlled battlefield}, never R", async () => {
    const game = await scenario()
      .resources(P1, { energy: 8, power: { chaos: 1 } })
      .battlefield("rock", { controller: null, def: ROCKFALL_PATH, inert: false, owner: P1 })
      .battlefield("mine", { controller: P1 })
      .unit(P1, "mine", { might: 2, name: "G" }, "g")
      .hand(P1, SAI_SCOUT, "sai")
      .build();
    expect(playTo(game, "sai").sort()).toEqual(["base", "battlefield-mine"].sort());
    const r = await game.p1.try((p) => p.play("sai", { to: "rock" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("sai")).toBe("hand");
  });

  // ── (d) moving is not playing ─────────────────────────────────────────────────────────

  test("(d) a Standard Move base → R IS offered and resolves normally (144.4.a — moving is not playing): Walker joins G at Rockfall", async () => {
    const game = await board().build();
    expect(game.p1.legal().some((o) => o.key === "standardMove:to:rock")).toBe(true);
    await game.p1.move("walker", "rock");
    await game.settle();
    expect(game.locationOf("walker")).toBe("rock");
    expect(game.p1.units("rock").sort()).toEqual(["g", "walker"].sort());
    expect(game.gameState.battlefields.rock?.controller).toBe(P1);
  });

  test("(d) a Ganking move into R is offered too (ruling: you can gank into Rockfall): a [Ganking] unit at another battlefield lists R as a destination and arrives there", async () => {
    const game = await board()
      .battlefield("side", { controller: P1 })
      .unit(P1, "side", { keywords: ["Ganking"], might: 2, name: "Ganker" }, "ganker")
      .build();
    const gank = game.p1.option("gank", "ganker");
    expect(gank).toBeDefined();
    expect(gank?.fields.find((f) => f.arg === "to")?.options).toContain("rock");
    await game.p1.gank("ganker", "rock");
    await game.settle();
    expect(game.locationOf("ganker")).toBe("rock");
  });

  // ── (e) losing R trashes the never-playable facedown Teemo ───────────────────────────

  test("(e) P2's Crusher (8) takes R from P1: G dies, P2 controls R, and at the next Cleanup the still-facedown Teemo is put in P1's trash (107.3.d / 323.7) — it was never playable while hidden there", async () => {
    const game = await teemoHiddenATurnLater();
    await game.advanceTurn(); // → P2 (turn 5)
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.move("crusher", "rock");
    await game.settle(); // showdown → combat: 8 vs 2
    expect(game.zoneOf("g")).toBe("trash");
    expect(game.gameState.battlefields.rock?.controller).toBe(P2);
    expect(game.zoneOf("teemo")).toBe("trash");
    expect(game.p1.trash()).toContain("teemo");
    expect(game.p1.facedown("rock")).toEqual([]);
    expect(game.state("teemo").owner).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
