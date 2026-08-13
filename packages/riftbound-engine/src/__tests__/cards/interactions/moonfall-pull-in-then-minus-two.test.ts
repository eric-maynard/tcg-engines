/**
 * Interaction: Moonfall (unl-198-219) — Action spell
 *     "Choose a battlefield where you have units. You may move up to one enemy unit to that
 *      battlefield. Then give enemy units there -2 [Might] this turn."
 *   × Shipyard Skulker (ogn-175-298) — vanilla 3 [M] unit, the defender already AT the chosen anchor
 *   × Overzealous Fan (sfd-128-221) — 2 [M], "When I defend, you may kill me to move an attacking unit
 *     to its base." — sitting in P2's base, i.e. a legal thing to drag into the fight
 *
 * Question: P1 attacks bfA with two units; P2's Shipyard Skulker defends. P2 also has a ready
 * Overzealous Fan in base and another unit at bfB, where P1 has NO units. P1 casts Moonfall with Focus
 * during the Combat Showdown at bfA. What is the EXACT option set of every decision Moonfall surfaces?
 *   (a) which battlefields are offered as the anchor — is bfB in the list? are bases?
 *   (b) which enemy units are offered for "up to one" — is the Skulker (already at bfA) in it? P1's own
 *       units? P2's base and bfB units? is a decline/zero branch offered?
 *   (c) if P1 declines the move, is the -2 half still applied, and is anything prompted for it?
 *   (d) if P1 drags Overzealous Fan into the combat, does a NEW decision surface for P2, with what set?
 *
 * Rules: 355.5 / 355.5.a (targets and only targets are chosen as the spell is played — a programmatic
 * instruction surfaces nothing), 355.4.a + 446.1 (a Move Effect needs a valid location OTHER than the
 * unit's current one), 355.10.b (a chosen battlefield is a target, not a mere restriction), 355.10.d /
 * 355.10.d.2 (a lone legal target is still a target and still chosen), 809.1.c + 357.3 ([Deflect]
 * surcharges are payable at finalization or the candidate drops out), 446.1 (move legality), 143.2.b
 * (Might below 0 reads as 0), 464.2.c.3 (a unit arriving at an ongoing combat takes its controller's
 * designation at the following Cleanup), 383.3.a / 383.3.a.2 / 383.3.b (the "you may … kill me to …"
 * trigger is opted into and paid at FINALIZATION; declining removes it from the chain).
 *
 * Answer: anchor = {bfA} only (bfB has no friendly unit; a base is never "a battlefield"); movers =
 * the enemy units NOT already at bfA (Fan in base, the bfB unit) plus a decline branch — the Skulker is
 * absent because it has nowhere to move to; the -2 is programmatic and prompts nothing, hitting every
 * enemy unit at bfA at the moment of resolution (including one dragged in a moment earlier).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MOONFALL = "unl-198-219";
const SKULKER = "ogn-175-298";
const OVERZEALOUS_FAN = "sfd-128-221";

function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { mind: 1 } })
    .battlefield("bfA", { controller: P2 })
    .battlefield("bfB", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Att1" }, "att1")
    .unit(P1, "base", { might: 2, name: "Att2" }, "att2")
    .unit(P2, "bfA", SKULKER, "skulker")
    .unit(P2, "base", OVERZEALOUS_FAN, "fan")
    .unit(P2, "bfB", { might: 2, name: "Far" }, "far")
    .hand(P1, MOONFALL, "moon");
}

/** Open the combat at bfA with both of P1's units and cast Moonfall with Focus. */
async function attackAndCast(): Promise<Game> {
  const game = await board().build();
  await game.p1.move(["att1", "att2"], "bfA");
  await game.p1.cast("moon");
  return game;
}

/** Push Moonfall to the point where its own choice is on the table, and return that decision. */
async function moonfallChoice(game: Game): Promise<Decision> {
  // rule 355.10.b — the anchor battlefield is Moonfall's own target, answered as
  // the spell is played; the facets below are about the pull that follows it.
  const anchor = game.decision();
  if (
    anchor?.kind === "pick" &&
    anchor.options.every((o) => game.gameState.battlefields[o.key] !== undefined)
  ) {
    await game.p1.pick(anchor.options[0]?.key as string);
  }
  if (game.decision()?.kind === "action") {
    await game.p1.passPriority();
    await game.p2.passPriority();
  }
  const d = game.decision();
  if (d === null) {
    throw new Error("Moonfall surfaced no choice at all");
  }
  return d;
}

/** The card ids a pick decision offers. */
function offered(d: Decision): string[] {
  return d.kind === "pick" ? [...d.options.map((o) => o.card ?? o.zone ?? o.key)].sort() : [];
}

describe("Moonfall — the anchor, the 'up to one' pull, and the -2 that follows", () => {
  test("(a) 'a battlefield where you have units' is mandatory: with P1's units only in a BASE the spell is not castable — a base is never an anchor (355.10.b, 355.8)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { mind: 1 } })
      .battlefield("bfA", { controller: P2 })
      .unit(P1, "base", { might: 2 }, "home")
      .unit(P2, "bfA", SKULKER, "skulker")
      .hand(P1, MOONFALL, "moon")
      .build();
    expect(game.p1.can("cast", "moon")).toBe(false);
  });

  // Expected: "Choose a battlefield where you have units" is a TARGET (355.10.b) settled as the spell is
  // played (355.5) — P1 must be asked, and the only legal answer is bfA (P1 has no unit at bfB). Even a
  // single legal target is still chosen rather than silently applied (355.10.d.2).
  // Actual: no anchor decision is ever surfaced; the engine binds the battlefield implicitly.
  test("the anchor battlefield is offered — Moonfall surfaces a target decision listing exactly bfA (355.10.b, 355.5, 355.10.d.2)", async () => {
    const game = await attackAndCast();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const list = offered(d as Decision);
    expect(list).toContain("bfA");
    expect(list).not.toContain("bfB"); // P1 has no unit there
    expect(list.some((k) => k.includes("base"))).toBe(false); // "a battlefield" is never a base
  });

  test("(a) the anchor is bfA in effect: only bfA's enemy units are debuffed and bfB's unit is untouched, so bfB was never a candidate", async () => {
    const game = await attackAndCast();
    const d = await moonfallChoice(game);
    expect(d.seat).toBe(P1);
    await game.p1.decline();
    expect(game.state("skulker").might).toBe(1); // 3 - 2 at the anchor
    expect(game.state("far").might).toBe(2); // bfB is not "there"
    expect(game.locationOf("far")).toBe("bfB");
  });

  // Expected: the move's destination is fixed to the anchor (355.4), so the CHOICE is which enemy unit
  // moves — and it is made as the spell is played, before P2 ever holds priority (355.5).
  // Actual: nothing is asked at play/finalization; the mover is picked while Moonfall RESOLVES.
  test.failing("BUG: the 'up to one enemy unit' mover is picked at RESOLUTION — it must be locked at finalization, before P2 gets priority (355.5)", async () => {
    const game = await attackAndCast();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, timing: "FIN" });
    expect(offered(d as Decision)).toContain("fan");
  });

  test("(b) the mover set contains only ENEMY units and offers the zero branch: Fan (base) and Far (bfB) are there, neither of P1's attackers is, and declining is legal (355.13)", async () => {
    const game = await attackAndCast();
    const d = await moonfallChoice(game);
    expect(d.kind).toBe("pick");
    const list = offered(d);
    expect(list).toContain("fan"); // enemy unit in a base — a valid origin
    expect(list).toContain("far"); // enemy unit at another battlefield
    expect(list).not.toContain("att1"); // "enemy unit" — never your own
    expect(list).not.toContain("att2");
    expect(d.kind === "pick" ? d.allowDecline : false).toBe(true); // "up to one" ⇒ zero is a branch
  });

  // Shipyard Skulker is already AT the anchor, so a Move Effect has no valid location for it
  // (355.4.a — a valid location is one OTHER than the unit's current one; 446.1): it is not offered.
  test("the unit already at the anchor (Shipyard Skulker) is not offered as a mover — it has nowhere to move to (355.4.a, 446.1)", async () => {
    const game = await attackAndCast();
    const d = await moonfallChoice(game);
    expect(offered(d)).toEqual(["far", "fan"].sort());
  });

  test("(c) declining the move does NOT skip the second half: every enemy unit at the anchor takes -2 with no prompt of its own (355.5.a, 355.10.d)", async () => {
    const game = await attackAndCast();
    await moonfallChoice(game);
    await game.p1.decline();
    expect(game.decision()).toMatchObject({ kind: "action" }); // nothing is asked for the -2
    expect(game.state("skulker").might).toBe(1);
    expect(game.state("att1").might).toBe(2); // your own units are never touched
    expect(game.state("att2").might).toBe(2);
    expect(game.state("fan").might).toBe(2); // in a base, not "there"
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("moon")).toBe("trash");
  });

  test("(c) follow-through: a 3 [M] defender left at 1 loses the combat to the two 2 [M] attackers and P1 conquers bfA", async () => {
    const game = await attackAndCast();
    await moonfallChoice(game);
    await game.p1.decline();
    await game.settle();
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.locationOf("att1")).toBe("bfA");
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("(d) dragging Overzealous Fan in: it lands at bfA, is a DEFENDER at the Cleanup that follows, and eats the -2 as an 'enemy unit there' → 2 - 2 = 0 (464.2.c.3, 143.2.b)", async () => {
    const game = await attackAndCast();
    await moonfallChoice(game);
    await game.p1.pick("fan");
    expect(game.locationOf("fan")).toBe("bfA");
    expect(game.state("fan").combatRole).toBe("defender");
    expect(game.state("fan").might).toBe(0);
    expect(game.state("skulker").might).toBe(1); // the unit that was already there is debuffed too
  });

  test("(d) the arrival fires 'When I defend': P2 — not P1 — is asked the opt-in at FINALIZATION, and its target set is exactly P1's two ATTACKERS (383.3.a, 383.3.b)", async () => {
    const game = await attackAndCast();
    await moonfallChoice(game);
    await game.p1.pick("fan");
    const optIn = game.decision();
    expect(optIn).toMatchObject({ kind: "yes-no", seat: P2, timing: "FIN" });
    expect(optIn?.source?.cardId).toBe("fan");
    expect(optIn?.source?.battlefieldId).toBe("bfA");
    await game.p2.yes(); // "kill me to" — the base cost is paid here
    expect(game.zoneOf("fan")).toBe("trash");
    const pick = game.decision() as Decision;
    expect(pick).toMatchObject({ kind: "pick", seat: P2, timing: "FIN" });
    expect(offered(pick)).toEqual(["att1", "att2"]); // not the Skulker, not itself, not P1's base units
  });

  test("(d) P2 takes the offer: one attacker goes home, the Fan is dead, and the 1 [M] Skulker still loses to the attacker that stayed", async () => {
    const game = await attackAndCast();
    await moonfallChoice(game);
    await game.p1.pick("fan");
    await game.p2.yes();
    await game.p2.pick("att1");
    await game.settle();
    expect(game.locationOf("att1")).toBe("base");
    expect(game.locationOf("att2")).toBe("bfA");
    expect(game.zoneOf("fan")).toBe("trash");
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
  });

  test("(d) P2 declines instead: the trigger is removed from the chain, the Fan stays on the board as a 0 [M] defender — and dies in the combat (383.3.a.2)", async () => {
    const game = await attackAndCast();
    await moonfallChoice(game);
    await game.p1.pick("fan");
    await game.p2.no();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("fan")).toBe("battlefield-bfA");
    expect(game.state("fan").might).toBe(0);
    await game.settle();
    expect(game.zoneOf("fan")).toBe("trash"); // 0 Might still needs one real point of damage
    expect(game.zoneOf("skulker")).toBe("trash");
    expect(game.locationOf("att1")).toBe("bfA");
    expect(game.gameState.battlefields.bfA?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
