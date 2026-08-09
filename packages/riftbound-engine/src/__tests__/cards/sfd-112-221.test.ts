/**
 * Kato the Arm — sfd-112-221 · Unit · Body · 4 energy + [body] · 3 Might
 *
 *   [Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)
 *   When I move to a battlefield, give another friendly unit my keywords and +[Might] equal to my
 *   Might this turn.
 *
 * Head-judge notes — the tricky spots for this card:
 *  - Trigger condition is "move TO A BATTLEFIELD": base → bf and (with granted Ganking) bf → bf fire;
 *    bf → base does not. Moves never use the chain (446.3.c) but the trigger does — and per 460 a
 *    staged combat only begins once the chain is empty, so a buddy that walked in WITH Kato is
 *    pumped before the showdown/combat opens (Kato 3 + buddy 2+3 = 8).
 *  - "another friendly unit": anywhere on the board (no "here"), never Kato; none → nothing happens.
 *  - "+Might equal to my Might" reads Kato's CURRENT Might on resolution (359.3.f.2): buffed Kato → +4.
 *  - "my keywords" = Deflect (plus anything granted to him, e.g. Ganking this turn) — the recipient
 *    must really gain Deflect (opponents pay [rainbow] more to target it), not a placeholder string.
 *  - "this turn": both the Might and the keywords fall off in the Expiration Step.
 *  - His own Deflect: an opponent's targeted spell needs an extra power of any domain.
 *  - Cost 4 + [body].
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision, Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-112-221";
const BOLT = {
  abilities: [{ effect: { amount: 5, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  timing: "action",
};
const REACTION_BOLT = {
  ...BOLT,
  abilities: [{ effect: { amount: 5, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  name: "Test Reaction Bolt",
  timing: "reaction",
};

function board() {
  return scenario()
    .battlefield("own", { controller: P1 })
    .battlefield("enemy", { controller: P2 })
    .unit(P1, "own", { might: 1, name: "Flag Holder" }, "holder")
    .unit(P1, "base", CARD, "kato")
    .unit(P1, "base", { might: 2, name: "Buddy" }, "buddy")
    .unit(P2, "base", { might: 2, name: "Foe" }, "foe");
}

/** Pass priority around; answer Kato's target prompt with `target` when it appears. */
async function resolveTrigger(game: Game, target?: string): Promise<string[]> {
  let offered: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context !== "chain")) {
      break;
    }
    if (d.kind === "action") {
      await game.seat(d.seat).passPriority();
    } else if (d.kind === "pick") {
      offered = d.options.map((o) => o.card ?? o.key);
      expect(target).toBeDefined();
      await game.seat(d.seat).pick(target as string);
    } else {
      throw new Error(`unexpected ${d.kind} prompt: ${d.prompt}`);
    }
  }
  return offered;
}

describe("Kato the Arm (sfd-112-221)", () => {
  test("cost: 4 energy + 1 body; enters base exhausted, 3 Might, printed Deflect; unaffordable without the body pip or at 3 energy", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { body: 1 } }).hand(P1, CARD, "kato").build();
    await game.p1.play("kato");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.zoneOf("kato")).toBe("base");
    expect(game.state("kato")).toMatchObject({ isExhausted: true, might: 3 });
    expect(game.state("kato").keywords).toEqual(["Deflect"]);
    expect(game.chain()).toHaveLength(0); // playing is not moving: no trigger
    expect((await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "kato").build()).p1.can("play", "kato")).toBe(false);
    expect((await scenario().resources(P1, { energy: 3, power: { body: 1 } }).hand(P1, CARD, "kato").build()).p1.can("play", "kato")).toBe(false);
  });

  test("moving base → battlefield puts the trigger on the chain; the chosen OTHER friendly unit (anywhere) gets +3 Might this turn; Kato himself is not offered", async () => {
    const game = await board().build();
    await game.p1.move("kato", "own");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kato", controller: P1, triggered: true })]);
    const offered = await resolveTrigger(game, "buddy");
    expect([...offered].sort()).toEqual(["buddy", "holder"]); // base unit and battlefield unit; no kato, no foe
    expect(game.state("buddy").might).toBe(5);
    expect(game.state("holder").might).toBe(1);
    expect(game.state("kato").might).toBe(3); // he gives, he does not gain
    expect(game.state("foe").might).toBe(2);
  });

  test("'this turn': the +Might (and any granted keyword) is gone after the turn ends", async () => {
    const game = await board().build();
    await game.p1.move("kato", "own");
    await resolveTrigger(game, "buddy");
    expect(game.state("buddy").might).toBe(5);
    await game.advanceTurn();
    expect(game.state("buddy").might).toBe(2);
    expect(game.state("buddy").grantedKeywords).toEqual([]);
    expect(game.state("buddy").keywords).toEqual([]);
  });

  test("'give … my keywords' — the recipient gains Deflect (Kato's printed keyword) this turn, not a '$self-keywords' placeholder", async () => {
    // Expected: buddy.keywords contains "Deflect" (granted, duration turn). Actual: the literal
    // string "$self-keywords" is granted and Deflect is never copied.
    const game = await board().build();
    await game.p1.move("kato", "own");
    await resolveTrigger(game, "buddy");
    expect(game.state("buddy").keywords).toContain("Deflect");
    expect(game.state("buddy").keywords).not.toContain("$self-keywords");
    expect(game.state("buddy").grantedKeywords).toContainEqual(expect.objectContaining({ duration: "turn", keyword: "Deflect" }));
  });

  test("807.1.b.3: a copied keyword keeps its VALUE — Kato's printed [Deflect 1] lands on the buddy as Deflect 1, not a valueless keyword", async () => {
    const game = await board().build();
    await game.p1.move("kato", "own");
    await resolveTrigger(game, "buddy");
    const deflect = (game.state("buddy").grantedKeywords ?? []).find((gk) => gk.keyword === "Deflect");
    expect(deflect).toBeDefined();
    expect(deflect?.value).toBe(1);
  });

  test("the copied Deflect is functional — this turn an opponent must pay an extra power to target the buddy (809)", async () => {
    // Expected: this turn P2 (exactly 1 energy, no power) cannot Bolt the buddy — Deflect surcharge unpaid.
    // Actual: no Deflect is copied, so the Bolt is legal.
    const live = await board().resources(P2, { energy: 1 }).hand(P2, REACTION_BOLT, "bolt").hand(P1, BOLT, "spark").resources(P1, { energy: 1 }).build();
    await live.p1.move("kato", "own");
    await resolveTrigger(live, "buddy");
    await live.p1.cast("spark", { targets: "foe" }); // open a chain so P2 gets priority this turn
    await live.p1.passPriority();
    expect(live.actingSeat()).toBe(P2);
    const targets = (live.p2.option("cast", "bolt")?.fields.find((f) => f.arg === "targets")?.options ?? []) as string[][];
    expect(targets).toContainEqual(["holder"]); // control: the Reaction bolt itself is castable now
    expect(targets).not.toContainEqual(["buddy"]); // …but not at the Deflect-ed buddy without a spare power
    const r = await live.p2.try((p) => p.cast("bolt", { targets: "buddy" }));
    expect(r.ok).toBe(false);
    expect(live.zoneOf("bolt")).toBe("hand");
  });

  test("Kato's own Deflect: an opponent's targeted spell is illegal without a spare power and legal (paying it) with one", async () => {
    const broke = await scenario().active(P2).resources(P2, { energy: 1 }).unit(P1, "base", CARD, "kato").hand(P2, BOLT, "bolt").build();
    expect((await broke.p2.try((p) => p.cast("bolt", { targets: "kato" }))).ok).toBe(false);
    expect(broke.zoneOf("bolt")).toBe("hand");
    const rich = await scenario().active(P2).resources(P2, { energy: 1, power: { chaos: 1 } }).unit(P1, "base", CARD, "kato").hand(P2, BOLT, "bolt").build();
    await rich.p2.cast("bolt", { targets: "kato" });
    expect(rich.p2.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await rich.settle();
    expect(rich.zoneOf("kato")).toBe("trash");
  });

  test("359.3.f.2: the bonus reads Kato's CURRENT Might on resolution — a buffed Kato (4) gives +4", async () => {
    const game = await scenario()
      .battlefield("own", { controller: P1 })
      .unit(P1, "own", { might: 1, name: "Flag Holder" }, "holder")
      .unit(P1, "base", CARD, "kato", { buffed: true })
      .build();
    expect(game.state("kato").might).toBe(4);
    await game.p1.move("kato", "own");
    await resolveTrigger(game, "holder");
    expect(game.state("holder").might).toBe(5);
  });

  test("460: walking in WITH a buddy onto an enemy battlefield — the trigger resolves before combat opens, so the buddy fights as 5 (3 + 5 = 8 kills a 7-Might defender)", async () => {
    const game = await scenario()
      .battlefield("enemy", { controller: P2 })
      .unit(P2, "enemy", { might: 7, name: "Wall" }, "wall")
      .unit(P1, "base", CARD, "kato")
      .unit(P1, "base", { might: 2, name: "Buddy" }, "buddy")
      .build();
    await game.p1.move(["kato", "buddy"], "enemy");
    expect(game.chain()).toHaveLength(1);
    expect((game.decision() as ActionDecision).context).toBe("chain"); // not yet a showdown
    await resolveTrigger(game, "buddy"); // sole candidate may be auto-bound
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.state("buddy").might).toBe(5);
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.gameState.battlefields.enemy?.controller).toBe(P1);
    expect(game.locationOf("buddy")).toBe("enemy"); // 7 damage: Kato (3) dies first, buddy (5) survives 4
  });

  test("negative space: the same attack without Kato's pump (buddy stays 2) loses to the 7-Might wall", async () => {
    const game = await scenario()
      .battlefield("enemy", { controller: P2 })
      .unit(P2, "enemy", { might: 7, name: "Wall" }, "wall")
      .unit(P1, "base", { might: 3, name: "Not Kato" }, "notKato")
      .unit(P1, "base", { might: 2, name: "Buddy" }, "buddy")
      .build();
    await game.p1.move(["notKato", "buddy"], "enemy");
    expect(game.chain()).toHaveLength(0);
    await game.settle();
    expect(game.zoneOf("wall")).toBe("battlefield-enemy");
    expect(game.gameState.battlefields.enemy?.controller).toBe(P2);
  });

  test("moving battlefield → BASE is not 'to a battlefield': no trigger, nobody pumped", async () => {
    const game = await scenario()
      .battlefield("own", { controller: P1 })
      .unit(P1, "own", CARD, "kato")
      .unit(P1, "own", { might: 1, name: "Flag Holder" }, "holder")
      .unit(P1, "base", { might: 2, name: "Buddy" }, "buddy")
      .build();
    await game.p1.move("kato", "base");
    expect(game.chain()).toHaveLength(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("buddy").might).toBe(2);
    expect(game.state("holder").might).toBe(1);
  });

  test("battlefield → battlefield (Ganking granted to him this turn) is also a move to a battlefield: the trigger fires again", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", CARD, "kato", { grantedKeywords: [{ duration: "turn", keyword: "Ganking" }] })
      .unit(P1, "bf1", { might: 1, name: "Flag Holder" }, "holder")
      .build();
    expect(game.state("kato").keywords).toEqual(expect.arrayContaining(["Deflect", "Ganking"]));
    await game.p1.gank("kato", "bf2");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kato", triggered: true })]);
    await resolveTrigger(game, "holder");
    expect(game.state("holder").might).toBe(4);
    await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1); // and he conquers the empty enemy field
  });

  test("no other friendly unit: Kato still moves (and conquers), nothing is pumped, no prompt is left dangling", async () => {
    const game = await scenario()
      .battlefield("enemy", { controller: P2 })
      .unit(P1, "base", CARD, "kato")
      .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
      .build();
    await game.p1.move("kato", "enemy");
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.locationOf("kato")).toBe("enemy");
    expect(game.gameState.battlefields.enemy?.controller).toBe(P1);
    expect(game.state("foe").might).toBe(2); // enemy units are never "friendly"
    expect(game.state("kato").might).toBe(3);
  });

  test("the opponent gets priority on the move trigger before the pump lands (they could answer with a Reaction)", async () => {
    const game = await board().build();
    await game.p1.move("kato", "own");
    await game.p1.pick("buddy"); // rule 402 (finalization): the target is chosen before priority
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect((game.decision() as ActionDecision).context).toBe("chain");
    expect(game.state("buddy").might).toBe(2);
    expect(game.state("holder").might).toBe(1);
  });

  test("parsed abilities match the printed text: Deflect keyword + a self move-to-battlefield trigger giving another friendly unit +Might(self) and self's keywords for the turn", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", energyCost: 4, might: 3, powerCost: ["body"] });
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toHaveLength(2);
    expect(abilities[0]).toMatchObject({ keyword: "Deflect", type: "keyword" });
    expect(abilities[1]).toMatchObject({ trigger: { event: "move-to-battlefield", on: "self" }, type: "triggered" });
    const seq = (abilities[1] as { effect: { type: string; effects: Record<string, unknown>[] } }).effect;
    expect(seq.type).toBe("sequence");
    const another = { controller: "friendly", excludeSelf: true, type: "unit" };
    expect(seq.effects).toContainEqual(expect.objectContaining({ amount: { might: "self" }, duration: "turn", target: another, type: "modify-might" }));
    expect(seq.effects).toContainEqual(expect.objectContaining({ duration: "turn", target: another, type: "grant-keywords" }));
  });
});
