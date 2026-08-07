/**
 * Kha'Zix, Evolving Hunter — unl-119-219 · Champion Unit (Kha'Zix) · Body · 5 energy + [body] · 5 Might
 *
 *   [Hunt] (When I conquer or hold, gain 1 XP.)
 *   When I attack, you may spend 3 XP to deal damage equal to my Might to an enemy unit here.
 *
 * Rules: 823 (Hunt 1 = "When I conquer or hold, my controller gains 1 XP"), 383.4.e (Attack Trigger:
 * fires once when he gains the Attacker designation — never when defending, never on an empty
 * battlefield where no combat happens), 355.10.c.1 ("spend 3 XP to …" is a cost inside the instruction:
 * unpayable → the option cannot be taken; the enemy unit IS targeted), 730.2 (spend = reduce XP; it can
 * never go below 0), 359.3 ("my Might" and "here" are read on RESOLUTION), 464.2.e (the trigger sits on
 * the combat chain and resolves before combat damage, so a unit it kills never strikes back), 143.2
 * (lethal = damage ≥ Might), 190.4 (control after combat).
 *
 * Head-judge notes — the tricky spots this file covers:
 *  1. XP gate: exactly 3 → 0 after paying; 2 XP → the option is not available and NOTHING is dealt
 *     (discriminated with a 6-Might defender that only dies if the ability fired); declining keeps 3.
 *  2. Pre-combat kill: 5 to a lone 5-Might defender empties the defence → Kha'Zix conquers untouched,
 *     and Hunt immediately refunds 1 XP (3 → 0 → 1). One short (6-Might): it survives the ability,
 *     then 5 more in combat kills it while it kills Kha'Zix — a trade instead of a clean loss.
 *  3. "an ENEMY unit HERE": co-attacking friends, Kha'Zix himself, enemies at another battlefield or
 *     in base are never offered; with two defenders he snipes one and fights the other.
 *  4. "equal to my Might" at resolution: buffed (6) → 6 damage; P2 reacting with a -2 → only 3 damage.
 *  5. Only on ATTACK: defending on P2's turn or walking onto an empty battlefield → no prompt (but the
 *     empty-battlefield conquer still pays Hunt).
 *  6. Economy across turns: at 2 XP a partner's hold (Gemhand Hunter, unl-094) at turn start makes 3,
 *     and Kha'Zix can cash it in on that very turn's attack.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-119-219";
const GEMHAND_HUNTER = "unl-094-219"; // Body 2-drop with [Hunt]
const SHRINK = {
  abilities: [{ effect: { amount: -2, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 0,
  name: "Shrink",
  timing: "reaction",
} as const;

/** P1 (xp) has Kha'Zix + Pal(1) in base; P2 holds bf1 with Foe(foeMight) [+ Foe2(2) if twoDefenders], Else(1) at bf2, Home(1) in base. */
function board(xp: number, foeMight: number, twoDefenders = false) {
  const s = scenario()
    .xp(P1, xp)
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: foeMight, name: "Foe" }, "foe");
  if (twoDefenders) {
    s.unit(P2, "bf1", { might: 2, name: "Foe2" }, "foe2");
  }
  return s
    .unit(P2, "bf2", { might: 1, name: "Else" }, "else")
    .unit(P2, "base", { might: 1, name: "Home" }, "home")
    .unit(P1, "base", CARD, "kz")
    .unit(P1, "base", { might: 1, name: "Pal" }, "pal")
    .hand(P2, SHRINK, "shrink");
}

/** Attack bf1 with Kha'Zix (+ companions) and drain to his optional prompt. */
async function attackToPrompt(game: Game, units: string | string[] = "kz"): Promise<void> {
  await game.p1.move(units, "bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kz", controller: P1, triggered: true })]);
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
}

/**
 * Say yes and shoot `target`; returns the offered target ids ([target] when a lone legal enemy is taken
 * without asking). rule 402 (finalization): the opt-in and the target pick both happen immediately, before
 * priority; the two passes below resolve just that chain item (the showdown stays open).
 */
async function spendAndShoot(game: Game, target: string): Promise<string[]> {
  await game.p1.yes();
  const d = game.decision();
  let offered = [target];
  if (d?.kind === "pick" && d.seat === P1) {
    offered = d.options.map((o) => o.card ?? o.key).sort();
    await game.p1.pick(target);
  }
  await game.acting().passPriority();
  await game.acting().passPriority();
  return offered;
}

describe("Kha'Zix, Evolving Hunter (unl-119-219)", () => {
  test("registry payload: Hunt 1 (+ conquer/hold gain-xp 1 twins) and ONE optional attack trigger = sequence[spend-xp 3, damage {might: self} to an enemy unit here]; 5 energy + [body], 5 Might, champion", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "body", energyCost: 5, isChampion: true, might: 5, name: "Kha'Zix, Evolving Hunter", tags: ["Kha'Zix"] });
    expect(def?.powerCost).toEqual(["body"]);
    type Ab = { type: string; keyword?: string; value?: number; optional?: boolean; trigger?: { event?: string; on?: string }; effect?: Record<string, unknown> };
    const abilities = (def?.abilities ?? []) as Ab[];
    expect(abilities.filter((a) => a.type === "keyword")).toEqual([{ keyword: "Hunt", type: "keyword", value: 1 }]);
    for (const ev of ["conquer", "hold"]) {
      expect(abilities.filter((a) => a.type === "triggered" && a.trigger?.event === ev)).toEqual([
        expect.objectContaining({ effect: { amount: 1, type: "gain-xp" }, trigger: { event: ev, on: "self" } }),
      ]);
    }
    const attack = abilities.filter((a) => a.type === "triggered" && a.trigger?.event === "attack");
    expect(attack).toHaveLength(1);
    expect(attack[0]).toMatchObject({
      effect: {
        effects: [
          { amount: 3, type: "spend-xp" },
          { amount: { might: "self" }, target: { controller: "enemy", location: "here", type: "unit" }, type: "damage" },
        ],
        type: "sequence",
      },
      optional: true,
      trigger: { event: "attack", on: "self" },
    });
    expect(abilities).toHaveLength(4);
  });

  test("cost: 5 energy + 1 body; enters base exhausted as a 5-Might unit with Hunt and no chain item; short energy / missing or wrong-domain power → not playable", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { body: 1 } }).hand(P1, CARD, "kz").build();
    await game.p1.play("kz");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.state("kz")).toMatchObject({ isExhausted: true, might: 5, zone: "base" });
    expect(game.state("kz").keywords).toContain("Hunt");
    expect((await scenario().resources(P1, { energy: 4, power: { body: 2 } }).hand(P1, CARD, "k").build()).p1.can("play", "k")).toBe(false);
    expect((await scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "k").build()).p1.can("play", "k")).toBe(false);
    expect((await scenario().resources(P1, { energy: 5, power: { chaos: 1 } }).hand(P1, CARD, "k").build()).p1.can("play", "k")).toBe(false);
  });

  test("3 XP, lone 5-Might defender: yes → XP 3→0, exactly 5 damage kills Foe BEFORE combat → Kha'Zix conquers undamaged (+1 point) and Hunt pays 1 XP back", async () => {
    const game = await board(3, 5).build();
    await attackToPrompt(game);
    expect(game.p1.xp()).toBe(3); // nothing spent while the trigger waits
    await spendAndShoot(game, "foe");
    expect(game.p1.xp()).toBe(0);
    expect(game.zoneOf("foe")).toBe("trash");
    await game.settle();
    expect(game.locationOf("kz")).toBe("bf1");
    expect(game.state("kz").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(1); // Hunt on conquer
    expect(game.violations()).toEqual([]);
  });

  test("declining keeps the 3 XP: plain 5-vs-5 trade, both die, nobody conquers, no Hunt", async () => {
    const game = await board(3, 5).build();
    await attackToPrompt(game);
    await game.p1.no();
    await game.settle();
    expect(game.p1.xp()).toBe(3);
    expect(game.zoneOf("kz")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.p1.points()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
  });

  test("only 2 XP: the spend cannot be made — no damage is dealt (a 6-Might Foe survives the 5 combat damage), XP stays exactly 2, Kha'Zix dies", async () => {
    const game = await board(2, 6).build();
    await game.p1.move("kz", "bf1");
    await game.settle();
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      expect(d.canAccept).toBe(false);
      expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
      await game.p1.no();
    } else if (d?.kind === "pick" && d.seat === P1) {
      expect((await game.p1.try((p) => p.pick("foe"))).ok).toBe(false);
      await game.p1.decline();
    }
    await game.settle();
    expect(game.p1.xp()).toBe(2);
    expect(game.zoneOf("foe")).toBe("battlefield-bf1"); // 5 < 6: the ability never added its 5
    expect(game.zoneOf("kz")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("one short — 6-Might Foe: the 5 from the ability does not kill it, but 5 more in combat does (10 ≥ 6) while its 6 kills Kha'Zix: a trade, no conquer, XP 0", async () => {
    const game = await board(3, 6).build();
    await attackToPrompt(game);
    await spendAndShoot(game, "foe");
    expect(game.state("foe")).toMatchObject({ damage: 5, zone: "battlefield-bf1" });
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.zoneOf("kz")).toBe("trash");
    expect(game.p1.points()).toBe(0);
    expect(game.p1.xp()).toBe(0);
  });

  test("'an ENEMY unit HERE': with Pal co-attacking two defenders, exactly Foe/Foe2 are offered (not Pal, not Kha'Zix, not Else at bf2, not Home in base); snipe Foe(5), then 5+1 vs Foe2(2) conquers", async () => {
    const game = await board(3, 5, true).build();
    await attackToPrompt(game, ["kz", "pal"]);
    const offered = await spendAndShoot(game, "foe");
    expect(offered).toEqual(["foe", "foe2"]);
    expect(game.zoneOf("foe")).toBe("trash");
    await game.settle();
    expect(game.zoneOf("foe2")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.locationOf("kz")).toBe("bf1");
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(1);
  });

  test("'equal to my Might' is read on resolution — BUFFED Kha'Zix (6) deals 6: a 6-Might Foe dies to the ability alone", async () => {
    const game = await scenario().xp(P1, 3).battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 6, name: "Foe" }, "foe").unit(P1, "base", CARD, "kz", { buffed: true }).build();
    expect(game.state("kz").might).toBe(6);
    await attackToPrompt(game);
    await spendAndShoot(game, "foe");
    expect(game.zoneOf("foe")).toBe("trash");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("counter-play — P2 reacts to the trigger with Shrink (-2 on Kha'Zix): only 3 damage lands on a 4-Might Foe; the 3-vs-4 fight then kills both (3+3 ≥ 4, 4 ≥ 3)", async () => {
    const game = await board(3, 4).build();
    await game.p1.move("kz", "bf1");
    // rule 402 (finalization): the "you may" and the target pick are answered before anyone gets priority
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes(); // lone legal enemy → Foe is auto-bound, no pick prompt
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.cast("shrink", { targets: "kz" });
    expect(game.chain().map((i) => i.name)).toEqual(["Kha'Zix, Evolving Hunter", "Shrink"]);
    await game.acting().passPriority();
    await game.acting().passPriority(); // → Shrink resolves
    expect(game.state("kz").might).toBe(3);
    await game.acting().passPriority();
    await game.acting().passPriority(); // → Kha'Zix's trigger resolves
    expect(game.state("foe")).toMatchObject({ damage: 3, zone: "battlefield-bf1" });
    expect(game.p1.xp()).toBe(0);
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.zoneOf("kz")).toBe("trash");
    expect(game.p1.points()).toBe(0);
  });

  test("no trigger when DEFENDING: a raider hits Kha'Zix's battlefield on P2's turn → no Kha'Zix chain item, no prompt, XP untouched; he kills the raider and keeps the field", async () => {
    const game = await scenario()
      .active(P2)
      .xp(P1, 3)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "kz")
      .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.chain().some((i) => i.cardId === "kz")).toBe(false);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.p1.xp()).toBe(3);
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.locationOf("kz")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("no trigger without combat: onto an EMPTY enemy battlefield → no prompt, conquers (+1 point) and Hunt makes it 4 XP", async () => {
    const game = await scenario().xp(P1, 3).battlefield("bf1", { controller: P2 }).unit(P1, "base", CARD, "kz").build();
    await game.p1.move("kz", "bf1");
    expect(game.chain().some((i) => i.cardId === "kz")).toBe(false); // no attack trigger (the Hunt item comes later, on conquer)
    expect((await game.settle()).reason).toBe("open");
    expect((await game.settle()).reason).toBe("open"); // never "unanswered": no yes/no was ever raised
    expect(game.decision()).toMatchObject({ context: "main", kind: "action" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(4);
  });

  test("[Hunt] on hold: Kha'Zix sitting on bf1 at the start of P1's turn → +1 XP and the hold point; the opponent's turn start gives nothing", async () => {
    const game = await scenario().turn(2).active(P2).xp(P1, 2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "kz").build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.xp()).toBe(3);
    expect(game.p1.points()).toBe(1);
    await game.advanceTurn(); // → P2: not P1's hold
    expect(game.p1.xp()).toBe(3);
    expect(game.p2.xp()).toBe(0);
  });

  test("economy across turns: 2 XP + Gemhand Hunter holding bf2 at P1's turn start → 3 XP → Kha'Zix attacks bf1 the same turn and can pay: Foe(5) sniped, conquer, 2 points total", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .xp(P1, 2)
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P1 })
      .unit(P2, "bf1", { might: 5, name: "Foe" }, "foe")
      .unit(P1, "bf2", GEMHAND_HUNTER, "hunter")
      .unit(P1, "base", CARD, "kz")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.xp()).toBe(3); // hunter's hold
    expect(game.p1.points()).toBe(1);
    expect(game.state("kz").isReady).toBe(true);
    await attackToPrompt(game);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no" });
    await spendAndShoot(game, "foe");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(2);
    expect(game.p1.xp()).toBe(1); // 3 - 3 + Hunt
    expect(game.violations()).toEqual([]);
  });
});
