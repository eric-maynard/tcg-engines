/**
 * Interaction: Green Father (unl-195-219, Legend · Ivern) "When you conquer or hold, you may exhaust me to replace
 *     that battlefield with a Brush battlefield token."
 *   → Brush token (unl-t03) "Bird, Cat, Dog, Poro, and Ivern units here have +1 [Might].
 *                            When you score here, you may replace this with the battlefield it replaced."
 *   × Mystic Poro (ogn-171-298) · Unit · 2 Might · PORO tag
 *   × Incinerate (ogs-003-024) · Spell · Fury · 2 · Action "Deal 2 to a unit at a battlefield."
 *
 * Story (played out for real): on P1's turn P1's Scout walks onto the empty bf1, conquers it, and P1 exhausts
 * Green Father → bf1 becomes a Brush token (the printed bf1 card waits in Banishment). P1 then Incinerates its own
 * Scout, so the Brush is UNCONTROLLED and empty. P2's turn: P2's Mystic Poro standard-moves into the Brush.
 *
 * Question:
 *   (a) Poro's Might there? What kind of showdown opens? P1, on receiving Focus, Incinerates the Poro — does it
 *       die? Is that damage healed when the showdown ends?
 *   (b) Showdown ends, P2 conquers. The Brush is P1's token — who decides the "you may replace this" swap-back?
 *   (c) P2 says yes: where does the Brush go, what comes back / under whose control, does the Poro keep its 2
 *       damage, what is its Might now — does the swap kill P2's own Poro; does P2 keep the point / the battlefield?
 *   (d) P2 says no — outcome?   (e) Contrast: no Incinerate — is swap-back safe?
 *
 * Rules: 187.8 (Brush text), 438.1 / 438.1.a (replace in place, statuses inherited), 438.7 / 438.7.b (Swap Back:
 * the card returns from Banishment into the same slot), 652.2.b (units there do not move), 652.2.c (the token's
 * continuous +1 ends at once), 190.6.a / 190.6.d ("you" on a battlefield ability = its CONTROLLER), 190.4.c (no
 * units → uncontrolled at the next cleanup), 348.2.a / 348.2.a.1 (sole remaining player establishes control and
 * conquers), 143.2.a (nonzero damage ≥ Might → killed in cleanup), 143.3.b (damage heals only at end of turn /
 * combat cleanup), 183 / 439.4 (token ownership is irrelevant to "you"), 470 (no re-score on swap).
 *
 * Expected: (a) Poro 3 Might (unconditional "units here" aura); NON-combat showdown (no attacker/defender roles);
 * Incinerate legal for P1 with Focus; Poro survives 3 Might / 2 damage; no heal at the end of a non-combat showdown.
 * (b) P2 conquers (+1) and P2 — the controller — is asked. (c) Brush ceases to exist, printed bf1 returns from
 * Banishment into the slot, Poro drops to 2 Might with 2 damage → dies at the next cleanup → P2's trash; P2 keeps
 * the point; the battlefield ends up uncontrolled. (d) Brush stays under P2, Poro 3/2 alive, heals at end of turn;
 * P2 is offered the swap again when it next scores there. (e) Undamaged Poro merely drops 3→2 and holds the
 * restored battlefield for P2.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GREEN_FATHER = "unl-195-219";
const MYSTIC_PORO = "ogn-171-298";
const INCINERATE = "ogs-003-024";

/**
 * P1's turn 3. P1: legend Green Father, a tagless 2-Might Scout in base, two Incinerates, exactly 2 energy (for
 * the first one) and two READY fury runes (kept for P2's turn — pools empty at end of turn). bf1: a plain, inert,
 * uncontrolled battlefield card. P2: Mystic Poro (2, PORO) ready in base.
 */
function board() {
  return scenario()
    .turn(3)
    .active(P1)
    .legend(P1, GREEN_FATHER, "gf")
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .hand(P1, INCINERATE, "inc1")
    .hand(P1, INCINERATE, "inc2")
    .resources(P1, { energy: 2 })
    .runes(P1, "fury", 2)
    .unit(P2, "base", MYSTIC_PORO, "poro");
}

const showdown = (game: Game) => {
  const top = game.gameState.interaction?.showdownStack?.at(-1);
  return top?.active ? top : undefined;
};

/** { id, name, controller } for every battlefield on the row. */
const row = (game: Game) => game.battlefields().map((id) => ({ controller: game.gameState.battlefields[id]?.controller, id, name: game.state(id).name }));

/**
 * The prologue: Scout conquers bf1 → Green Father YES → Brush; P1 Incinerates its own Scout → Brush uncontrolled
 * and empty; P1's turn ends → P2's open main phase.
 */
async function brushedAndAbandoned(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("scout", "bf1");
  for (let i = 0; i < 6; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "gf") {
      await game.p1.yes();
      continue;
    }
    if (r.reason === "open") {
      break;
    }
  }
  expect(game.p1.points()).toBe(1);
  expect(row(game)).toEqual([{ controller: P1, id: "bf1", name: "Brush" }]);
  expect(game.state("bf1").isToken).toBe(true);
  expect(game.cardsAt("banishment").map((id) => game.state(id).name)).toEqual(["bf1"]); // the printed card, "as Replaced"
  await game.p1.cast("inc1", { targets: "scout" });
  await game.settle();
  expect(game.zoneOf("scout")).toBe("trash");
  expect(game.gameState.battlefields.bf1?.controller).toBeNull(); // 190.4.c
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P2);
  expect(game.phase()).toBe("main");
  expect(game.p1.energy()).toBe(0); // pool emptied at end of turn — the runes are what P1 has left
  expect(game.p1.runes({ ready: true })).toHaveLength(2);
  return game;
}

/** Poro walks into the Brush; P2 (Focus) passes; P1 taps both runes and Incinerates the Poro; the spell resolves. */
async function poroInAndIncinerated(game: Game): Promise<void> {
  await game.p2.move("poro", "bf1");
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.tapRune();
  await game.p1.tapRune();
  await game.p1.cast("inc2", { targets: "poro" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "inc2", controller: P1, targets: ["poro"] })]);
  for (let i = 0; i < 4 && game.chain().length > 0; i++) {
    await game.acting().pass();
  }
  expect(game.zoneOf("inc2")).toBe("trash");
}

/** …then everybody passes Focus until the showdown closes; stops at whatever prompt follows. */
async function closeShowdown(game: Game): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "showdown") {
      await game.acting().pass();
      continue;
    }
    break;
  }
  expect(showdown(game)).toBeUndefined();
}

describe("Brush (Green Father) × Mystic Poro × Incinerate — P2 conquers P1's Brush, swaps it back, and its damaged Poro dies", () => {
  // ── (a) ────────────────────────────────────────────────────────────────────────────────────────

  test("(a) the Poro is 3 Might in the Brush regardless of who made the token, and moving into the UNCONTROLLED Brush opens a NON-combat showdown (no attacker/defender roles) with P2 holding Focus", async () => {
    const game = await brushedAndAbandoned();
    expect(game.state("poro").might).toBe(2); // in base
    await game.p2.move("poro", "bf1");
    expect(game.locationOf("poro")).toBe("bf1");
    expect(game.state("poro").might).toBe(3); // 187.8 — PORO tag, "units here"
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: null });
    expect(showdown(game)).toMatchObject({ battlefieldId: "bf1", focusPlayer: P2, isCombatShowdown: false });
    expect(game.state("poro").combatRole).toBeNull();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  });

  test("(a) with Focus P1 may cast the Action-speed Incinerate on the Poro: 2 damage on a 3-Might unit — it survives at the Brush with 2 marked", async () => {
    const game = await brushedAndAbandoned();
    await game.p2.move("poro", "bf1");
    expect(game.p1.can("cast", "inc2")).toBe(false); // no Focus yet (and no energy)
    await game.p2.passFocus();
    await game.p1.tapRune();
    await game.p1.tapRune();
    expect(game.p1.can("cast", "inc2")).toBe(true);
    const offered = game.p1.option("cast", "inc2")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(offered.flat()).toEqual(["poro"]);
    await game.p1.cast("inc2", { targets: "poro" });
    for (let i = 0; i < 4 && game.chain().length > 0; i++) {
      await game.acting().pass();
    }
    expect(game.zoneOf("poro")).toBe("battlefield-bf1");
    expect(game.state("poro")).toMatchObject({ damage: 2, might: 3 });
    expect(showdown(game)).toMatchObject({ battlefieldId: "bf1", isCombatShowdown: false }); // still open
  });

  test("(a) the non-combat showdown ending heals nothing (143.3.b): at the moment P2 conquers, the Poro still carries its 2 damage", async () => {
    const game = await brushedAndAbandoned();
    await poroInAndIncinerated(game);
    await closeShowdown(game);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.state("poro")).toMatchObject({ damage: 2, location: "bf1", might: 3 });
  });

  // ── (b) ────────────────────────────────────────────────────────────────────────────────────────

  test("(b) P2 conquers the Brush (+1) and the Brush's 'you may replace this' is asked of P2 — its CONTROLLER — not of P1 who owns the token (190.6.a/d); Green Father (P1's) is silent", async () => {
    const game = await brushedAndAbandoned();
    await poroInAndIncinerated(game);
    await closeShowdown(game);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(1); // unchanged from the prologue
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "bf1" } });
    expect(game.state("bf1").name).toBe("Brush");
    expect(game.state("gf").isExhausted).toBe(true); // spent in the prologue; nothing asked of P1 now
    expect(game.p1.decision()?.kind).not.toBe("yes-no");
  });

  // ── (c) ────────────────────────────────────────────────────────────────────────────────────────

  test("(c) P2 says YES: the Brush token ceases to exist, the printed bf1 returns from Banishment into that slot, and banishment is empty", async () => {
    const game = await brushedAndAbandoned();
    await poroInAndIncinerated(game);
    await closeShowdown(game);
    await game.p2.yes();
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.has("bf1")).toBe(false); // 186.1 — the token is nowhere
    expect(row(game).map((b) => b.name)).toEqual(["bf1"]);
    expect(row(game).some((b) => b.name === "Brush")).toBe(false);
    expect(game.cardsAt("banishment")).toEqual([]);
    expect(game.battlefields()).toHaveLength(1);
  });

  test("(c) …the +1 ends immediately (652.2.c): Poro is 2 Might with 2 damage → killed in the very next cleanup (143.2.a) → P2's trash; P2 KEEPS the conquer point; with no unit left the restored battlefield is uncontrolled (190.4.c)", async () => {
    const game = await brushedAndAbandoned();
    await poroInAndIncinerated(game);
    await closeShowdown(game);
    await game.p2.yes();
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.p2.trash()).toContain("poro");
    expect(game.state("poro").might).toBe(2); // printed, aura gone
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(1);
    expect(row(game)).toEqual([expect.objectContaining({ controller: null, name: "bf1" })]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  // ── (d) ────────────────────────────────────────────────────────────────────────────────────────

  test("(d) P2 says NO: the Brush stays — now controlled by P2 — and the Poro lives there at 3 Might with 2 damage; P2 still has its point", async () => {
    const game = await brushedAndAbandoned();
    await poroInAndIncinerated(game);
    await closeShowdown(game);
    await game.p2.no();
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(row(game)).toEqual([{ controller: P2, id: "bf1", name: "Brush" }]);
    expect(game.cardsAt("banishment").map((id) => game.state(id).name)).toEqual(["bf1"]);
    expect(game.state("poro")).toMatchObject({ damage: 2, location: "bf1", might: 3 });
    expect(game.p2.units("bf1")).toEqual(["poro"]);
    expect(game.p2.points()).toBe(1);
  });

  test("(d) …the 2 damage heals at the end of P2's turn (143.3.b), and when P2 next scores there (hold at the start of its next turn) P2 is offered the swap-back again", async () => {
    const game = await brushedAndAbandoned();
    await poroInAndIncinerated(game);
    await closeShowdown(game);
    await game.p2.no();
    await game.settle();
    await game.advanceTurn(); // P2 ends → P1's turn
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("poro")).toMatchObject({ damage: 0, location: "bf1", might: 3 });
    await game.advanceTurn(); // P1 ends → P2's Beginning: hold at the Brush
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.points()).toBe(2);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "bf1" } });
    await game.p2.no();
    await game.settle();
    expect(row(game)).toEqual([{ controller: P2, id: "bf1", name: "Brush" }]);
  });

  // ── (e) ────────────────────────────────────────────────────────────────────────────────────────

  test("(e) contrast — no Incinerate: P2 conquers, swaps back, the undamaged Poro merely drops 3 → 2 and keeps holding the restored bf1 for P2", async () => {
    const game = await brushedAndAbandoned();
    await game.p2.move("poro", "bf1");
    expect(game.state("poro").might).toBe(3);
    await closeShowdown(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "bf1" } });
    await game.p2.yes();
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.has("bf1")).toBe(false);
    const slot = game.locationOf("poro") as string;
    expect(game.state(slot).name).toBe("bf1");
    expect(game.gameState.battlefields[slot]).toMatchObject({ contested: false, controller: P2 });
    expect(game.state("poro")).toMatchObject({ damage: 0, might: 2 });
    expect(game.p2.points()).toBe(1);
    expect(game.cardsAt("banishment")).toEqual([]);
  });
});
