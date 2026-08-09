/**
 * Interaction: Wild Claw (ven-089-166) · Spell · Body · 7 + [body]
 *     "Look at the top 5 cards of your Main Deck. You may banish a unit or gear from among them and
 *      play it, reducing its Energy cost by [5]. Recycle the rest. Then you may do this: Empower it."
 *   × Dune Drake (ogn-131-298) · Unit · Body · 5 · 5 Might · DRAGON
 *     "When I attack, give me +2 [Might] this turn if there is a ready enemy unit here."
 *   × Dragon Roost (ven-157-166) · Battlefield
 *     "Any player may pay [rainbow][rainbow] as an additional cost to play a Dragon. If they do, they
 *      play it to this battlefield."
 *   (contrast) Portal Rescue (ogn-102-298) "Banish a friendly unit, then its owner plays it to their
 *      base, ignoring its cost." — an effect that NAMES the destination.
 *
 * Rules: 419.3.b (an effect-play runs every step of Play normally unless the effect says otherwise),
 * 355.1.a + 356.2.b.1 (optional additional costs are declared in step 2 and added AFTER the base cost is
 * fixed — so a base discounted to 0 by 356.4 can still have [A][A] added, cf. 356.1.b.3), 355.2 / 355.2.a
 * (the player playing the unit chooses a Valid location: their base or a battlefield they control),
 * 355.2.b (an effect — the Roost — can make another location Valid), 191.1 (the player who plays it is
 * its controller), 357.3 (you may not elect a cost that deterministically makes the play illegal),
 * 359.2.c / 143.4 (enters exhausted at the chosen location), 190.3.a.1 (played to a battlefield you don't
 * control → you apply Contested → combat at the next Open cleanup with you as attacker), 128.6 (a look is
 * private; "you may banish" is a real choice).
 *
 * Question: Dragon Roost is held by P2 (one unit); P1 controls bf2. P1 casts Wild Claw and finds Dune Drake.
 *   (a) who chooses where the Drake lands and what are the choices? (b) is the Roost's optional [A][A]
 *   still offered on a 0-energy effect-play, and if paid does the Drake land on P2's Roost and attack on
 *   P1's turn? (c) what is paid in each branch / does it enter ready? (d) may P1 decline after looking?
 *   (e) contrast with Dune Drake from hand, and with an effect that names the destination.
 *
 * Expected: (a) P1 chooses (355.2): base or bf2 — or the Roost if (b). (b) Yes: the Roost must be offered;
 * paying [A][A] puts the exhausted Drake on P2's Roost, P1 contests it, and once Wild Claw's chain is done a
 * combat is staged there with P1 attacking (5 v 2 → keeper dies, P1 conquers, +1). (c) base/bf2: 5−5 = 0,
 * nothing beyond Wild Claw's own 7+[body]; Roost: 0 + [A][A]. Exhausted either way (no Accelerate); the
 * optional Empower then applies to the Drake. (d) Yes — all five recycled, nothing played, no Empower ask.
 * (e) From hand: same menu (base / bf2 / Roost-for-[A][A]) at full price 5, own turn only. Portal Rescue
 * names "their base": no location step to redirect, so the Roost is never involved and [A][A] stays put.
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WILD_CLAW = "ven-089-166";
const DUNE_DRAKE = "ogn-131-298";
const DRAGON_ROOST = "ven-157-166";
const PORTAL_RESCUE = "ogn-102-298";
const SKULKER = "ogn-175-298"; // vanilla 3-cost unit — a second legal pick so nothing auto-binds
const RUNE_PRISON = "ogn-050-298"; // a spell — looked at, never pickable

/**
 * P1's turn. Roost: P2's (live text) with a 2-Might Keeper. bf2: P1's with a 1-Might Holder.
 * P1 has exactly Wild Claw's cost (7 + [body]) plus `rainbow` floating power for the Roost option.
 * Deck top 5 = Drake, Skulker, 3 spells; the 6th card must never be seen.
 */
function board(rainbow = 2) {
  return scenario()
    .resources(P1, { energy: 7, power: { body: 1, rainbow } })
    .battlefield("roost", { controller: P2, def: DRAGON_ROOST, inert: false, owner: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "roost", { might: 2, name: "Roost Keeper" }, "keeper")
    .unit(P1, "bf2", { might: 1, name: "Holder" }, "holder")
    .deck(P1, [DUNE_DRAKE, SKULKER, RUNE_PRISON, RUNE_PRISON, RUNE_PRISON, SKULKER], ["drake", "skulker", "s1", "s2", "s3", "sixth"])
    .hand(P1, WILD_CLAW, "wc");
}

/** Cast Wild Claw, let it resolve to the reveal-and-pick, pick the Drake → returns the destination prompt. */
async function clawIntoDrake(rainbow = 2): Promise<{ game: Game; dest: PickDecision }> {
  const game = await board(rainbow).build();
  await game.p1.cast("wc");
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  const look = game.decision() as PickDecision;
  expect(look).toMatchObject({ allowDecline: true, kind: "pick", seat: P1, semantics: "from-revealed" });
  expect(look.options.map((o) => o.card).sort()).toEqual(["drake", "skulker"]);
  await game.p1.pick("drake");
  const dest = game.decision() as PickDecision;
  expect(dest).toMatchObject({ kind: "pick", semantics: "destination" });
  return { dest, game };
}

const destKeys = (d: PickDecision): string[] =>
  d.options.map((o) => (o.key.startsWith("battlefield-") ? o.key.slice("battlefield-".length) : o.key)).sort();

/** From-hand destinations offered for `card` to `seat`. */
const handDestinations = (game: Game, card: string): string[] =>
  ((game.p1.option("play", card)?.fields.find((f) => f.arg === "to")?.options as string[] | undefined) ?? [])
    .map((z) => (z.startsWith("battlefield-") ? z.slice("battlefield-".length) : z))
    .sort();

/** Drain Wild Claw's tail (recycle, reflexive "Then you may do this: Empower it") answering the Empower ask with `empower`. */
async function finishClaw(game: Game, empower: boolean): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const r = await game.settle();
    if (r.reason !== "unanswered") {
      return;
    }
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      await (empower ? game.p1.yes() : game.p1.no());
    } else if (d?.kind === "pick" && d.seat === P1 && d.allowDecline) {
      await (empower && d.options[0] ? game.p1.pick(d.options[0].key) : game.p1.decline());
    } else {
      return;
    }
  }
}

describe("Wild Claw × Dune Drake × Dragon Roost — location choice and the Roost's optional cost on an effect-play", () => {
  // ---- (a) who chooses, and between what -------------------------------------------------------------

  test("(a) the DESTINATION is P1's decision (the player playing the card, 355.2 / 191.1): P1's base or P1-controlled bf2 — never P2's Roost for free", async () => {
    const { game, dest } = await clawIntoDrake();
    expect(dest.seat).toBe(P1);
    expect(game.actingSeat()).toBe(P1);
    expect(dest).toMatchObject({ allowDecline: false, max: 1, min: 1 });
    expect(destKeys(dest)).toEqual(expect.arrayContaining(["base", "bf2"]));
    // Whatever else is offered, an enemy-held battlefield is never a FREE destination (355.2.a):
    // without floating power the menu is exactly base + bf2.
    const { dest: noPower } = await clawIntoDrake(0);
    expect(destKeys(noPower)).toEqual(["base", "bf2"]);
  });

  // ---- (b) the Roost's optional additional cost on a 0-energy effect-play --------------------------------

  test("(b) with [A][A] floating the effect-play must ALSO offer Dragon Roost — optional additional costs are declared in step 2 of every play (419.3.b, 355.1.a, 356.2.b.1, 355.2.b)", async () => {
    // Expected: destination options = base, bf2 AND roost (paying [A][A] makes the Roost Valid).
    // Actual: the effect-play's choose-destination prompt lists only base / battlefield-bf2 — the
    // Roost's play-to-here permission is consulted for hand plays (see (e)) but not for effect-plays.
    const { dest } = await clawIntoDrake();
    expect(destKeys(dest)).toEqual(["base", "bf2", "roost"]);
  });

  test("(b)(c) choosing the Roost costs exactly [A][A] on top of the 0 energy (5−5), puts the Drake on P2's Roost EXHAUSTED and marks it Contested by P1 (356.4 then 356.2.b.1; 359.2.c; 190.3.a.1)", async () => {
    // Expected: energy 0 / body 0 / rainbow 0; drake @ roost, exhausted; roost contested by P1, still P2's.
    // Actual: "battlefield-roost" is not a legal answer to the destination prompt (throws).
    const { game } = await clawIntoDrake();
    await game.p1.pick("battlefield-roost");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, rainbow: 0 } });
    expect(game.zoneOf("drake")).toBe("battlefield-roost");
    expect(game.state("drake")).toMatchObject({ controller: P1, isExhausted: true, might: 5 });
    expect(game.gameState.battlefields.roost).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
  });

  test("(b) …and once Wild Claw's chain is done (recycle + optional Empower on the Drake) the cleanup stages a COMBAT at the Roost with P1 attacking on P1's own turn: 5 v 2 kills the Keeper, P1 conquers (+1) (190.3.a.1, 323.12-13, 464.2.c.1)", async () => {
    // Expected: legal "attack by play"; Empowered 5-Might Drake beats the 2-Might Keeper; roost → P1, 1 point.
    // Actual: unreachable — the Roost is not offered on the effect-play.
    const { game } = await clawIntoDrake();
    await game.p1.pick("battlefield-roost");
    await finishClaw(game, true);
    await game.settle();
    expect(game.state("drake").isEmpowered).toBe(true); // "Empower it" follows the Drake wherever it landed
    expect(game.zoneOf("keeper")).toBe("trash");
    expect(game.locationOf("drake")).toBe("roost");
    expect(game.gameState.battlefields.roost).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("wc")).toBe("trash");
  });

  // ---- (c) what is paid / how it enters, per branch --------------------------------------------------------

  test("(c) base branch: 5−5 = 0 — nothing beyond Wild Claw's own 7+[body] is spent (the [A][A] stay), the Drake enters the base EXHAUSTED (143.4 — no Accelerate), the other four are recycled, the 6th card is now on top", async () => {
    const { game } = await clawIntoDrake();
    await game.p1.pick("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, rainbow: 2 } });
    expect(game.zoneOf("drake")).toBe("base");
    expect(game.state("drake")).toMatchObject({ controller: P1, isExhausted: true, might: 5 });
    await finishClaw(game, false);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, rainbow: 2 } });
    const deck = game.p1.deck();
    expect(deck[0]).toBe("sixth");
    expect(deck.slice(-4).sort()).toEqual(["s1", "s2", "s3", "skulker"]);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.zoneOf("wc")).toBe("trash");
    expect(game.gameState.battlefields.roost).toMatchObject({ contested: false, controller: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("(c) bf2 branch: the Drake lands at P1's own bf2 exhausted for 0 extra; P1 already controls it so nothing is Contested and no showdown follows", async () => {
    const { game } = await clawIntoDrake();
    await game.p1.pick("battlefield-bf2");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, rainbow: 2 } });
    expect(game.zoneOf("drake")).toBe("battlefield-bf2");
    expect(game.state("drake").isExhausted).toBe(true);
    await finishClaw(game, false);
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.can("startShowdown")).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.units("bf2").sort()).toEqual(["drake", "holder"]);
  });

  test("(c) 'Then you may do this: Empower it' — accepting Empowers the DRAKE (wherever it landed), never the spell", async () => {
    const { game } = await clawIntoDrake();
    await game.p1.pick("base");
    await finishClaw(game, true);
    expect(game.state("drake").isEmpowered).toBe(true);
    expect(game.state("wc").isEmpowered).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // ---- (d) declining after the look ---------------------------------------------------------------------------

  test("(d) 'You MAY banish' — P1 can decline after looking (128.6): nothing is banished or played, all five go to the bottom, no Empower question, no power spent, back to P1's open main phase", async () => {
    const game = await board().build();
    await game.p1.cast("wc");
    await game.settle();
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    await game.p1.decline();
    const r = await game.settle();
    expect(r.reason).toBe("open"); // no yes/no was left hanging
    expect(game.zoneOf("drake")).toBe("mainDeck");
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.base()).toEqual([]);
    const deck = game.p1.deck();
    expect(deck[0]).toBe("sixth");
    expect(deck.slice(-5).sort()).toEqual(["drake", "s1", "s2", "s3", "skulker"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, rainbow: 2 } });
    expect(game.zoneOf("wc")).toBe("trash");
    expect(game.actingSeat()).toBe(P1);
  });

  // ---- (e) contrasts -----------------------------------------------------------------------------------------

  test("(e) from HAND the very same menu exists — base / bf2 / Roost — and the plain play costs the full 5 (the [A][A] untouched), entering exhausted", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { rainbow: 2 } })
      .battlefield("roost", { controller: P2, def: DRAGON_ROOST, inert: false, owner: P2 })
      .battlefield("bf2", { controller: P1 })
      .unit(P2, "roost", { might: 2, name: "Roost Keeper" }, "keeper")
      .unit(P1, "bf2", { might: 1, name: "Holder" }, "holder")
      .hand(P1, DUNE_DRAKE, "drake")
      .build();
    expect(handDestinations(game, "drake")).toEqual(["base", "bf2", "roost"]);
    await game.p1.play("drake", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 2 } });
    await game.settle();
    expect(game.zoneOf("drake")).toBe("base");
    expect(game.state("drake").isExhausted).toBe(true);
  });

  test("(e) from HAND onto P2's Roost: 5 energy + [A][A], Drake arrives exhausted, contests, and the staged combat on P1's turn kills the Keeper — P1 conquers the Roost (+1)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { rainbow: 2 } })
      .battlefield("roost", { controller: P2, def: DRAGON_ROOST, inert: false, owner: P2 })
      .battlefield("bf2", { controller: P1 })
      .unit(P2, "roost", { might: 2, name: "Roost Keeper" }, "keeper")
      .unit(P1, "bf2", { might: 1, name: "Holder" }, "holder")
      .hand(P1, DUNE_DRAKE, "drake")
      .build();
    await game.p1.play("drake", { to: "roost" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.zoneOf("drake")).toBe("battlefield-roost");
    expect(game.state("drake").isExhausted).toBe(true);
    await game.settle();
    await game.settle();
    expect(game.zoneOf("keeper")).toBe("trash");
    expect(game.locationOf("drake")).toBe("roost");
    expect(game.gameState.battlefields.roost).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.turnPlayer()).toBe(P1);
  });

  test("(e) from HAND: 4 energy is not enough, one [A] short removes only the Roost option, and on P2's turn the Drake is not playable at all", async () => {
    const mk = (energy: number, rainbow: number, active = P1) =>
      scenario()
        .active(active)
        .resources(P1, { energy, power: { rainbow } })
        .battlefield("roost", { controller: P2, def: DRAGON_ROOST, inert: false, owner: P2 })
        .battlefield("bf2", { controller: P1 })
        .unit(P2, "roost", { might: 2, name: "Roost Keeper" }, "keeper")
        .unit(P1, "bf2", { might: 1, name: "Holder" }, "holder")
        .hand(P1, DUNE_DRAKE, "drake")
        .build();
    expect((await mk(4, 2)).p1.can("play", "drake")).toBe(false);
    expect(handDestinations(await mk(5, 1), "drake")).toEqual(["base", "bf2"]);
    expect((await mk(5, 2, P2)).p1.can("play", "drake")).toBe(false);
  });

  test("(e) an effect that NAMES the destination (Portal Rescue: 'its owner plays it to their base') asks no location at all — the Drake goes to base exhausted, the Roost is never an option and the [A][A] are untouched (419.3.b, 357.3)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { mind: 1, rainbow: 2 } })
      .battlefield("roost", { controller: P2, def: DRAGON_ROOST, inert: false, owner: P2 })
      .battlefield("bf2", { controller: P1 })
      .unit(P2, "roost", { might: 2, name: "Roost Keeper" }, "keeper")
      .unit(P1, "bf2", DUNE_DRAKE, "drake")
      .hand(P1, PORTAL_RESCUE, "pr")
      .build();
    await game.p1.cast("pr", { targets: "drake" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0, rainbow: 2 } });
    // Resolve by hand so any destination / pay prompt would surface here instead of being auto-answered.
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // nothing was asked
    expect(game.zoneOf("drake")).toBe("base");
    expect(game.state("drake")).toMatchObject({ controller: P1, isExhausted: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0, rainbow: 2 } });
    expect(game.gameState.battlefields.roost).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.can("startShowdown")).toBe(false);
    expect(game.zoneOf("pr")).toBe("trash");
  });
});
