/**
 * Jayce, Hammer in Hand — ven-088-166 · Champion Unit (Jayce) · Body · 4 energy + [body] · 5 Might
 *
 *   When I become ready, choose one to give me this turn —
 *     • [Assault 2] (+2 [Might] while I'm an attacker.)
 *     • [Deflect 2] (Opponents must pay [rainbow][rainbow] to choose me with a spell or ability.)
 *     • [Ganking] (I can move from battlefield to battlefield.)
 *
 * Rules: 415.1 / 415.3 (Ready: exhausted → ready; an already-ready unit "cannot be readied" and nothing
 * happens — so no "become ready" event, 415.1.c), 315.1.b (Awaken readies everything you control →
 * the trigger fires at the start of each of your turns while he was exhausted), 383 (triggered ability
 * → chain item, choice made on resolution), 807/809/810 (the three keywords; all granted "this turn"
 * only), 359.3 ("this turn" ends with the turn it was granted in — whoever's turn that is).
 *
 * Head-judge notes — the tricky situations for THIS card:
 *  1. Jayce has NO printed keywords. Deflect 2 / Ganking exist only for the turn they were chosen; a
 *     Jayce nobody chose Deflect for is a free target, and one nobody chose Ganking for cannot hop
 *     battlefields. (The parser currently bolts Deflect 2 + Ganking on permanently and drops the choice.)
 *  2. "When I become ready" is ANY ready transition — the Awaken step and a mid-turn ready effect
 *     alike — but never a "ready" aimed at an already-ready Jayce, and never another unit readying.
 *  3. The natural line: start of turn → Awaken readies him → trigger on the chain in the Beginning
 *     Phase → pick Assault → swing for 7 that turn; next turn the grant is gone and he is asked again.
 *  4. Deflect is the pick when he is readied on the OPPONENT's turn (a Reaction ready effect): from
 *     then on that turn their spells need [rainbow][rainbow] extra to choose him.
 *  5. Cost 4 + [body]; enters exhausted, which by itself triggers nothing.
 */

import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-088-166";
const CLEAVE = "ogn-004-298"; // 1-cost Fury Action: give a unit Assault 3 this turn (an opposing targeted spell)
const SECOND_WIND = {
  abilities: [{ effect: { target: { type: "unit" }, type: "ready" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Second Wind",
  rulesText: "[Reaction] Ready a unit.",
  timing: "reaction",
} as const;
const MODE = { assault: 0, deflect: 1, ganking: 2 } as const; // printed order

/** Pass chain priority until a non-action prompt appears (or the chain is gone). */
async function toPrompt(game: Game): Promise<Decision | null> {
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context !== "chain") {
      return d;
    }
    await game.seat(d.seat).passPriority();
  }
  return game.decision();
}

/** Resolve Jayce's trigger and answer its three-way choice for P1. */
async function choose(game: Game, mode: keyof typeof MODE): Promise<void> {
  const d = await toPrompt(game);
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  const options = d?.kind === "pick" ? d.options : [];
  expect(options).toHaveLength(3);
  const byLabel = options.find((o) => new RegExp(mode, "i").test(o.label));
  await game.p1.pick(byLabel?.key ?? String(MODE[mode]));
  await game.settle();
}

/** P2 about to end the turn; P1's exhausted Jayce holds bf1; bf2 is P2's with a 6-Might Warden. */
function dawn() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 6, name: "Warden" }, "warden")
    .unit(P1, "bf1", CARD, "jayce", { exhausted: true });
}

describe("Jayce, Hammer in Hand (ven-088-166)", () => {
  // Expected: exactly one ability — a self "ready" trigger whose effect is a choice of three turn-scoped
  // keyword grants (Assault 2 / Deflect 2 / Ganking) — and no free-standing keyword abilities.
  // Actual: the trigger's effect is unparsed `raw` text and Deflect 2 + Ganking were emitted as
  // permanent keyword abilities.
  test("registry payload should be a single ready-trigger with a 3-way keyword choice, not permanent Deflect 2 + Ganking keywords", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "body", energyCost: 4, isChampion: true, might: 5, name: "Jayce, Hammer in Hand", powerCost: ["body"], tags: ["Jayce"] });
    const abilities = (def?.abilities ?? []) as { type: string; keyword?: string; trigger?: unknown; effect?: { type: string; options?: unknown[] } }[];
    expect(abilities.filter((a) => a.type === "keyword")).toEqual([]);
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({ trigger: { event: "ready", on: "self" }, type: "triggered" });
    expect(abilities[0]?.effect?.type).toBe("choice");
    expect(abilities[0]?.effect?.options).toHaveLength(3);
    const blob = JSON.stringify(abilities[0]?.effect);
    expect(blob).toMatch(/"keyword":"Assault".*"value":2|"value":2.*"keyword":"Assault"/);
    expect(blob).toContain('"keyword":"Deflect"');
    expect(blob).toContain('"keyword":"Ganking"');
    expect(blob).toContain('"duration":"turn"');
  });

  test("cost: 4 energy + 1 body; enters the base exhausted at 5 Might — and entering exhausted raises no trigger; no body pip → not playable", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { body: 1 } }).hand(P1, CARD, "jayce").build();
    await game.p1.play("jayce");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { body: 0 } });
    expect(game.chain().filter((c) => c.triggered)).toEqual([]);
    await game.settle();
    expect(game.state("jayce")).toMatchObject({ isExhausted: true, might: 5, zone: "base" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect((await scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "j").build()).p1.can("play", "j")).toBe(false);
  });

  // Expected: no printed keywords at all. Actual: keywords = ["Deflect", "Ganking"].
  test("a Jayce for whom nothing was chosen has no keywords (Deflect/Ganking are per-turn choices, not printed)", async () => {
    const game = await scenario().unit(P1, "base", CARD, "jayce").build();
    expect(game.state("jayce").keywords).toEqual([]);
    expect(game.state("jayce").grantedKeywords).toEqual([]);
  });

  // Expected (809 applies only if he HAS Deflect): with no choice made this turn, P2's 1-energy Cleave may
  // pick Jayce with zero power floating. Actual: the bogus permanent Deflect 2 hides him from the target list.
  test("without a Deflect choice this turn an opponent can target Jayce with a spell paying no extra power", async () => {
    const game = await scenario().active(P2).resources(P2, { energy: 1 }).unit(P1, "base", CARD, "jayce").unit(P2, "base", { might: 2 }, "theirs").hand(P2, CLEAVE, "cleave").build();
    const targets = game.p2.option("cast", "cleave")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual(expect.arrayContaining([["jayce"], ["theirs"]]));
    await game.p2.cast("cleave", { targets: "jayce" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
  });

  // Expected (810 only if he HAS Ganking): a ready Jayce at bf1 who was not granted Ganking this turn has
  // no battlefield→battlefield move. Actual: gank is offered off the bogus permanent keyword.
  test("without a Ganking choice this turn Jayce cannot move battlefield → battlefield", async () => {
    const game = await scenario().battlefield("bf1", { controller: P1 }).battlefield("bf2", { controller: null }).unit(P1, "bf1", CARD, "jayce").build();
    expect(game.p1.can("gank", "jayce")).toBe(false);
    expect(game.p1.legal().some((o) => o.moveId === "standardMove")).toBe(true); // the ordinary move home is still there
  });

  test("Awaken readies him at the start of your turn → 'When I become ready' goes on the chain in the Beginning Phase as P1's triggered item", async () => {
    const game = await dawn().build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.state("jayce").isReady).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "jayce", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  // Expected: once both pass, P1 is asked to choose one of three modes. Actual: the raw effect resolves
  // silently and the turn proceeds to the main phase with nothing granted.
  test("resolving the ready trigger asks P1 to choose one of Assault 2 / Deflect 2 / Ganking", async () => {
    const game = await dawn().build();
    await game.p2.endTurn();
    const d = await toPrompt(game);
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options : []).toHaveLength(3);
  });

  // Expected: Assault 2 this turn → 7 Might while attacking (807.1.c raises Might itself, so the Warden's 6
  // back is not lethal): he kills the 6-Might Warden, survives and conquers bf2. Actual: no choice is offered.
  test.failing("BUG: choosing Assault 2 — granted for the turn, he attacks the 6-Might Warden as a 7, kills it, survives and conquers", async () => {
    const game = await dawn().build();
    await game.p2.endTurn();
    await choose(game, "assault");
    expect(game.phase()).toBe("main");
    expect(game.state("jayce").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 2 }]);
    await game.p1.move("jayce", "bf2");
    expect(game.state("jayce")).toMatchObject({ combatRole: "attacker", might: 7 });
    await game.settle();
    expect(game.zoneOf("warden")).toBe("trash");
    expect(game.locationOf("jayce")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
  });

  test("control: with no Assault the same attack is 5 into 6 — Jayce dies and bf2 stays P2's", async () => {
    const direct = await scenario().battlefield("bf2", { controller: P2 }).unit(P2, "bf2", { might: 6, name: "Warden" }, "warden").unit(P1, "base", CARD, "jayce").build();
    await direct.p1.move("jayce", "bf2");
    expect(direct.state("jayce").might).toBe(5);
    await direct.settle();
    expect(direct.zoneOf("jayce")).toBe("trash");
    expect(direct.gameState.battlefields.bf2?.controller).toBe(P2);
  });

  // Expected: Ganking this turn → bf1 → bf2 hop is legal now; after the turn passes the grant is gone.
  // Actual: no choice is offered (and Ganking is wrongly permanent, so the expiry half cannot hold either).
  test("choosing Ganking — he may hop bf1 → bf2 this turn; the grant is gone once the turn ends", async () => {
    const game = await dawn().build();
    await game.p2.endTurn();
    await choose(game, "ganking");
    expect(game.state("jayce").grantedKeywords).toEqual([{ duration: "turn", keyword: "Ganking" }]);
    expect(game.p1.can("gank", "jayce")).toBe(true);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("jayce").grantedKeywords).toEqual([]);
    expect(game.state("jayce").keywords).toEqual([]);
  });

  test("a mid-turn ready EFFECT on an exhausted Jayce also fires the trigger (not only the Awaken step)", async () => {
    const game = await scenario().unit(P1, "base", CARD, "jayce", { exhausted: true }).hand(P1, SECOND_WIND, "wind").build();
    await game.p1.cast("wind", { targets: "jayce" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Second Wind resolves → Jayce readies → trigger
    expect(game.state("jayce").isReady).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "jayce", controller: P1, triggered: true })]);
  });

  test("negative space (415.1.c): 'readying' an ALREADY-READY Jayce is not becoming ready — no trigger; and an ally becoming ready is not 'I'", async () => {
    const ready = await scenario().unit(P1, "base", CARD, "jayce").hand(P1, SECOND_WIND, "wind").build();
    await ready.p1.cast("wind", { targets: "jayce" });
    await ready.settle();
    expect(ready.chain()).toEqual([]);
    expect(ready.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });

    const ally = await scenario().unit(P1, "base", CARD, "jayce", { exhausted: true }).unit(P1, "base", { might: 2, name: "Ally" }, "ally", { exhausted: true }).hand(P1, SECOND_WIND, "wind").build();
    await ally.p1.cast("wind", { targets: "ally" });
    await ally.p1.passPriority();
    await ally.p2.passPriority();
    expect(ally.state("ally").isReady).toBe(true);
    expect(ally.chain()).toEqual([]);
    expect(ally.state("jayce").isExhausted).toBe(true);
  });

  // Expected: on P2's turn, P1 answers P2's first Cleave with the Reaction Second Wind on exhausted Jayce; the
  // ready trigger resolves (LIFO, before Cleave) and P1 picks Deflect 2; for the rest of P2's turn a second
  // Cleave cannot choose Jayce without [rainbow][rainbow]. Actual: no choice prompt (and Deflect is wrongly always-on).
  test("choosing Deflect 2 when readied on the OPPONENT's turn — their next spell that turn cannot pick him without 2 extra power, but could before", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2 })
      .unit(P1, "base", CARD, "jayce", { exhausted: true })
      .unit(P2, "base", { might: 2, name: "Pupil" }, "pupil")
      .hand(P2, CLEAVE, "cleave1")
      .hand(P2, CLEAVE, "cleave2")
      .hand(P1, SECOND_WIND, "wind")
      .build();
    const targetsOf = (c: string) => game.p2.option("cast", c)?.fields.find((f) => f.arg === "targets")?.options;
    expect(targetsOf("cleave1")).toEqual(expect.arrayContaining([["jayce"], ["pupil"]])); // no Deflect yet
    await game.p2.cast("cleave1", { targets: "pupil" });
    await game.p2.passPriority();
    await game.p1.cast("wind", { targets: "jayce" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Second Wind resolves → trigger on top of Cleave
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave1", "jayce"]);
    await choose(game, "deflect"); // resolves the trigger, then Cleave 1
    expect(game.state("jayce").grantedKeywords).toEqual([{ duration: "turn", keyword: "Deflect", value: 2 }]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(targetsOf("cleave2")).toEqual([["pupil"]]); // 1 energy left, no power: Jayce is off the menu
  });
});
