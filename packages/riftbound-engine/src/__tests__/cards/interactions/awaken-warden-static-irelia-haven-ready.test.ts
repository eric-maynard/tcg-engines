/**
 * Interaction: Mageseeker Warden (ogn-070-298 · Unit · Calm · 5 Might)
 *     "While I'm at a battlefield, spells and abilities can't ready enemy units and gear."
 *   × Irelia, Fervent (sfd-057-221 · Champion Unit · Calm · 4 Might)
 *     "[Deflect] … When you choose or ready me, give me +1 [Might] this turn."
 *   × Pirate's Haven (ogn-143-298 · Gear · Body)
 *     "When you ready a friendly unit, give it +1 [Might] this turn."
 *   (probes: On the Hunt sfd-204-221 "Ready your units." — no choosing; Wallop ogn-146-298 "Ready a unit.")
 *
 * Rules: 315.1.b (Awaken: the Turn Player readies all Game Objects they control), 415.3.a (Awaken
 * readying is a READY), 415.3.b (effects/spells may also ready), 415.1.b / 415.1.c (an already-ready
 * object cannot be readied — nothing happens), 054.1 (can't beats can), 383.3.c (triggered
 * abilities go on the chain in any state/phase), 383.3.d (same controller orders simultaneous
 * triggers).
 *
 * Question: P2's Warden sits at bf2. P1: EXHAUSTED Irelia at bf1 (P1 controls bf1), Pirate's Haven
 * exhausted in base, a second unit R in base ALREADY READY, two exhausted runes. P1's turn begins.
 *  (a) Does the Warden stop Awaken from readying Irelia / the Haven / the runes?      → No.
 *  (b) Irelia readies → her own trigger AND the Haven trigger fire; P1 orders them; P2 gets a
 *      reaction window in the Beginning Phase; Irelia is 4 +1 +1 = 6 this turn.
 *  (c) Does the Haven trigger for R (already ready)?                                   → No.
 *  (d) Main Phase, Warden still at bf2: a ready spell on a re-exhausted Irelia → she stays
 *      exhausted, no ready trigger, no Haven (the Warden's text is live — just not vs Awaken).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const WARDEN = "ogn-070-298";
const IRELIA = "sfd-057-221";
const HAVEN = "ogn-143-298";
const ON_THE_HUNT = "sfd-204-221"; // 1 + [rainbow][rainbow] · Ready your units. (chooses nothing)
const WALLOP = "ogn-146-298"; // 2 · Ready a unit. (chooses her)

/** End of P2's turn 2. P1: exhausted Irelia @bf1, exhausted Haven + ready Rick in base, 2 exhausted runes. P2: Warden @bf2. */
function board(opts: { rickExhausted?: boolean } = {}) {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", IRELIA, "irelia", { exhausted: true })
    .unit(P2, "bf2", WARDEN, "warden")
    .gear(P1, HAVEN, "haven", { exhausted: true })
    .unit(P1, "base", { might: 2, name: "Ready Rick" }, "rick", opts.rickExhausted ? { exhausted: true } : undefined)
    .runes(P1, "calm", 2, { exhausted: true });
}

/** P1's Main Phase (turn 3): Irelia exhausted @bf1 (4 Might), Haven ready in base, Warden at `wardenAt`, a ready spell in hand. */
function mainPhase(wardenAt: "bf2" | "base", spell: string) {
  return scenario()
    .turn(3)
    .active(P1)
    .resources(P1, { energy: 2, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", IRELIA, "irelia", { exhausted: true })
    .unit(P2, wardenAt, WARDEN, "warden")
    .gear(P1, HAVEN, "haven")
    .hand(P1, spell, "spell");
}

describe("(a) Awaken is a turn rule, not a spell/ability — the Warden does not stop it (315.1.b, 415.3.a)", () => {
  test("P2 ends the turn → P1's Beginning Phase: Irelia, Pirate's Haven and both runes are READY although the Warden is at bf2", async () => {
    const game = await board().build();
    expect(game.state("irelia")).toMatchObject({ isExhausted: true, might: 4 });
    expect(game.state("haven").isExhausted).toBe(true);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);

    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.locationOf("warden")).toBe("bf2"); // the static's condition is live
    expect(game.state("irelia").isReady).toBe(true);
    expect(game.state("haven").isReady).toBe(true);
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
    expect(game.state("rick").isReady).toBe(true);
  });
});

describe("(b) Irelia's ready fires BOTH triggers; P1 orders them; P2 may react before the Beginning Step continues", () => {
  test("both 'When you … ready me' (Irelia) and 'When you ready a friendly unit' (Haven) are on the chain, both P1's, and P1 holds an ORDER decision naming the two (383.3.d)", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    const names = game.chain().map((c) => c.name);
    expect(names).toContain("Irelia, Fervent");
    expect(names).toContain("Pirate's Haven");
    expect(game.chain().every((c) => c.controller === P1 && c.triggered)).toBe(true);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "order", seat: P1 });
    const items = d?.kind === "order" ? d.items : [];
    expect(items.map((i) => i.card)).toEqual(expect.arrayContaining(["irelia", "haven"]));
  });

  // BUG — expected: exactly TWO triggers. Pirate's Haven says "a friendly UNIT": the Haven itself (gear)
  // and the two runes readying in the same Awaken are not units, and Rick was already ready (415.1.c).
  // Actual: the Awaken ready-all raises Haven's trigger once per readied OBJECT (gear + each rune too),
  // so the chain holds 1 Irelia + 4 Haven items (the extras fizzle on resolution, but they are real
  // chain items P2 is asked to respond to). A spell readying a gear does NOT do this — Awaken-only.
  test("the chain is exactly [Pirate's Haven (for Irelia), Irelia, Fervent] — Haven must not trigger off the gear/runes readying (ogn-143 'friendly unit', 415.3.a)", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    expect(game.chain()).toHaveLength(2);
    expect(game.chain().filter((c) => c.cardId === "haven")).toHaveLength(1);
    const d = game.decision();
    expect(d?.kind === "order" ? d.items : []).toHaveLength(2);
  });

  test("P1 may pick the order explicitly: Irelia bottom, Haven top → Haven's +1 resolves first", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    const d = game.decision();
    const items = d?.kind === "order" ? d.items : [];
    const ireliaKey = items.find((i) => i.card === "irelia")?.key as string;
    const rest = items.filter((i) => i.card !== "irelia").map((i) => i.key);
    await game.p1.order([ireliaKey, ...rest]); // first = bottom … last = top
    expect(game.chain()[0]).toMatchObject({ cardId: "irelia", name: "Irelia, Fervent" });
    expect(game.chain().at(-1)).toMatchObject({ cardId: "haven", name: "Pirate's Haven" });
    // P1 (turn player) holds priority first, still in the Beginning Phase.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.phase()).toBe("beginning");
  });

  test("383.3.c: after P1 passes, P2 receives chain priority IN THE BEGINNING PHASE (its only window before the Beginning Step moves on); nothing has resolved yet", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.acceptTriggerOrder();
    const before = game.chain().length;
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.legal().map((o) => o.verb)).toContain("passPriority");
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toHaveLength(before); // still all pending
    expect(game.state("irelia").might).toBe(4); // no bonus applied before resolution
  });

  test("both resolve → Irelia is 4 +1 (her own) +1 (Haven) = 6 Might for P1's turn; the game settles into P1's Main Phase with an empty chain", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.chain()).toEqual([]);
    expect(game.state("irelia")).toMatchObject({ baseMight: 4, isReady: true, might: 6 });
    // 'this turn': gone once the turn passes.
    await game.advanceTurn();
    expect(game.state("irelia").might).toBe(4);
  });
});

describe("(c) an already-ready unit is not readied by Awaken (415.1.b/c) — no Haven trigger for it", () => {
  test("Rick was READY: he stays 2 Might after the Beginning Phase; contrast — an EXHAUSTED Rick is readied and gets Haven's +1 → 3", async () => {
    const ready = await board().build();
    await ready.p2.endTurn();
    await ready.settle();
    expect(ready.state("rick")).toMatchObject({ isReady: true, might: 2 });

    const tired = await board({ rickExhausted: true }).build();
    await tired.p2.endTurn();
    const d = tired.decision();
    expect((d?.kind === "order" ? d.items : []).map((i) => i.card)).toEqual(expect.arrayContaining(["irelia", "haven"]));
    await tired.settle();
    expect(tired.state("rick")).toMatchObject({ isReady: true, might: 3 });
    expect(tired.state("irelia").might).toBe(6);
  });
});

describe("(d) contrast — in the Main Phase the Warden's text IS live against spells (054.1 can't beats can)", () => {
  test("Warden at bf2: On the Hunt ('Ready your units') resolves but Irelia stays EXHAUSTED — no ready event, so neither her trigger nor the Haven fires; she stays 4", async () => {
    const game = await mainPhase("bf2", ON_THE_HUNT).build();
    await game.p1.cast("spell");
    expect(game.chain().map((c) => c.name)).toEqual(["On the Hunt"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // the spell resolves
    expect(game.chain()).toEqual([]); // nothing triggered behind it
    expect(game.zoneOf("spell")).toBe("trash");
    expect(game.state("irelia")).toMatchObject({ isExhausted: true, might: 4 });
    await game.settle();
    expect(game.state("irelia")).toMatchObject({ isExhausted: true, might: 4 });
  });

  test("control — Warden in P2's BASE (not at a battlefield): the same On the Hunt readies Irelia and both triggers fire → ready, 6 Might", async () => {
    const game = await mainPhase("base", ON_THE_HUNT).build();
    await game.p1.cast("spell");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain().map((c) => c.name).sort()).toEqual(["Irelia, Fervent", "Pirate's Haven"]);
    await game.settle();
    expect(game.state("irelia")).toMatchObject({ isReady: true, might: 6 });
  });

  test("Warden at bf2: Wallop ('Ready a unit') CHOOSES her — the choose half still fires (+1 → 5) but she is not readied: stays exhausted, no second +1, no Haven", async () => {
    const game = await mainPhase("bf2", WALLOP).build();
    await game.p1.cast("spell", { targets: "irelia" });
    // 383.4.b targeting trigger sits above the spell.
    expect(game.chain().map((c) => c.name)).toEqual(["Wallop", "Irelia, Fervent"]);
    await game.settle();
    expect(game.zoneOf("spell")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.state("irelia")).toMatchObject({ isExhausted: true, might: 5 });
    expect(game.violations()).toEqual([]);
  });
});
