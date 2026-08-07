/**
 * Cataclysmic Duel — ven-090-166 · Spell · Body · 8 energy + [body][body][body]
 *
 *   Each player chooses a unit they control. Kill the rest.
 *
 * Rules: no [Action]/[Reaction] → standard timing only (your turn, open state, empty chain, no
 * showdown — 316.5 / 310.1.a); 108.2 ("a unit THEY CONTROL" reads control, not ownership); 425/142.5
 * (Kill → owner's trash; it IS a death, so Deathknell fires); 190.4.c (a battlefield whose controller
 * has no units left there becomes uncontrolled at the next cleanup); every player — caster included —
 * makes their own choice, and the choice is mandatory when that player controls at least one unit.
 *
 * Head-judge notes — the tricky spots this file covers:
 *  1. Symmetric board wipe with one survivor PER PLAYER: base units and battlefield units alike are
 *     "the rest"; gear, legends and runes are untouched.
 *  2. Edge counts: a player with exactly one unit keeps it with nothing else of theirs dying; a player
 *     with zero units chooses nothing and the spell still wipes the other side down to one.
 *  3. Control ≠ ownership: a unit P1 owns but P2 controls is P2's to keep (and it survives if P2 keeps
 *     it); P1 is never offered it. Killed units go to their OWNER's trash.
 *  4. Kill is a death: a Carrion Dredger among "the rest" leaves a Bird token behind (Deathknell), and
 *     the freshly created Bird is NOT swept up by the same resolution (it was not on the board when
 *     "the rest" was determined).
 *  5. Aftermath: P2's battlefield emptied by the wipe becomes uncontrolled (190.4.c).
 *  6. Cost/timing: 8 + three body power exactly; 7 energy or two body → illegal; illegal on the
 *     opponent's turn, inside a showdown even while holding Focus, and as a response on a chain.
 * Partner cards: Carrion Dredger unl-153-219 (Deathknell token), Discipline ogn-058-298 (a Reaction
 * used only to put something on the chain), Cull the Weak ogn-209-298 is the symmetric little sibling.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-090-166";
const CARRION_DREDGER = "unl-153-219"; // 1 Might · [Deathknell] play a 1-Might Bird token to your base
const DISCIPLINE = "ogn-058-298"; // [Reaction] +2 Might this turn, draw 1 — 2 energy

function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { body: 3 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "base", { might: 6, name: "P1 Champion" }, "p1keep")
    .unit(P1, "base", { might: 1, name: "P1 Squire" }, "p1base")
    .unit(P1, "bf2", { might: 2, name: "P1 Scout" }, "p1bf")
    .gear(P1, { abilities: [], name: "P1 Relic" }, "p1gear")
    .unit(P2, "bf1", { might: 7, name: "P2 Giant" }, "p2keep")
    .unit(P2, "bf1", { might: 2, name: "P2 Guard" }, "p2bf")
    .unit(P2, "base", { might: 3, name: "P2 Clerk" }, "p2base")
    .gear(P2, { abilities: [], name: "P2 Relic" }, "p2gear")
    .hand(P1, CARD, "duel");
}

/** Cast the Duel with P1 intending to keep `p1Choice`, P2 scripted to keep `p2Choice`; drive every prompt to completion. */
async function duel(game: Game, p1Choice: string | undefined, p2Choice: string | undefined): Promise<void> {
  if (p2Choice !== undefined) {
    game.script(P2, [p2Choice]);
  }
  await game.p1.cast("duel", p1Choice !== undefined ? { answers: [p1Choice] } : {});
  expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  for (let i = 0; i < 8; i++) {
    const r = await game.settle();
    if (r.reason !== "unanswered") {
      break;
    }
    const d = game.decision();
    if (d?.kind !== "pick") {
      break;
    }
    const want = d.seat === P1 ? p1Choice : p2Choice;
    const key = d.options.find((o) => (o.card ?? o.key) === want)?.key ?? d.options[0]?.key;
    await game.seat(d.seat).pick(key as string);
  }
  expect(game.zoneOf("duel")).toBe("trash");
}

describe("Cataclysmic Duel (ven-090-166)", () => {
  test("registry payload should carry a parsed 'each player chooses a unit they control / kill the rest' spell effect", async () => {
    // Expected: one spell ability with a structured effect (per-player choice + kill of the complement).
    // Actual: `abilities` is absent — the card text did not parse at all, so the spell resolves as a blank.
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "body", energyCost: 8, name: "Cataclysmic Duel", powerCost: ["body", "body", "body"], timing: "standard" });
    const abilities = (def?.abilities ?? []) as { type: string; effect?: { type?: string } }[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]?.type).toBe("spell");
    expect(abilities[0]?.effect?.type).not.toBe("raw");
    expect(JSON.stringify(abilities[0])).toMatch(/kill/);
  });

  test("cost: exactly 8 energy + 3 body power are deducted, the spell hits the chain and ends in the trash; 7 energy or only 2 body → not playable", async () => {
    const game = await board().build();
    await game.p1.cast("duel", { answers: ["p1keep"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.zoneOf("duel")).toBe("chain");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "duel", controller: P1, triggered: false })]);
    await game.settle({ policy: "first" });
    expect(game.zoneOf("duel")).toBe("trash");
    expect((await board().resources(P1, { energy: 7, power: { body: 4 } }).build()).p1.can("cast", "duel")).toBe(false);
    expect((await board().resources(P1, { energy: 9, power: { body: 2, fury: 3 } }).build()).p1.can("cast", "duel")).toBe(false);
  });

  test("each player keeps exactly the unit they chose — every OTHER unit on both sides (base and battlefield) is killed; gear is untouched", async () => {
    // Expected: survivors p1keep + p2keep only; four other units in their owners' trash; both relics stay.
    // Actual: the spell has no effect — all six units survive.
    const game = await board().build();
    await duel(game, "p1keep", "p2keep");
    expect(game.p1.units().sort()).toEqual(["p1keep"]);
    expect(game.p2.units().sort()).toEqual(["p2keep"]);
    for (const dead of ["p1base", "p1bf"]) {
      expect(game.p1.trash()).toContain(dead);
    }
    for (const dead of ["p2bf", "p2base"]) {
      expect(game.p2.trash()).toContain(dead);
    }
    expect(game.p1.gear()).toEqual(["p1gear"]);
    expect(game.p2.gear()).toEqual(["p2gear"]);
    expect(game.violations()).toEqual([]);
  });

  test("the choices are independent and real — P1 keeping the 1-Might Squire and P2 keeping the base Clerk kills both players' biggest units", async () => {
    // Expected: p1base + p2base survive, p1keep (6) and p2keep (7) die. Actual: nothing dies.
    const game = await board().build();
    await duel(game, "p1base", "p2base");
    expect(game.p1.units()).toEqual(["p1base"]);
    expect(game.p2.units()).toEqual(["p2base"]);
    expect(game.zoneOf("p1keep")).toBe("trash");
    expect(game.zoneOf("p2keep")).toBe("trash");
  });

  test("the opponent's choice is THEIRS — after P1 names its keeper, P2 is the seat prompted to choose among only P2-controlled units", async () => {
    // Expected: a pick decision for P2 listing p2keep/p2bf/p2base and none of P1's units. Actual: no prompt at all.
    const game = await board().build();
    await game.p1.cast("duel", { answers: ["p1keep"] });
    let d = game.decision();
    for (let i = 0; i < 6 && !(d?.kind === "pick" && d.seat === P2); i++) {
      const r = await game.settle();
      d = game.decision();
      if (r.reason === "open") {
        break;
      }
      if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick(d.options.find((o) => (o.card ?? o.key) === "p1keep")?.key ?? (d.options[0]?.key as string));
        d = game.decision();
      }
    }
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["p2base", "p2bf", "p2keep"]);
    expect(d?.kind === "pick" ? d.allowDecline : true).toBe(false); // mandatory when you control a unit
  });

  test("a player with exactly ONE unit simply keeps it; the caster's other units still die", async () => {
    // Expected: lonely survives untouched, P1 goes from 3 units to 1. Actual: nothing dies.
    const game = await scenario()
      .resources(P1, { energy: 8, power: { body: 3 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 6, name: "P1 Champion" }, "p1keep")
      .unit(P1, "base", { might: 1, name: "P1 Squire" }, "p1base")
      .unit(P1, "bf1", { might: 2, name: "P1 Scout" }, "p1bf")
      .unit(P2, "bf1", { might: 3, name: "Lonely" }, "lonely")
      .hand(P1, CARD, "duel")
      .build();
    await duel(game, "p1keep", "lonely");
    expect(game.p2.units()).toEqual(["lonely"]);
    expect(game.p1.units()).toEqual(["p1keep"]);
    expect(game.p1.trash()).toEqual(expect.arrayContaining(["p1base", "p1bf"]));
  });

  test("a player with ZERO units chooses nothing — the caster with no units still wipes the opponent down to their one keeper", async () => {
    // Expected: P2 keeps p2keep, p2bf + p2base die; P1 had nothing to choose. Actual: nothing dies.
    const game = await scenario()
      .resources(P1, { energy: 8, power: { body: 3 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 7, name: "P2 Giant" }, "p2keep")
      .unit(P2, "bf1", { might: 2, name: "P2 Guard" }, "p2bf")
      .unit(P2, "base", { might: 3, name: "P2 Clerk" }, "p2base")
      .hand(P1, CARD, "duel")
      .build();
    expect(game.p1.can("cast", "duel")).toBe(true); // no targets are required to PLAY it
    await duel(game, undefined, "p2keep");
    expect(game.p2.units()).toEqual(["p2keep"]);
    expect(game.p2.trash().sort()).toEqual(["p2base", "p2bf"]);
  });

  test("108.2 control, not ownership — a unit P1 owns but P2 controls is P2's to keep; it survives under P2 and P1's own units other than its keeper die", async () => {
    // Expected: turncoat stays on bf1 controlled by P2; p2other dies to P2's trash; p1base dies. Actual: nothing dies.
    const game = await scenario()
      .resources(P1, { energy: 8, power: { body: 3 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 6, name: "P1 Champion" }, "p1keep")
      .unit(P1, "base", { might: 1, name: "P1 Squire" }, "p1base")
      .card("turncoat", { controller: P2, def: { cardType: "unit", might: 5, name: "Turncoat" }, owner: P1, zone: "battlefield-bf1" })
      .unit(P2, "base", { might: 3, name: "P2 Other" }, "p2other")
      .hand(P1, CARD, "duel")
      .build();
    expect(game.p2.units().sort()).toEqual(["p2other", "turncoat"]);
    await duel(game, "p1keep", "turncoat");
    expect(game.locationOf("turncoat")).toBe("bf1");
    expect(game.state("turncoat").controller).toBe(P2);
    expect(game.zoneOf("p2other")).toBe("trash");
    expect(game.zoneOf("p1base")).toBe("trash");
    expect(game.p1.units()).toEqual(["p1keep"]);
  });

  test("killed, not banished/bounced — a Carrion Dredger among 'the rest' dies to its owner's trash and its Deathknell Bird token appears (and the new Bird is not itself swept up)", async () => {
    // Expected: dredger in P2's trash, a fresh 1-Might Bird token in P2's base alongside p2keep. Actual: nothing dies.
    const game = await scenario()
      .resources(P1, { energy: 8, power: { body: 3 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 6, name: "P1 Champion" }, "p1keep")
      .unit(P2, "base", { might: 7, name: "P2 Giant" }, "p2keep")
      .unit(P2, "bf1", CARRION_DREDGER, "dredger")
      .hand(P1, CARD, "duel")
      .build();
    await duel(game, "p1keep", "p2keep");
    await game.settle({ policy: "first" });
    expect(game.p2.trash()).toContain("dredger");
    const p2Units = game.p2.units();
    expect(p2Units).toContain("p2keep");
    expect(p2Units).toHaveLength(2);
    const bird = p2Units.find((id) => id !== "p2keep") as string;
    expect(game.state(bird)).toMatchObject({ isToken: true, might: 1 });
    expect(game.locationOf(bird)).toBe("base");
  });

  test("190.4.c aftermath — P2 keeps its base Clerk, so both P2 units at bf1 die and bf1 is left uncontrolled", async () => {
    // Expected: bf1.controller null after the wipe (P2 has no unit there any more). Actual: nothing dies, P2 keeps bf1.
    const game = await board().build();
    await duel(game, "p1keep", "p2base");
    expect(game.cardsAt("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.gameState.battlefields.bf2?.controller ?? null).toBeNull(); // P1's Scout at bf2 died too
  });

  test("standard timing: not playable on the opponent's turn, nor inside a showdown even while P1 holds Focus", async () => {
    const game = await board().active(P2).unit(P2, "base", { might: 2, name: "Walker" }, "walker").build();
    expect(game.p1.can("cast", "duel")).toBe(false);
    await game.p2.move("walker", "bf2"); // into P1's Scout → combat showdown, P2 has Focus
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "duel")).toBe(false);
  });

  test("standard timing: not playable as a response — with Discipline on the chain on P1's own turn, P1 cannot add the Duel", async () => {
    const game = await board().resources(P1, { energy: 10, power: { body: 3 } }).hand(P1, DISCIPLINE, "disc").build();
    expect(game.p1.can("cast", "duel")).toBe(true); // open state: fine
    await game.p1.cast("disc", { targets: "p1keep" });
    expect(game.chain()).toHaveLength(1);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "duel")).toBe(false);
    await game.settle();
    expect(game.p1.can("cast", "duel")).toBe(true); // chain empty again → legal (8 energy + 3 body still there)
  });
});
