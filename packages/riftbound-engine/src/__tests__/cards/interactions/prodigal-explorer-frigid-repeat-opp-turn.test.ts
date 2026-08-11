/**
 * Interaction: Prodigal Explorer (sfd-199-221) · Legend (Ezreal) · Mind/Chaos
 *                "[Exhaust]: [Reaction] — Draw 1. Use only if you've chosen enemy units and/or gear twice this
 *                 turn with spells or unit abilities."
 *            × Frigid Touch (sfd-066-221) · Spell · Mind · 2 · "[Reaction] [Repeat] [2]. Give a unit -2 [Might] this turn."
 *            × Vi, Destructive (ogn-036-298) · Unit · Fury · 3 Might · "[Ganking] Recycle 1 from your trash: Give me
 *                 +1 [Might] this turn."  — NO [Action]/[Reaction] tag on the ability
 *
 * It is P2's TURN. P1 defends bf1 with Vi (trash non-empty, 4 energy, Frigid Touch in hand, Explorer ready).
 * P2 standard-moves a 6-Might attacker into bf1 → combat showdown, P2 (attacker) has Focus and passes → P1 has Focus.
 *   (a) In that Focus window (Showdown Open, P2's turn): which of Frigid Touch / Vi's ability / Explorer are
 *       listed for P1? For P2?
 *   (b) P1 plays Frigid Touch paying Repeat, naming the attacker for BOTH executions. With the spell still on the
 *       chain (Closed, P2's turn, P1 holding priority): is Explorer listed now? Vi's ability?
 *   (c) P1 activates Explorer there: is it a respondable chain item (not an [Add]), what resolves first, when is
 *       the legend exhausted, and how does combat end?
 *   (d) Control: no Repeat (attacker chosen once) — Explorer never listed this turn.
 *   (e) Control: P1's OWN turn, Neutral Open, condition unmet — Explorer not listed, Vi's ability (Vi in base) IS.
 *
 * Rules: 381 (activated abilities: controller's turn + Open State), 380, 174.8 (legend abilities), 813.1.b /
 * 813.1.c.2 / 813.2 (Reaction on an activated ability lifts both the closed-state and the your-turn limb), 813.3
 * (Reaction is only permission — never waives a "use only if"), 377.2.b (use-only-if condition must be true to
 * activate), 820.2 (Repeat choices are made in Make Choices → the attacker is chosen twice), 404.1 (cost — the
 * exhaust — paid at activation), 406.4 / 359.3.c (opponent may React before resolution), 429.2 (only [Add]
 * abilities skip the window), 347.1 (legally timed play from Focus starts a chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PRODIGAL_EXPLORER = "sfd-199-221";
const FRIGID_TOUCH = "sfd-066-221";
const VI_DESTRUCTIVE = "ogn-036-298";
const DISCIPLINE = "ogn-058-298"; // P2's Reaction in hand — only there to prove P2 gets a real response window

const EZ = "activateAbility:ez#0";
const VI_ABILITY = "activateAbility:vi#1"; // #0 is the [Ganking] keyword
const FT = "playSpell:ft";

/** P2's turn 2. P1: Explorer (ready), Vi defending bf1, a card in trash, 4 energy, Frigid Touch. P2: 6-Might attacker in base, Discipline + 2 energy. */
function board() {
  return scenario()
    .active(P2)
    .legend(P1, PRODIGAL_EXPLORER, "ez")
    .resources(P1, { energy: 4 })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", VI_DESTRUCTIVE, "vi")
    .trash(P1, { might: 1, name: "Junk" }, "junk")
    .unit(P2, "base", { might: 6, name: "Attacker" }, "att")
    .hand(P2, DISCIPLINE, "disc")
    .hand(P1, FRIGID_TOUCH, "ft");
}

const keys = (game: Game, seat: typeof P1) => game.seat(seat).legal().map((o) => o.key);
const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** P2 attacks bf1, holds Focus first (attacker) and passes it → P1 has Focus in the Showdown Open state on P2's turn. */
async function p1HasFocus(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("att", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(showdown(game)).toMatchObject({ attackingPlayer: P2, defendingPlayer: P1, focusPlayer: P1, isCombatShowdown: true });
  expect(game.turnPlayer()).toBe(P2);
  expect(game.chain()).toEqual([]);
  return game;
}

/** …then P1 plays Frigid Touch with Repeat, attacker chosen for both executions; P1 holds priority in the Closed state. */
async function frigidRepeatOnChain(): Promise<Game> {
  const game = await p1HasFocus();
  await game.p1.cast("ft", { repeat: 1, targets: ["att", "att"] });
  expect(game.p1.energy()).toBe(0);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ft", controller: P1, targets: ["att", "att"], triggered: false, type: "spell" })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

describe("Prodigal Explorer × Frigid Touch [Repeat] × Vi, Destructive — defending on the OPPONENT's turn", () => {
  // ---------------------------------------------------------------- (a) Focus window, Showdown Open, P2's turn

  test("(a) P1 with Focus (Showdown Open, P2's turn): Frigid Touch IS listed (Reaction ⊇ Action, 813.1.b) and offers the attacker for both Repeat executions", async () => {
    const game = await p1HasFocus();
    expect(keys(game, P1)).toContain(FT);
    expect(game.p1.can("cast", "ft")).toBe(true);
    const targets = game.p1.option("cast", "ft")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(targets).toContainEqual(["att"]);
    expect(targets).toContainEqual(["att", "att"]);
  });

  test("(a) Vi's Recycle ability is ABSENT — untagged activated ability: only on its controller's turn in a (Neutral) Open State (381), even though the cost is payable and Vi is on the board (380)", async () => {
    const game = await p1HasFocus();
    expect(game.p1.trash()).toEqual(["junk"]);
    expect(keys(game, P1)).not.toContain(VI_ABILITY);
    expect(keys(game, P1).some((k) => k.startsWith("activateAbility:vi#"))).toBe(false);
    const r = await game.p1.try((p) => p.activate("vi", 1));
    expect(r.ok).toBe(false);
    expect(game.state("vi").might).toBe(3);
    expect(game.p1.trash()).toEqual(["junk"]);
  });

  test("(a) Prodigal Explorer is ABSENT — Reaction gives it the timing (813.1.c.2) but the 'use only if' condition is unmet: 0 enemy choices so far (377.2.b / 813.3)", async () => {
    const game = await p1HasFocus();
    expect(keys(game, P1)).not.toContain(EZ);
    expect(game.p1.can("activate", "ez")).toBe(false);
    const r = await game.p1.try((p) => p.activate("ez", 0));
    expect(r.ok).toBe(false);
    expect(game.state("ez").isExhausted).toBe(false);
    // exactly: pass focus, Frigid Touch, concede
    expect(new Set(keys(game, P1))).toEqual(new Set(["concede:-", "passShowdownFocus:-", FT]));
  });

  test("(a) P2's list never contains any of P1's objects; while P1 holds Focus P2 has no menu at all", async () => {
    const game = await board().build();
    await game.p2.move("att", "bf1");
    // P2's own Focus window first: nothing of P1's
    expect(keys(game, P2).some((k) => k.includes("ez") || k.includes("vi") || k.includes("ft"))).toBe(false);
    await game.p2.passFocus();
    expect(game.p2.legal()).toEqual([]);
    expect((await game.p2.try((p) => p.activate("ez", 0))).ok).toBe(false);
    expect((await game.p2.try((p) => p.cast("ft", { targets: ["att"] }))).ok).toBe(false);
  });

  // ---------------------------------------------------------------- (b) Frigid Touch with Repeat on the chain

  test("(b) after Frigid Touch [Repeat] names the attacker twice, Explorer is listed for P1 IMMEDIATELY — Closed State, P2's turn (820.2 two choices; 813.1.c.2 lifts closed-state AND your-turn limbs of 381)", async () => {
    const game = await frigidRepeatOnChain();
    expect(game.turnPlayer()).toBe(P2);
    expect(keys(game, P1)).toContain(EZ);
    expect(game.p1.can("activate", "ez")).toBe(true);
  });

  test("(b) Vi's ability is STILL absent in that Closed state (no Reaction tag)", async () => {
    const game = await frigidRepeatOnChain();
    expect(keys(game, P1)).not.toContain(VI_ABILITY);
    expect(new Set(keys(game, P1))).toEqual(new Set(["concede:-", "passChainPriority:-", EZ]));
  });

  // ---------------------------------------------------------------- (c) activating Explorer in the Closed state

  test("(c) activating Explorer: the legend is exhausted at activation (cost, 404.1) and the ability is a chain item ON TOP of Frigid Touch — nothing drawn yet (not an [Add], 429.2)", async () => {
    const game = await frigidRepeatOnChain();
    const hand0 = game.p1.hand().length;
    await game.p1.activate("ez", 0);
    expect(game.state("ez").isExhausted).toBe(true);
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "ft", controller: P1, type: "spell" }),
      expect.objectContaining({ cardId: "ez", controller: P1, triggered: false, type: "ability" }),
    ]);
    expect(game.p1.hand()).toHaveLength(hand0);
    // P1 (who added it) holds priority first; P1 passes → P2 receives priority with the Explorer item on top (406.4)
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2, source: { cardId: "ez" } });
    expect(keys(game, P2)).toContain("passChainPriority:-");
    expect(game.p2.can("cast", "disc")).toBe(true); // a real Reaction window for P2
  });

  test("(c) LIFO: P2 passes → Explorer resolves first (P1 draws 1) while Frigid Touch is still on the chain and the attacker is still 6", async () => {
    const game = await frigidRepeatOnChain();
    const deck0 = game.p1.deck().length;
    await game.p1.activate("ez", 0);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.deck()).toHaveLength(deck0 - 1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ft", targets: ["att", "att"] })]);
    expect(game.state("att").might).toBe(6);
    // then Frigid Touch: -2 and -2 again on the same unit → 6 → 2
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("ft")).toBe("trash");
    expect(game.state("att")).toMatchObject({ might: 2, mightModifier: -4 });
    // the played-card chain closed → Focus passes on to P2 (347.1.b); showdown still open
    expect(showdown(game)).toMatchObject({ active: true, focusPlayer: P2 });
  });

  test("(c) everyone passes → combat: Vi 3 vs attacker 2 → attacker dies, Vi survives (healed), P1 still holds bf1, no points to P2", async () => {
    const game = await frigidRepeatOnChain();
    await game.p1.activate("ez", 0);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("att")).toBe("trash");
    expect(game.state("vi")).toMatchObject({ damage: 0, location: "bf1", might: 3 });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p2.points()).toBe(0);
    expect(game.state("ez").isExhausted).toBe(true);
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  // ---------------------------------------------------------------- (d) control: no Repeat

  test("(d) control — Frigid Touch WITHOUT Repeat (attacker chosen once): Explorer is listed at NO window this turn (closed state, after resolution with Focus back, after combat)", async () => {
    const game = await p1HasFocus();
    await game.p1.cast("ft", { targets: ["att"] });
    expect(game.p1.energy()).toBe(2);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ft", targets: ["att"] })]);
    expect(keys(game, P1)).not.toContain(EZ); // Closed, P1 priority
    await game.p1.passPriority();
    expect(keys(game, P1)).not.toContain(EZ); // Closed, P2 priority (P1 has no menu anyway)
    await game.p2.passPriority();
    expect(game.state("att").might).toBe(4);
    expect(showdown(game)?.focusPlayer).toBe(P2);
    expect(keys(game, P1)).not.toContain(EZ);
    await game.p2.passFocus(); // Focus back to P1 in the Showdown Open state
    expect(game.decision()).toMatchObject({ context: "showdown", seat: P1 });
    expect(keys(game, P1)).not.toContain(EZ);
    expect(game.p1.can("activate", "ez")).toBe(false);
    await game.settle(); // combat: 4 vs Vi 3 → Vi dies, attacker conquers
    expect(game.zoneOf("vi")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(keys(game, P1)).not.toContain(EZ);
    expect(game.state("ez").isExhausted).toBe(false);
  });

  // ---------------------------------------------------------------- (e) control: P1's own turn, Neutral Open

  test("(e) control — P1's OWN turn, Neutral Open, Vi in base, trash non-empty, nothing chosen yet: Vi's ability IS listed (381 satisfied); Explorer is NOT (condition unmet — Reaction never waives it, 813.3)", async () => {
    const game = await scenario()
      .active(P1)
      .legend(P1, PRODIGAL_EXPLORER, "ez")
      .resources(P1, { energy: 4 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 6, name: "Holder" }, "att")
      .unit(P1, "base", VI_DESTRUCTIVE, "vi")
      .trash(P1, { might: 1, name: "Junk" }, "junk")
      .hand(P1, FRIGID_TOUCH, "ft")
      .build();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(keys(game, P1)).toContain(VI_ABILITY);
    expect(game.p1.can("activate", "vi")).toBe(true);
    expect(keys(game, P1)).not.toContain(EZ);
    expect(game.p1.can("activate", "ez")).toBe(false);
    // and Vi's ability works: recycle the trash card, Vi +1 this turn
    await game.p1.activate("vi", 1);
    await game.settle();
    expect(game.state("vi").might).toBe(4);
    expect(game.p1.trash()).toEqual([]);
    expect(game.zoneOf("junk")).toBe("mainDeck");
    expect(keys(game, P1)).not.toContain(EZ); // a self-targeting friendly ability is not an enemy choice
  });
});
