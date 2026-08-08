/**
 * Interaction: LeBlanc, Everywhere at Once (unl-090-219) · Champion Unit · Mind · 4 · 4 Might
 *     "[Backline] Your [Temporary] effects at my battlefield don't trigger."
 *   × Sprite Call (ogn-094-298) · Spell · Mind · 3 · [Hidden] [Action]
 *     "Play a ready 3 [Might] Sprite unit token with [Temporary]. (Kill it at the start of its
 *      controller's Beginning Phase, before scoring.)"
 *   (Sprite token printing unl-t07 is used where a Sprite must be pre-placed; an inline 0-cost [Reaction]
 *    "Test Blink — move a friendly unit to a battlefield you control" stands in for a repositioning trick.)
 *
 * Rules: 816.1.b / 816.1.c (Temporary = "At the start of this permanent's controller's Beginning Phase,
 * before scoring, kill this" — a TRIGGERED ability keyed to the controller), 816.2.a, 383.1 / 383.2.c
 * ("at [point in time]" trigger: the condition is evaluated once, when that moment is processed), 383.3
 * (a triggered ability is placed on the chain → can be responded to), 315.2.a.1 (start-of-Beginning-Phase
 * effects precede scoring).
 *
 * Question: P1 controls LeBlanc at BF1.
 *   (a) P1's Sprite (from Sprite Call) is at BF1 at the start of P1's Beginning Phase — does it die, and
 *       does it then hold/score?
 *   (b) P2's Sprite at BF1 at the start of P2's Beginning Phase — suppressed?
 *   (c) P1's Sprite in P1's base: its trigger goes on the chain — can P1 respond? If LeBlanc leaves BF1
 *       later (even during that Beginning Phase), does the suppressed BF1 Sprite trigger late? If a
 *       Temporary item is already on the chain and LeBlanc then arrives at that battlefield, is it removed?
 *
 * Expected: (a) no chain item is created at all; the Sprite survives and BF1 is held (+1). (b) not
 * suppressed ("Your" = LeBlanc's controller's): P2's Sprite's trigger goes on the chain at the start of
 * P2's Beginning Phase (P2 may respond) and it is killed. (c) a base is not a battlefield → the base
 * Sprite triggers; P1 may play Reactions while it is pending, then it dies before scoring. The condition
 * is point-in-time: LeBlanc leaving BF1 afterwards does NOT make the BF1 Sprite trigger this turn (it
 * dies at P1's NEXT Beginning Phase if unprotected then); and an item already on the chain still
 * resolves even if LeBlanc is moved onto that Sprite's battlefield in response.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const LEBLANC = "unl-090-219";
const SPRITE_CALL = "ogn-094-298";
const SPRITE_TOKEN = "unl-t07"; // 3-Might Sprite unit token printing with [Temporary]

/** Inline 0-cost Reaction: move a friendly unit to a battlefield you control. */
const BLINK = {
  abilities: [
    { effect: { target: { controller: "friendly", type: "unit" }, to: { battlefield: "controlled" }, type: "move" }, timing: "reaction", type: "spell" },
  ],
  cardType: "spell",
  domain: "mind",
  energyCost: 0,
  name: "Test Blink",
  timing: "reaction",
} as const;

/** Inline 0-cost Reaction pump so P2 has something legal to respond with. */
const POKE = {
  abilities: [{ effect: { amount: 1, duration: "turn", target: { controller: "friendly", type: "unit" }, type: "modify-might" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Poke",
  timing: "reaction",
} as const;

describe("LeBlanc, Everywhere at Once × Sprite Call — whose Temporary is switched off, and when the 'at the start' window is judged", () => {
  // ---- (a) your Sprite at LeBlanc's battlefield --------------------------------------------------------

  test("(a) a Sprite P1 made with Sprite Call at BF1 (LeBlanc's battlefield) survives P1's next Beginning Phase: no Temporary item is ever put on the chain, and BF1 is then held for +1", async () => {
    const game = await scenario()
      .turn(1)
      .active(P1)
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", LEBLANC, "lb")
      .hand(P1, SPRITE_CALL, "sc")
      .build();
    await game.p1.cast("sc");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 }); // where to play the token
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    const sprite = game.p1.units("bf1").find((id) => id !== "lb");
    expect(sprite).toBeDefined();
    expect(game.state(sprite!)).toMatchObject({ isReady: true, isToken: true, might: 3, name: "Sprite" });
    expect(game.state(sprite!).keywords).toContain("Temporary");
    const p0 = game.p1.points();
    await game.advanceTurn(); // → P2
    expect(game.zoneOf(sprite!)).toBe("battlefield-bf1");
    await game.p2.endTurn(); // → P1's turn begins
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([]); // "don't trigger": nothing to respond to, nothing to resolve
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.has(sprite!) && game.zoneOf(sprite!)).toBe("battlefield-bf1");
    expect(game.p1.units("bf1").sort()).toEqual(["lb", sprite!].sort());
    expect(game.p1.points()).toBe(p0 + 1); // held BF1 in the Scoring Step
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("(a) same with a pre-placed Sprite token: P2 ends turn → P1 goes straight to an open main phase, Sprite alive at BF1, +1 point; and it keeps surviving while LeBlanc stays", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", LEBLANC, "lb")
      .unit(P1, "bf1", SPRITE_TOKEN, "s1")
      .build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.zoneOf("s1")).toBe("battlefield-bf1");
    expect(game.p1.points()).toBe(1);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("s1")).toBe("battlefield-bf1");
    expect(game.p1.points()).toBe(2);
  });

  // ---- (b) an ENEMY Sprite at LeBlanc's battlefield -----------------------------------------------------

  test("(b) 'Your' = LeBlanc's controller's: P2's Sprite at BF1 DOES trigger at the start of P2's Beginning Phase — the item is on the chain under P2's control and P2 holds priority first (may respond)", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", LEBLANC, "lb")
      .unit(P2, "bf1", SPRITE_TOKEN, "s2")
      .hand(P2, POKE, "poke")
      .build();
    await game.p1.endTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "s2", controller: P2, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "poke")).toBe(true); // a real response window
    expect(game.zoneOf("s2")).toBe("battlefield-bf1"); // not dead yet — it is a chain item, not an instant kill
  });

  test("(b) once both pass it resolves: P2's Sprite is killed before P2's scoring; LeBlanc untouched, P2 scores nothing", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", LEBLANC, "lb")
      .unit(P2, "bf1", SPRITE_TOKEN, "s2")
      .build();
    await game.p1.endTurn();
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.locationOf("s2")).toBeUndefined();
    expect(game.p2.units("bf1")).toEqual([]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p2.points()).toBe(0);
    expect(game.zoneOf("lb")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  // ---- (c) base Sprite: uses the chain; point-in-time condition ----------------------------------------

  test("(c) a base is not a battlefield: P1's base Sprite triggers even with LeBlanc on the board — the item is on the chain and P1 may play a Reaction while it is pending; the BF1 Sprite has NO item", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf1", LEBLANC, "lb")
      .unit(P1, "bf1", SPRITE_TOKEN, "s1")
      .unit(P1, "bf2", { might: 1, name: "Anchor" }, "anchor")
      .unit(P1, "base", SPRITE_TOKEN, "sBase")
      .hand(P1, BLINK, "blink")
      .build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sBase", controller: P1, triggered: true })]); // only the base one
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "blink")).toBe(true);
    await game.p1.cast("blink", { targets: "lb", answers: ["bf2"] });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("bf2");
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["sBase", "blink"]);
  });

  test("(c) point-in-time (383.2.c): LeBlanc Blinks bf1→bf2 DURING that Beginning Phase (in response to the base trigger) — the base Sprite still dies, the BF1 Sprite does NOT trigger late this turn and holds BF1; P1 scores BF1 and BF2", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf1", LEBLANC, "lb")
      .unit(P1, "bf1", SPRITE_TOKEN, "s1")
      .unit(P1, "bf2", { might: 1, name: "Anchor" }, "anchor")
      .unit(P1, "base", SPRITE_TOKEN, "sBase")
      .hand(P1, BLINK, "blink")
      .build();
    await game.p2.endTurn();
    await game.p1.cast("blink", { targets: "lb" });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("bf2");
    }
    // Blink resolves (LIFO) …
    await game.acting().passPriority();
    await game.acting().passPriority();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("battlefield-bf2");
    }
    expect(game.locationOf("lb")).toBe("bf2");
    expect(game.chain().map((c) => c.cardId)).toEqual(["sBase"]); // still pending; nothing new was added for s1
    // … then the Temporary item, then scoring.
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.locationOf("sBase")).toBeUndefined(); // killed before scoring
    expect(game.zoneOf("s1")).toBe("battlefield-bf1"); // no retroactive trigger this turn
    expect(game.p1.units("bf1")).toEqual(["s1"]);
    expect(game.p1.points()).toBe(2); // BF1 (Sprite alone) + BF2 (Anchor + LeBlanc)
    expect(game.chain()).toEqual([]);
  });

  test("(c) …and it is only deferred, not forgiven: with LeBlanc now at BF2, the BF1 Sprite triggers at P1's NEXT Beginning Phase and dies before scoring (BF1 then scores nothing)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf1", LEBLANC, "lb")
      .unit(P1, "bf1", SPRITE_TOKEN, "s1")
      .unit(P1, "bf2", { might: 1, name: "Anchor" }, "anchor")
      .unit(P1, "base", SPRITE_TOKEN, "sBase")
      .hand(P1, BLINK, "blink")
      .build();
    await game.p2.endTurn();
    await game.p1.cast("blink", { targets: "lb" });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("bf2");
    }
    await game.settle({ policy: (d) => (d.kind === "pick" ? { keys: [d.options.find((o) => o.key.includes("bf2"))?.key ?? d.options[0]!.key], kind: "pick" } : undefined) });
    await game.settle();
    expect(game.locationOf("lb")).toBe("bf2");
    expect(game.p1.points()).toBe(2);
    await game.advanceTurn(); // → P2
    expect(game.zoneOf("s1")).toBe("battlefield-bf1");
    await game.p2.endTurn(); // → P1's next Beginning Phase
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "s1", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.locationOf("s1")).toBeUndefined();
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p1.points()).toBe(3); // only BF2 held this time
  });

  test("(c) the ordinary way round: LeBlanc Standard-Moves BF1→base in P1's main phase — the Sprite that was protected that morning does not trigger for the rest of the turn, survives P2's turn, and dies at P1's next Beginning Phase", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", LEBLANC, "lb")
      .unit(P1, "bf1", SPRITE_TOKEN, "s1")
      .build();
    await game.advanceTurn(); // P1's turn: suppressed, +1
    expect(game.p1.points()).toBe(1);
    await game.p1.move("lb", "base");
    await game.settle();
    expect(game.locationOf("lb")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("s1")).toBe("battlefield-bf1");
    await game.advanceTurn(); // → P2: still there
    expect(game.zoneOf("s1")).toBe("battlefield-bf1");
    await game.p2.endTurn(); // → P1's next Beginning Phase: LeBlanc is in base, nothing protects BF1
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "s1", triggered: true })]);
    await game.settle();
    expect(game.locationOf("s1")).toBeUndefined();
    expect(game.p1.points()).toBe(1); // killed before scoring → BF1 (now empty) is not held
  });

  test("(c) converse: a Temporary item already on the chain is not undone by LeBlanc arriving — P1's Sprite at BF2 triggers (LeBlanc is at BF1), P1 Blinks LeBlanc to BF2 in response, the item still resolves and the Sprite dies", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf1", LEBLANC, "lb")
      .unit(P1, "bf1", { might: 1, name: "Keep" }, "keep")
      .unit(P1, "bf2", { might: 1, name: "Anchor" }, "anchor")
      .unit(P1, "bf2", SPRITE_TOKEN, "s3")
      .hand(P1, BLINK, "blink")
      .build();
    await game.p2.endTurn();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "s3", controller: P1, triggered: true })]);
    await game.p1.cast("blink", { targets: "lb" });
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("bf2");
    }
    await game.acting().passPriority();
    await game.acting().passPriority();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("battlefield-bf2");
    }
    expect(game.locationOf("lb")).toBe("bf2"); // LeBlanc now shares BF2 with the Sprite…
    expect(game.chain().map((c) => c.cardId)).toEqual(["s3"]); // …but the item is still there
    await game.settle();
    expect(game.locationOf("s3")).toBeUndefined(); // and it resolved: Sprite killed
    expect(game.p1.units("bf2").sort()).toEqual(["anchor", "lb"]);
    expect(game.p1.points()).toBe(2); // BF1 (Keep) + BF2 (Anchor + LeBlanc)
  });
});
