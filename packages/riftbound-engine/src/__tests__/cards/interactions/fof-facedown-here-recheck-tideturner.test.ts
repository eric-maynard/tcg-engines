/**
 * Interaction: Fight or Flight (ogn-168-298) · Spell · Chaos · 2 · [Hidden] [Action]
 *     "Move a unit from a battlefield to its base."
 *   × Tideturner (ogn-199-298) · Unit · Chaos · 2 · 2 Might · [Hidden]
 *     "When you play me, you may choose a unit you control at another location. Move me to its location and
 *      it to my original location."
 *
 * Position: P2's turn. P1 controls bf1 with Defender A (3) and a Fight or Flight facedown there since P1's last
 * turn; P1 also holds a second Fight or Flight (2 energy in pool). P2 controls bf2 with unit B and a facedown
 * Tideturner at bf2. P2's E (5) attacks bf1 → combat showdown; P2 passes Focus to P1.
 *
 * Question / expected ruling:
 *   (a) P1 flips the facedown FoF: [Reaction] gained (811.6) → legal in the showdown on P2's turn; cost 0
 *       (811.1.b). 811.1.d.2 → every target from options AT bf1: legal = {E, A}; B (bf2) and base units are not.
 *       With no unit at bf1 it could not be flipped at all (811.1.d).
 *   (b) P2 responds by flipping Tideturner at bf2 (Reaction via Hidden; enters at bf2, 811.1.d.1; "another
 *       location" is 811.1.d.2's named exception → E at bf1 is a legal partner). Swap resolves first: TT → bf1,
 *       E → bf2. FoF then resolves: for a spell played from Hidden the 'at that battlefield' lock is part of target
 *       legality and is re-checked on resolution — 359.3.e.5's own Hidden Blade × Tideturner example — so E is NOT
 *       moved; FoF still counts as played and goes to P1's trash (359.3.e.10, 359.3.d).
 *   (c) Contrast: the HAND copy ([Action], legal once P1 holds Focus; cost 2; no here-lock, 811.3) on E with the
 *       identical Tideturner response: E only moved bf1 → bf2 (board → board, 359.3.e.2/.e.4) and is still 'a unit
 *       at a battlefield' → legal → E goes to P2's base. Same text, opposite result, purely by play origin.
 *   (d) Aftermath of (b): Tideturner is at bf1 mid-combat and takes P2's designation, Attacker (323.2.a); E at bf2
 *       loses Attacker (323.2.c); the showdown at bf1 continues (A 3 vs Tideturner 2); when the chain empties Focus
 *       passes (346 / 347.1.b).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIGHT_OR_FLIGHT = "ogn-168-298";
const TIDETURNER = "ogn-199-298";

/**
 * P2's turn.  bf1 (P1): Defender A (3) + facedown Fight or Flight.   bf2 (P2): Unit B (2) + facedown Tideturner.
 * P1 base: a 1-Might homebody; P1 hand: Fight or Flight; P1 pool: exactly 2 energy.
 * P2 base: Attacker E (5, ready) + a 1-Might homebody.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Defender A" }, "aa")
    .unit(P1, "base", { might: 1, name: "P1 Homebody" }, "p1home")
    .facedown(P1, "bf1", FIGHT_OR_FLIGHT, "fof")
    .hand(P1, FIGHT_OR_FLIGHT, "fofHand")
    .unit(P2, "bf2", { might: 2, name: "Unit B" }, "bb")
    .facedown(P2, "bf2", TIDETURNER, "tt")
    .unit(P2, "base", { might: 5, name: "Attacker E" }, "ee")
    .unit(P2, "base", { might: 1, name: "P2 Homebody" }, "p2home");
}

const showdown = (game: Game) => {
  const top = game.gameState.interaction?.showdownStack?.at(-1);
  return top?.active ? top : undefined;
};

/** Card ids offered by the current pick prompt (empty if the decision is not a pick). */
function pickOffered(game: Game): string[] {
  const d = game.decision();
  return d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
}

/** E attacks bf1; P2 (attacker, Focus) passes → P1 holds Focus in the combat showdown. */
async function p1HasFocus(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("ee", "bf1");
  expect(game.gameState.battlefields.bf1?.contested).toBe(true);
  expect(showdown(game)?.focusPlayer).toBe(P2);
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

/** P1 plays Fight or Flight on E — from facedown (`flip`) or from hand — and passes priority to P2. */
async function fofOnE(game: Game, origin: "flip" | "hand"): Promise<void> {
  if (origin === "flip") {
    await game.p1.reveal("fof");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    await game.p1.pick("ee");
  } else {
    await game.p1.cast("fofHand", { targets: "ee" });
  }
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
}

/** P2 flips Tideturner at bf2, accepts the swap with E, and both pass so the swap (top item) resolves. */
async function tideturnerSwapsWithE(game: Game): Promise<void> {
  await game.p2.reveal("tt");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, timing: "FIN", source: { cardId: "tt" } });
  await game.p2.yes();
  const d = game.decision();
  if (d?.kind === "pick" && d.semantics === "target") {
    await game.p2.pick("ee");
  }
  await game.p2.passPriority();
  await game.p1.passPriority(); // Tideturner's trigger resolves (LIFO)
}

/** Both pass again → Fight or Flight (now the only item) resolves. */
async function resolveFof(game: Game): Promise<void> {
  await game.acting().passPriority();
  await game.acting().passPriority();
  expect(game.chain()).toEqual([]);
}

describe("(a) the facedown Fight or Flight flipped inside the combat showdown on P2's turn", () => {
  test("legal only once P1 holds Focus (Reaction via 811.6 still needs Focus/priority); it costs 0 and opens a chain (811.1.b, 811.1.c.3)", async () => {
    const game = await board().build();
    await game.p2.move("ee", "bf1");
    expect(game.p1.can("reveal", "fof")).toBe(false);
    await game.p2.passFocus();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.can("reveal", "fof")).toBe(true);
    await game.p1.reveal("fof");
    expect(game.p1.resources()).toEqual({ energy: 2, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fof", controller: P1, triggered: false, type: "spell" })]);
  });

  test("targets are chosen as it is played and ONLY from units at bf1: exactly {E, A} — not B at bf2, not either base unit (811.1.d.2); naming B is refused", async () => {
    const game = await p1HasFocus();
    await game.p1.reveal("fof");
    expect(game.decision()).toMatchObject({ kind: "pick", min: 1, max: 1, seat: P1, timing: "FIN" });
    expect(new Set(pickOffered(game))).toEqual(new Set(["ee", "aa"]));
    for (const illegal of ["bb", "p1home", "p2home"]) {
      const r = await game.p1.try((p) => p.pick(illegal));
      expect(r.ok).toBe(false);
    }
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("ee");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fof", targets: ["ee"] })]);
  });

  test("own defender A is a legal (if odd) choice too: A goes to P1's base for free", async () => {
    const game = await p1HasFocus();
    await game.p1.reveal("fof");
    await game.p1.pick("aa");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("aa")).toBe("base");
    expect(game.state("aa").owner).toBe(P1);
    expect(game.p1.units("base")).toContain("aa");
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.p1.energy()).toBe(2);
  });

  test("NO side (811.1.d): with no unit at bf1 the facedown Fight or Flight cannot be flipped at all — a unit at ANOTHER battlefield or in a base does not help; one unit at bf1 makes it legal", async () => {
    // P1's own turn, Open State, so timing/priority is not the obstacle — only the target set is.
    const empty = await scenario()
      .turn(3)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .facedown(P1, "bf1", FIGHT_OR_FLIGHT, "fof")
      .unit(P2, "bf2", { might: 2, name: "Unit B" }, "bb")
      .unit(P1, "base", { might: 1, name: "P1 Homebody" }, "p1home")
      .build();
    expect(empty.p1.can("reveal", "fof")).toBe(false);
    expect((await empty.p1.try((p) => p.reveal("fof"))).ok).toBe(false);
    expect(empty.zoneOf("fof")).toBe("facedown-bf1");

    const occupied = await scenario()
      .turn(3)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .facedown(P1, "bf1", FIGHT_OR_FLIGHT, "fof")
      .unit(P1, "bf1", { might: 3, name: "Defender A" }, "aa")
      .build();
    expect(occupied.p1.can("reveal", "fof")).toBe(true);
  });
});

describe("(b) P2 answers with the facedown Tideturner at bf2; the here-lock is re-checked when FoF resolves", () => {
  test("with priority on the chain P2 may flip Tideturner at the OTHER battlefield; it enters AT bf2 for 0 (811.1.d.1) and its 'you may' is asked at finalization", async () => {
    const game = await p1HasFocus();
    await fofOnE(game, "flip");
    expect(game.p2.legal().map((o) => o.key)).toContain("revealHidden:tt");
    expect(game.p2.option("revealHidden", "tt")?.fields.some((f) => f.arg === "to")).toBe(false); // no destination choice
    await game.p2.reveal("tt");
    expect(game.zoneOf("tt")).toBe("battlefield-bf2");
    expect(game.p2.energy()).toBe(0);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, timing: "FIN", source: { cardId: "tt" } });
  });

  test("swap partner: 'a unit you control at ANOTHER location' waives the here-lock (811.1.d.2 exception) → E at bf1 and the base homebody are legal, co-located B is not; choosing E stacks the trigger above FoF", async () => {
    const game = await p1HasFocus();
    await fofOnE(game, "flip");
    await game.p2.reveal("tt");
    await game.p2.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2, semantics: "target" });
    expect(new Set(pickOffered(game))).toEqual(new Set(["ee", "p2home"]));
    expect(pickOffered(game)).not.toContain("bb");
    expect(pickOffered(game)).not.toContain("aa"); // not P2's
    await game.p2.pick("ee");
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "fof", controller: P1, targets: ["ee"], type: "spell" }),
      expect.objectContaining({ cardId: "tt", controller: P2, targets: ["ee"], triggered: true, type: "ability" }),
    ]);
  });

  test("LIFO: the swap resolves first — Tideturner is now at bf1, E at bf2 — while FoF still waits on the chain with E recorded as its target", async () => {
    const game = await p1HasFocus();
    await fofOnE(game, "flip");
    await tideturnerSwapsWithE(game);
    expect(game.locationOf("tt")).toBe("bf1");
    expect(game.locationOf("ee")).toBe("bf2");
    expect(game.zoneOf("ee")).toBe("battlefield-bf2");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fof", targets: ["ee"] })]);
  });

  test("FoF (played from Hidden at bf1) then resolves: E is still at A battlefield but no longer at THAT battlefield → illegal target, NOT moved — it stays at bf2 (359.3.e.5, CR example); FoF → P1's trash, still free", async () => {
    const game = await p1HasFocus();
    await fofOnE(game, "flip");
    await tideturnerSwapsWithE(game);
    await resolveFof(game);
    expect(game.zoneOf("ee")).toBe("battlefield-bf2");
    expect(game.locationOf("ee")).toBe("bf2");
    expect(game.p2.units("base")).not.toContain("ee");
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.p1.trash()).toEqual(["fof"]);
    expect(game.p1.resources()).toEqual({ energy: 2, power: {} });
    expect(game.decision()?.kind).toBe("action"); // nothing re-targeted, no prompt
    expect(game.violations()).toEqual([]);
  });
});

describe("(c) contrast — the HAND copy on E with the identical Tideturner response", () => {
  test("[Action] from hand: castable only once P1 holds Focus in the showdown; costs the full 2; any unit AT A battlefield is offered (A, E, and B at bf2) but no base unit (811.3)", async () => {
    const game = await board().build();
    await game.p2.move("ee", "bf1");
    expect(game.p1.can("cast", "fofHand")).toBe(false);
    await game.p2.passFocus();
    expect(game.p1.can("cast", "fofHand")).toBe(true);
    const offered = (game.p1.option("cast", "fofHand")?.fields.find((f) => f.name === "targets")?.options ?? []).flat() as string[];
    expect(new Set(offered)).toEqual(new Set(["aa", "ee", "bb"]));
    await expect(game.p1.cast("fofHand", { targets: "p2home" })).rejects.toThrow();
    await game.p1.cast("fofHand", { targets: "ee" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fofHand", targets: ["ee"] })]);
  });

  test("after the same swap E sits at bf2 when the hand FoF resolves: bf1 → bf2 is board-to-board (359.3.e.2/.e.4) and 'a unit at a battlefield' still holds → LEGAL → E is moved to P2's base", async () => {
    const game = await p1HasFocus();
    await fofOnE(game, "hand");
    await tideturnerSwapsWithE(game);
    expect(game.locationOf("ee")).toBe("bf2");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fofHand", targets: ["ee"] })]);
    await resolveFof(game);
    expect(game.zoneOf("ee")).toBe("base");
    expect(game.state("ee")).toMatchObject({ controller: P2, owner: P2 });
    expect(game.p2.units("base")).toContain("ee");
    expect(game.zoneOf("fofHand")).toBe("trash");
    expect(game.locationOf("tt")).toBe("bf1");
    expect(game.violations()).toEqual([]);
  });

  test("side by side: identical text, identical response — the flip leaves E at bf2, the hand cast sends E home; the only difference is play origin", async () => {
    const flip = await p1HasFocus();
    await fofOnE(flip, "flip");
    await tideturnerSwapsWithE(flip);
    await resolveFof(flip);

    const hand = await p1HasFocus();
    await fofOnE(hand, "hand");
    await tideturnerSwapsWithE(hand);
    await resolveFof(hand);

    expect(flip.zoneOf("ee")).toBe("battlefield-bf2");
    expect(hand.zoneOf("ee")).toBe("base");
  });
});

describe("(d) aftermath of (b): who is attacking bf1 now, and does the showdown go on?", () => {
  test("Tideturner, now at bf1 mid-combat, carries P2's designation ATTACKER (323.2.a); E at bf2 has no designation (323.2.c); A is still the Defender; bf1 stays contested with the combat showdown open", async () => {
    const game = await p1HasFocus();
    await fofOnE(game, "flip");
    await tideturnerSwapsWithE(game);
    await resolveFof(game);
    expect(game.state("tt").combatRole).toBe("attacker");
    expect(game.state("ee").combatRole).toBeNull();
    expect(game.state("aa").combatRole).toBe("defender");
    expect(showdown(game)).toMatchObject({ attackingPlayer: P2, battlefieldId: "bf1", defendingPlayer: P1, isCombatShowdown: true });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P1 });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("when the chain P1 opened empties, Focus passes to P2 (346 / 347.1.b) and the pass sequence restarts", async () => {
    const game = await p1HasFocus();
    await fofOnE(game, "flip");
    await tideturnerSwapsWithE(game);
    await resolveFof(game);
    expect(showdown(game)?.focusPlayer).toBe(P2);
    expect(showdown(game)?.passedPlayers ?? []).toEqual([]);
    expect(game.actingSeat()).toBe(P2);
  });

  test("everyone passes from here: A (3) vs Tideturner (2) → Tideturner dies, A survives (combat damage healed), P1 keeps bf1, nobody scores; E and B remain at bf2", async () => {
    const game = await p1HasFocus();
    await fofOnE(game, "flip");
    await tideturnerSwapsWithE(game);
    await resolveFof(game);
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.zoneOf("tt")).toBe("trash");
    expect(game.zoneOf("aa")).toBe("battlefield-bf1");
    expect(game.state("aa").damage).toBe(0);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(new Set(game.p2.units("bf2"))).toEqual(new Set(["ee", "bb"]));
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
