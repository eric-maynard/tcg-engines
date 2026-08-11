/**
 * Interaction: Acceleration Gate (ven-150-166) — target lock vs. objects that leave before resolution
 *
 *   Acceleration Gate — Spell · Mind/Body · 3 + [rainbow] · "Ready up to 4 units, gear, and/or runes."
 *   Star-Crossed (unl-128-219) — [Reaction] · Chaos · 3 + [rainbow]
 *       "Return a friendly unit and an enemy unit to their owners' hands."
 *   Retreat (ogn-104-298) — [Reaction] · Mind · 1
 *       "Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted."
 *   Flash (ogs-011-024) — [Reaction] · Chaos · 2 · "Move up to 2 friendly units to base."
 *
 * Rules: 355.5 / 355.7 / 355.8 (targets are chosen in step 2 of PLAYING the spell, only legal ones are
 * offered), 355.13 ("up to N" = 0..N), 355.15 (the choices cannot change after finalization — no re-pick,
 * no top-up, no substitution), 359.3.e.2 / .3 / .4 (a target that has changed zone to or from a NON-board
 * zone is no longer the object that was chosen; a move between board zones is not such a change),
 * 359.3.e.5 (an illegal target is simply unaffected), 359.3.e.8 (the instruction still executes on the
 * legal survivors), 430.2 (readying an already-ready object is a legal no-op).
 *
 * Question — P1's main phase. P1 controls exhausted unit U (3 Might, at bf1), exhausted gear G at base,
 * exhausted runes r1–r4 and a second unit V; P2 controls a unit and holds Star-Crossed. P1 casts the Gate.
 *  (a) When is the set of four picked, and what is offered — only exhausted objects? only friendly ones?
 *      may P1 pick zero?
 *  (b) P1 picks U, G, r1, r2. P2 responds with Star-Crossed returning its own unit AND U to hand; P1
 *      responds by recycling r1 for power and by Retreating V (channelling r5 exhausted). Which objects
 *      ready when the Gate finally resolves?
 *  (c) May P1 top the set back up to four at resolution with r3/r4/r5, or swap the dead picks for live ones?
 *  (d) YES side: if P2 had instead only moved U to base (a board zone), does U still ready?
 *
 * Expected: (a) all four are TARGETS chosen as the spell is played and locked there; the offered pool is
 * every unit, gear and rune on the board — ready or exhausted, friendly or enemy — because the Gate carries
 * neither a "friendly" nor an "exhausted" qualifier; 0–4 picks are legal. (b) U is in a NON-board zone
 * (hand) and r1 in the rune deck, so both are illegal targets and unaffected; G and r2 still ready; r3, r4
 * and the freshly channelled r5 stay exhausted. (c) No — no re-pick, no top-up, no substitution; r5 did not
 * even exist when the choices were made. (d) Yes — base is a board zone, the Gate imposes no location
 * requirement, so U is still a legal target and readies.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GATE = "ven-150-166";
const STAR_CROSSED = "unl-128-219";
const RETREAT = "ogn-104-298";
const FLASH = "ogs-011-024";

/** Flatten the `targets` field of a seat's cast option into the set of card ids offered. */
function targetsOffered(game: Game, seat: "p1" | "p2", alias: string): string[] {
  const field = game[seat].option("cast", alias)?.fields.find((f) => f.name === "targets" || f.arg === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/**
 * P1's main phase. P1: exhausted U (3) at its own bf1, ready V in base, exhausted gear G, exhausted runes
 * r1–r4, pool 6 + [rainbow] (Gate 3+[rainbow], Retreat 1, Flash 2). P2: a unit in base, Star-Crossed and 3 + [chaos].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { rainbow: 1 } })
    .resources(P2, { energy: 3, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Vanguard" }, "U", { exhausted: true })
    .unit(P1, "base", { might: 2, name: "Runner" }, "V")
    .gear(P1, { cardType: "gear", name: "Trinket" }, "G", { exhausted: true })
    .rune(P1, "mind", { alias: "r1", exhausted: true })
    .rune(P1, "mind", { alias: "r2", exhausted: true })
    .rune(P1, "body", { alias: "r3", exhausted: true })
    .rune(P1, "body", { alias: "r4", exhausted: true })
    .unit(P2, "base", { might: 2, name: "Consort" }, "theirUnit")
    .hand(P1, GATE, "gate")
    .hand(P1, RETREAT, "retreat")
    .hand(P1, FLASH, "flash")
    .hand(P2, STAR_CROSSED, "sc");
}

const PICKED = ["U", "G", "r1", "r2"] as const;

describe("Acceleration Gate — targets locked at play time; only a NON-board zone change kills one", () => {
  // ── (a) when the four are picked, and out of what ──────────────────────────────────────────

  test("(a) the four are TARGETS of the play: they are named on the cast and ride the chain item, and nothing is asked afterwards (355.5 / 355.7)", async () => {
    const game = await board().build();
    await game.p1.cast("gate", { targets: [...PICKED] });
    expect(game.zoneOf("gate")).toBe("chain");
    expect(game.chain()).toHaveLength(1);
    expect(new Set(game.chain()[0]?.targets ?? [])).toEqual(new Set(PICKED));
    // no follow-up prompt: P1 simply holds priority on its own chain item
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { rainbow: 0 } });
  });

  test("(a) the offered pool is EVERY unit, gear and rune on the board — exhausted or ready, friendly or enemy (the Gate has no such qualifier); the Gate itself and the battlefield are not offered", async () => {
    const game = await board().build();
    const offered = targetsOffered(game, "p1", "gate");
    for (const id of ["U", "G", "r1", "r2", "r3", "r4"]) {
      expect(offered).toContain(id); // exhausted friendlies
    }
    expect(offered).toContain("V"); // a READY friendly unit — readying it is a legal no-op (430.2)
    expect(offered).toContain("theirUnit"); // an ENEMY unit
    expect(offered).not.toContain("gate");
    expect(offered).not.toContain("bf1");
  });

  test("(a) readying an ALREADY-READY object is legal and a no-op (430.2): the Gate may be cast naming ready V and it resolves with V still ready", async () => {
    const game = await board().build();
    expect(game.state("V").isReady).toBe(true);
    await game.p1.cast("gate", { targets: ["V", "r1"] });
    await game.settle();
    expect(game.state("V").isReady).toBe(true);
    expect(game.state("r1").isReady).toBe(true);
    expect(game.zoneOf("gate")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("(a) 'up to 4' means 0–4 (355.13): casting with ZERO targets is legal and readies nothing; a FIFTH pick is refused", async () => {
    const zero = await board().build();
    await zero.p1.cast("gate", { targets: [] });
    await zero.settle();
    expect(zero.zoneOf("gate")).toBe("trash");
    for (const r of ["r1", "r2", "r3", "r4"]) {
      expect(zero.state(r).isExhausted).toBe(true);
    }
    expect(zero.state("U").isExhausted).toBe(true);
    expect(zero.state("G").isExhausted).toBe(true);

    const five = await board().build();
    const r = await five.p1.try((p) => p.cast("gate", { targets: ["U", "G", "r1", "r2", "r3"] }));
    expect(r.ok).toBe(false);
    expect(five.zoneOf("gate")).toBe("hand");
  });

  // ── (b) two of the four leave the board before resolution ──────────────────────────────────

  /**
   * Chain (bottom→top): Gate, Star-Crossed, Retreat. LIFO: Retreat (V → hand, P1 channels r5 exhausted),
   * then Star-Crossed (theirUnit and U → hands), then the Gate.
   */
  async function playTheChain(game: Game): Promise<string> {
    await game.p1.cast("gate", { targets: [...PICKED] });
    await game.p1.passPriority();
    await game.p2.cast("sc", { targets: ["theirUnit", "U"] });
    await game.p2.passPriority();
    await game.p1.recycleRune("r1"); // r1 leaves the board for the rune deck, +1 power
    const runesBefore = new Set(game.p1.runes());
    await game.p1.cast("retreat", { targets: "V" });
    await game.settle();
    const fresh = game.p1.runes().filter((r) => !runesBefore.has(r));
    expect(fresh).toHaveLength(1); // the rune Retreat made P1 channel
    return fresh[0] as string;
  }

  test("(b) premise: all three spells resolve — U and theirUnit and V go to hand, r1 goes to the rune deck, and Retreat channels a fresh EXHAUSTED rune", async () => {
    const game = await board().build();
    const r5 = await playTheChain(game);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("U")).toBe("hand");
    expect(game.zoneOf("theirUnit")).toBe("hand");
    expect(game.zoneOf("V")).toBe("hand");
    expect(game.zoneOf("r1")).toBe("runeDeck");
    expect(game.state(r5).isExhausted).toBe(true);
    expect(game.zoneOf("gate")).toBe("trash");
    expect(game.zoneOf("sc")).toBe("trash");
    expect(game.zoneOf("retreat")).toBe("trash");
  });

  test("(b) the SURVIVORS still ready — G and r2 (359.3.e.8) — while U (hand) and r1 (rune deck) are illegal targets and simply unaffected (359.3.e.2 / .4 / .5)", async () => {
    const game = await board().build();
    await playTheChain(game);
    expect(game.state("G").isReady).toBe(true);
    expect(game.state("r2").isReady).toBe(true);
    // U is in hand: a hand card has no ready/exhausted state to change, and it was never readied on the board
    expect(game.zoneOf("U")).toBe("hand");
    expect(game.zoneOf("r1")).toBe("runeDeck");
    expect(game.violations()).toEqual([]);
  });

  test("(b) the unchosen runes stay exhausted: r3, r4 and the freshly channelled r5 are untouched", async () => {
    const game = await board().build();
    const r5 = await playTheChain(game);
    expect(game.state("r3").isExhausted).toBe(true);
    expect(game.state("r4").isExhausted).toBe(true);
    expect(game.state(r5).isExhausted).toBe(true);
    expect(new Set(game.p1.runes({ ready: true }))).toEqual(new Set(["r2"]));
  });

  // ── (c) no re-pick, no top-up, no substitution ─────────────────────────────────────────────

  test("(c) the locked set never changes (355.15): the chain item still names all four while the reactions resolve, and the Gate's own resolution asks P1 nothing", async () => {
    const game = await board().build();
    await game.p1.cast("gate", { targets: [...PICKED] });
    await game.p1.passPriority();
    await game.p2.cast("sc", { targets: ["theirUnit", "U"] });
    await game.p2.passPriority();
    await game.p1.recycleRune("r1");
    await game.p1.cast("retreat", { targets: "V" });
    // the Gate is still the bottom item and still names the same four objects
    const gateItem = game.chain().find((c) => c.cardId === "gate");
    expect(new Set(gateItem?.targets ?? [])).toEqual(new Set(PICKED));

    const stop = await game.settle();
    expect(stop.reason).toBe("open"); // never parked on a re-choose / top-up prompt
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(c) exactly ONE object readies out of a four-target Gate when three of the picks are dead or ready-already — no substitute is chosen for them", async () => {
    const game = await board().build();
    // U (→hand), r1 (→rune deck) die; V is picked while READY so its readying is a no-op
    await game.p1.cast("gate", { targets: ["U", "r1", "V", "r2"] });
    await game.p1.passPriority();
    await game.p2.cast("sc", { targets: ["theirUnit", "U"] });
    await game.p2.passPriority();
    await game.p1.recycleRune("r1");
    await game.settle();
    expect(new Set(game.p1.runes({ ready: true }))).toEqual(new Set(["r2"]));
    expect(game.state("G").isExhausted).toBe(true); // never chosen — no top-up from the survivors
    expect(game.state("r3").isExhausted).toBe(true);
    expect(game.state("r4").isExhausted).toBe(true);
  });

  // ── (d) YES side — a move between BOARD zones keeps the target alive ───────────────────────

  test("(d) U moved to BASE by Flash before the Gate resolves is still the object that was chosen — it readies (359.3.e.3 / .4)", async () => {
    const game = await board().build();
    await game.p1.cast("gate", { targets: [...PICKED] });
    await game.p1.cast("flash", { targets: "U" }); // P1 holds priority and stacks its own reaction
    expect(game.chain().map((c) => c.cardId)).toEqual(["gate", "flash"]);
    await game.settle();
    expect(game.zoneOf("gate")).toBe("trash");
    expect(game.locationOf("U")).toBe("base"); // a board zone — no 359.3.e.2 zone change
    expect(game.state("U").isReady).toBe(true);
    expect(game.state("G").isReady).toBe(true);
    expect(game.state("r1").isReady).toBe(true);
    expect(game.state("r2").isReady).toBe(true);
    expect(game.state("r3").isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("(d) contrast in one board: same Gate, same U — moved to base U readies, returned to hand it does not", async () => {
    const moved = await board().build();
    await moved.p1.cast("gate", { targets: ["U"] });
    await moved.p1.cast("flash", { targets: "U" });
    await moved.settle();
    expect(moved.zoneOf("U")).toBe("base");
    expect(moved.state("U").isReady).toBe(true);

    const bounced = await board().build();
    await bounced.p1.cast("gate", { targets: ["U"] });
    await bounced.p1.cast("retreat", { targets: "U" });
    await bounced.settle();
    expect(bounced.zoneOf("U")).toBe("hand");
    expect(bounced.zoneOf("gate")).toBe("trash");
  });
});
