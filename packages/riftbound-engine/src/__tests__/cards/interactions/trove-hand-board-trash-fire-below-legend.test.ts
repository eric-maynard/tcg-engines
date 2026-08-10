/**
 * Interaction: Treasure Trove (ogn-186-298) · Gear · Chaos · 2
 *     "When this leaves the board, draw 1 and channel 1 rune exhausted. [chaos], [Exhaust]: Kill this."
 *   × Pack of Wonders (ogn-181-298) · Gear · Chaos · 2
 *     "[Exhaust]: Return another friendly gear, unit, or facedown card to its owner's hand."
 *   × Fire Below the Mountain (sfd-189-221) · Legend (Ornn)
 *     "[Exhaust]: [Reaction] — [Add] [rainbow]. Use only to play gear or use gear abilities."
 *
 * Board: P1's turn, Neutral Open. P1's pool has ENERGY but NO POWER. Trove + Pack ready on the board, a
 * second Trove in P1's HAND, a third Trove in P1's TRASH. P2 holds a cheap Action spell for (f).
 *
 * Question / rules:
 *   (a) 380 — activated abilities of permanents are usable only while the object is ON THE BOARD: of the
 *       three Troves only the board copy's "[chaos], [Exhaust]: Kill this" may be enumerated; the hand copy's
 *       only action is "play this card", the trash copy has none.
 *   (b) 174.8 → 376 — a Legend's activated ability is used from the Legend Zone; listed for P1 only.
 *   (c) 429.2 / 429.2.a — Fire Below is a [Reaction] [Add]: it resolves on activation, no chain item,
 *       priority stays. Its rainbow is earmarked "gear / gear abilities"; paying the Trove's [chaos] pip with
 *       it is "using a gear ability" (166.1: rainbow pays any domain). 404.1: [chaos] + Exhaust paid on
 *       activation → chain item → P2's window (406.4) → resolves: Trove killed → leave-board trigger is a
 *       NEW chain item (P2 window again) → draw 1 + channel 1 rune exhausted.
 *       DESIGN (DESIGN.md §Paying costs): paying is manual / pool-only, so the kill ability is listed only
 *       once the legend's rainbow is actually in the pool (no 357.1.a / 429.3 mid-payment Add).
 *   (d) Pack returns the board Trove to hand: that IS leaving the board → trigger fires. In hand the kill
 *       ability is absent (380) despite the floating rainbow; the rainbow can still go toward gear (replay
 *       the Trove — energy from pool — and then its ability is listed again); unspent it empties (317.2.d).
 *   (e) The killed Trove in the trash has no listed ability (380).
 *   (f) P2's turn, P2 plays a spell, P1 has Closed-state priority: the board Trove's untagged ability is
 *       ABSENT (381); Fire Below's [Reaction] Add is timing-legal (813.1.c.2) but its rainbow has nothing
 *       legal to buy. Nothing of P1's is ever listed for P2.
 */
import { describe, expect, test } from "bun:test";
import type { Game, SeatHandle } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TREASURE_TROVE = "ogn-186-298";
const PACK_OF_WONDERS = "ogn-181-298";
const FIRE_BELOW = "sfd-189-221";

/** P2's probe spell for (f): 1-cost Action "draw 1". */
const SPARK = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Spark",
  rulesText: "Draw 1.",
  timing: "action",
} as const;

/** Printed ability indices: Trove #0 = leave-board trigger, #1 = "[chaos],[Exhaust]: Kill this"; Pack / legend #0. */
const TROVE_KILL = 1;

function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 2 })
    .legend(P1, FIRE_BELOW, "fireBelow")
    .gear(P1, TREASURE_TROVE, "troveBoard")
    .gear(P1, PACK_OF_WONDERS, "pack")
    .hand(P1, TREASURE_TROVE, "troveHand")
    .trash(P1, TREASURE_TROVE, "troveTrash")
    .hand(P2, SPARK, "spark");
}

const keys = (seat: SeatHandle): string[] => seat.legal().map((o) => o.key);
/** Every option key of `seat` that mentions `card` at all (activate / play / anything). */
const keysFor = (seat: SeatHandle, card: string): string[] => keys(seat).filter((k) => k.includes(card));
const gearRainbow = (game: Game): number =>
  ((game.gameState as { restrictedPower?: Record<string, { gear?: { rainbow?: number } }> }).restrictedPower?.[P1]?.gear?.rainbow) ?? 0;

describe("Treasure Trove in hand / on board / in trash × Pack of Wonders × Fire Below the Mountain", () => {
  // ─────────────────────────────── (a) zone probe, rule 380 ───────────────────────────────

  test("(a) with no power in the pool: the hand Trove's ONLY option is 'play', the trash Trove has NONE, and no Trove anywhere lists an activated ability (380 + pool-only affordability)", async () => {
    const game = await board().build();
    expect(keysFor(game.p1, "troveHand")).toEqual(["playGear:troveHand"]);
    expect(keysFor(game.p1, "troveTrash")).toEqual([]);
    expect(keys(game.p1).filter((k) => k.startsWith("activateAbility:trove"))).toEqual([]);
    expect(game.p1.can("activate", "troveBoard")).toBe(false); // no [chaos]/rainbow yet — see (c)
  });

  test("(a) once a rainbow IS in the pool, exactly ONE Trove ability is enumerated — the BOARD copy's; hand and trash copies stay absent even though they are 'ready' and the cost is describable (380)", async () => {
    const game = await board().build();
    await game.p1.activate("fireBelow");
    expect(game.p1.power("rainbow")).toBe(1);
    expect(keys(game.p1).filter((k) => k.startsWith("activateAbility:trove"))).toEqual([`activateAbility:troveBoard#${TROVE_KILL}`]);
    expect(keysFor(game.p1, "troveHand")).toEqual(["playGear:troveHand"]);
    expect(keysFor(game.p1, "troveTrash")).toEqual([]);
    for (const off of ["troveHand", "troveTrash"]) {
      const r = await game.p1.try((p) => p.activate(off, TROVE_KILL));
      expect(r.ok).toBe(false);
    }
    expect(game.p1.power("rainbow")).toBe(1); // nothing was paid by the rejected attempts
    expect(game.zoneOf("troveHand")).toBe("hand");
    expect(game.zoneOf("troveTrash")).toBe("trash");
  });

  // ─────────────────────────────── (b) legend zone, 174.8 / 376 ───────────────────────────────

  test("(b) the legend sits in the Legend Zone (not the board) yet its activated ability IS enumerated for P1 — and never for P2 (174.8 → 376)", async () => {
    const game = await board().build();
    expect(game.zoneOf("fireBelow")).toBe("legendZone");
    expect(game.p1.legend()).toBe("fireBelow");
    expect(game.p1.can("activate", "fireBelow")).toBe(true);
    expect(keysFor(game.p1, "fireBelow")).toEqual(["activateAbility:fireBelow#0"]);
    expect(keysFor(game.p2, "fireBelow")).toEqual([]);
    const r = await game.p2.try((p) => p.activate("fireBelow", 0));
    expect(r.ok).toBe(false);
    expect(game.state("fireBelow").isReady).toBe(true);
  });

  // ─────────────────────────────── (c) Fire Below → Trove kill ───────────────────────────────

  test("(c) DESIGN: with 0 power the board Trove's kill ability is NOT listed until the rainbow is in the pool (manual payment — no 429.3 mid-payment Add); exhausting Fire Below lists it at once", async () => {
    // DESIGN (DESIGN.md §Paying costs): activations are offered only when the CURRENT pool covers the cost.
    const game = await board().build();
    expect(game.p1.can("activate", "troveBoard")).toBe(false);
    await game.p1.activate("fireBelow");
    expect(game.p1.can("activate", "troveBoard")).toBe(true);
    expect(game.p1.option("activate", "troveBoard")?.key).toBe(`activateAbility:troveBoard#${TROVE_KILL}`);
  });

  test("(c) Fire Below: legend exhausted, +1 rainbow earmarked for gear IMMEDIATELY, no chain item, P1 still in its own Open main phase (429.2 / 429.2.a)", async () => {
    const game = await board().build();
    await game.p1.activate("fireBelow");
    expect(game.state("fireBelow").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 1 } });
    expect(gearRainbow(game)).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(keys(game.p2)).toEqual([]); // P2 never got a window against the Add
  });

  test("(c) activating the board Trove: the earmarked rainbow pays the [chaos] pip and the Trove exhausts AS THE COST (404.1); one non-triggered ability item on the chain, Trove still on the board, P1 holds priority first", async () => {
    const game = await board().build();
    await game.p1.activate("fireBelow");
    await game.p1.activate("troveBoard", TROVE_KILL);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 0 } });
    expect(game.state("troveBoard").isExhausted).toBe(true);
    expect(game.zoneOf("troveBoard")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "troveBoard", controller: P1, triggered: false })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  // Expected: the "gear only" earmark rides on THAT rainbow (166.1 / 444.1) — once it is removed from the pool to
  // pay the Trove's [chaos] pip the earmark is gone with it, so a later ORDINARY rainbow pays anything (here an
  // inline 0 + [fury] non-gear spell). Actual: `restrictedPower[P1].gear.rainbow` stays 1 after the payment, and the
  // next unrestricted rainbow that enters the pool is treated as gear-only (the spell is refused) until end of turn.
  test("spending the earmarked rainbow on a gear ability must consume the earmark — a later ordinary rainbow is unrestricted (166.1, 444.1)", async () => {
    const furySpell = {
      abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
      cardType: "spell",
      domain: "fury",
      energyCost: 0,
      name: "Fury Spark",
      powerCost: ["fury"],
      timing: "action",
    } as const;
    const game = await board().hand(P1, furySpell, "furySpark").build();
    await game.p1.activate("fireBelow");
    expect(game.p1.can("cast", "furySpark")).toBe(false); // correct: the gear rainbow can't buy a spell
    await game.p1.activate("troveBoard", TROVE_KILL);
    await game.settle();
    expect(game.p1.power("rainbow")).toBe(0);
    expect(gearRainbow(game)).toBe(0);
    await game.p1.do("addResources", { power: { rainbow: 1 } }); // an ordinary, unrestricted rainbow
    expect(game.p1.can("cast", "furySpark")).toBe(true);
  });

  test("(c) P2 gets a Reaction window on the kill ability (406.4) — P2 sees only its own pass/concede, nothing of P1's", async () => {
    const game = await board().build();
    await game.p1.activate("fireBelow");
    await game.p1.activate("troveBoard", TROVE_KILL);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(keys(game.p2).some((k) => k.includes("trove") || k.includes("pack") || k.includes("fireBelow"))).toBe(false);
    expect(game.p2.can("cast", "spark")).toBe(false); // an [Action] spell has no business in a Closed state on P1's turn
  });

  test("(c) resolution: the Trove is killed (board → owner's trash) and its 'leaves the board' trigger becomes a NEW chain item — hand/runes unchanged yet, P2 gets a window on it too", async () => {
    const game = await board().build();
    const hand = game.p1.hand().length;
    await game.p1.activate("fireBelow");
    await game.p1.activate("troveBoard", TROVE_KILL);
    await game.p1.passPriority();
    await game.p2.passPriority(); // kill resolves
    expect(game.zoneOf("troveBoard")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "troveBoard", controller: P1, triggered: true })]);
    expect(game.p1.hand()).toHaveLength(hand);
    expect(game.p1.runes()).toHaveLength(0);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("(c) full sequence settles to: Trove in trash, P1 drew 1, channeled 1 rune EXHAUSTED, legend exhausted, pool 2 energy / 0 rainbow, back to P1's Open main phase", async () => {
    const game = await board().build();
    const hand = game.p1.hand().length;
    const runeDeck = game.p1.runeDeck().length;
    await game.p1.activate("fireBelow");
    await game.p1.activate("troveBoard", TROVE_KILL);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("troveBoard")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    expect(game.p1.runeDeck()).toHaveLength(runeDeck - 1);
    expect(game.state("fireBelow").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 0 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // ─────────────────────────────── (d) Pack of Wonders bounce ───────────────────────────────

  test("(d) Pack of Wonders offers the board Trove (not itself, not the hand/trash copies); activating exhausts the Pack as the cost and puts a targeted item on the chain with a P2 window", async () => {
    const game = await board().build();
    await game.p1.activate("fireBelow");
    const offered = (game.p1.option("activate", "pack")?.fields.find((f) => f.name === "targets")?.options ?? []) as string[][];
    expect(offered.map((o) => o[0]).sort()).toEqual(["troveBoard"]);
    await game.p1.activate("pack", 0, { targets: "troveBoard" });
    expect(game.state("pack").isExhausted).toBe(true);
    expect(game.p1.power("rainbow")).toBe(1); // [Exhaust] only — the rainbow is untouched
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "pack", targets: ["troveBoard"], triggered: false })]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("(d) on resolution the Trove returns to P1's HAND — that is leaving the board, so the draw-1/channel-1 trigger fires as its own chain item and resolves", async () => {
    const game = await board().build();
    const hand = game.p1.hand().length;
    const runeDeck = game.p1.runeDeck().length;
    await game.p1.activate("fireBelow");
    await game.p1.activate("pack", 0, { targets: "troveBoard" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Pack resolves
    expect(game.zoneOf("troveBoard")).toBe("hand");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "troveBoard", triggered: true })]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(hand + 1 + 1); // the Trove itself + the drawn card
    expect(game.p1.hand()).toContain("troveBoard");
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    expect(game.p1.runeDeck()).toHaveLength(runeDeck - 1);
  });

  test("(d) once in hand the Trove's kill ability is ABSENT even though the gear-earmarked rainbow is still floating (380); its only option is 'play' — same as the other hand copy", async () => {
    const game = await board().build();
    await game.p1.activate("fireBelow");
    await game.p1.activate("pack", 0, { targets: "troveBoard" });
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 1 } });
    expect(gearRainbow(game)).toBe(1);
    expect(keysFor(game.p1, "troveBoard")).toEqual(["playGear:troveBoard"]);
    expect(keysFor(game.p1, "troveHand")).toEqual(["playGear:troveHand"]);
    expect(keys(game.p1).filter((k) => k.startsWith("activateAbility:"))).toEqual([]); // Pack + legend exhausted, no gear ability left
    const r = await game.p1.try((p) => p.activate("troveBoard", TROVE_KILL));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("troveBoard")).toBe("hand");
  });

  test("(d) what the rainbow CAN still do: replay the Trove (2 energy from the pool, no pip → rainbow kept), and the moment it is back on the board its kill ability is listed again and the rainbow pays for it", async () => {
    const game = await board().build();
    await game.p1.activate("fireBelow");
    await game.p1.activate("pack", 0, { targets: "troveBoard" });
    await game.settle();
    await game.p1.play("troveBoard");
    await game.settle();
    expect(game.zoneOf("troveBoard")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(game.p1.can("activate", "troveBoard")).toBe(true);
    await game.p1.activate("troveBoard", TROVE_KILL);
    expect(game.p1.power("rainbow")).toBe(0);
    await game.settle();
    expect(game.zoneOf("troveBoard")).toBe("trash");
  });

  test("(d) left unspent, the earmarked rainbow empties at end of turn (317.2.d) — earmark and all", async () => {
    const game = await board().build();
    await game.p1.activate("fireBelow");
    await game.p1.activate("pack", 0, { targets: "troveBoard" });
    await game.settle();
    expect(game.p1.power("rainbow")).toBe(1);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(gearRainbow(game)).toBe(0);
  });

  // ─────────────────────────────── (e) trash, rule 380 ───────────────────────────────

  test("(e) after (c) the killed Trove is in the trash and lists nothing — even with a fresh rainbow in the pool (380)", async () => {
    const game = await board().resources(P1, { energy: 2, power: { chaos: 1 } }).build();
    await game.p1.activate("troveBoard", TROVE_KILL); // paid with the real chaos
    await game.settle();
    expect(game.zoneOf("troveBoard")).toBe("trash");
    await game.p1.activate("fireBelow"); // a rainbow that COULD pay [chaos]
    expect(game.p1.power("rainbow")).toBe(1);
    expect(keysFor(game.p1, "troveBoard")).toEqual([]);
    expect(keysFor(game.p1, "troveTrash")).toEqual([]);
    const r = await game.p1.try((p) => p.activate("troveBoard", TROVE_KILL));
    expect(r.ok).toBe(false);
  });

  // ─────────────────────────────── (f) P2's turn ───────────────────────────────

  test("(f) P2's turn, Neutral Open: P1 has no menu at all; P2's menu never contains any of P1's objects", async () => {
    const game = await board().active(P2).resources(P1, { energy: 2, power: { chaos: 1 } }).build();
    expect(game.turnPlayer()).toBe(P2);
    expect(keys(game.p1)).toEqual([]);
    expect(keys(game.p2).some((k) => k.includes("trove") || k.includes("pack") || k.includes("fireBelow"))).toBe(false);
  });

  test("(f) P2 plays a spell → P1 gets Closed-state priority: the board Trove's untagged ability is ABSENT even with [chaos] in the pool (381), Pack likewise; Fire Below's [Reaction] Add IS listed (813.1.c.2)", async () => {
    const game = await board().active(P2).resources(P1, { energy: 2, power: { chaos: 1 } }).build();
    await game.p2.cast("spark");
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(keysFor(game.p1, "troveBoard")).toEqual([]);
    expect(keysFor(game.p1, "pack")).toEqual([]);
    expect(game.p1.can("activate", "fireBelow")).toBe(true);
  });

  test("(f) if P1 does crack Fire Below there: +1 gear rainbow at once, chain unchanged, P1 keeps priority — and there is NOTHING legal to spend it on (no Reaction gear in hand, gear abilities barred by 381); it expires at end of P2's turn", async () => {
    const game = await board().active(P2).resources(P1, { energy: 2, power: { chaos: 1 } }).build();
    await game.p2.cast("spark");
    await game.p2.passPriority();
    await game.p1.activate("fireBelow");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 1, rainbow: 1 } });
    expect(game.chain().map((i) => i.cardId)).toEqual(["spark"]);
    expect(game.actingSeat()).toBe(P1);
    expect(keys(game.p1).sort()).toEqual(["concede:-", "passChainPriority:-"]);
    await game.settle(); // Spark resolves; back to P2's Open main phase
    expect(keys(game.p1)).toEqual([]); // Neutral Open on P2's turn: still nothing for P1
    await game.advanceTurn(); // P2 ends → P1's turn
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.power("rainbow")).toBe(0);
    expect(gearRainbow(game)).toBe(0);
  });

  test("(f) throughout P2's chain nothing of P1's is listed for P2 — not while P2 holds priority, not after P1 cracks the legend", async () => {
    const game = await board().active(P2).resources(P1, { energy: 2, power: { chaos: 1 } }).build();
    const p1Stuff = (): boolean => keys(game.p2).some((k) => k.includes("trove") || k.includes("pack") || k.includes("fireBelow"));
    await game.p2.cast("spark");
    expect(game.actingSeat()).toBe(P2);
    expect(p1Stuff()).toBe(false);
    await game.p2.passPriority();
    await game.p1.activate("fireBelow");
    await game.p1.passPriority(); // Spark resolves (P2 had already passed)
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(p1Stuff()).toBe(false);
    const r = await game.p2.try((p) => p.activate("troveBoard", TROVE_KILL));
    expect(r.ok).toBe(false);
  });
});
