/**
 * Kha'Zix, Evolving Hunter — ven-180-166 · Champion Unit (Kha'Zix) · Body · 5 energy + [body] · 5 Might
 * (Vendetta reprint of unl-119-219 — same text, must behave identically.)
 *
 *   [Hunt] (When I conquer or hold, gain 1 XP.)
 *   When I attack, you may spend 3 XP to deal damage equal to my Might to an enemy unit here.
 *
 * Rules: 823 (Hunt = "When I conquer or hold, my controller gains X XP"; bare [Hunt] is Hunt 1), 383.4.e
 * (attack trigger: once, when I gain the Attacker designation — not when defending, not on a move that
 * starts no combat), 355.10.c.1 ("spend 3 XP to …" is a cost inside the effect: unpayable → the option
 * cannot be taken and nothing else happens), 359.3 ("my Might" / "here" read on resolution), 464.2.e
 * (the trigger resolves on the combat chain BEFORE combat damage), 815 (Tank only constrains COMBAT
 * damage assignment — ability damage may pick any enemy here), 143.2 (lethal = damage ≥ Might).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. XP arithmetic: 3 → 0 on yes, then Hunt +1 on the resulting conquer; 4 → 1 → 2; decline keeps all;
 *     2 XP → "yes" is not acceptable and no damage is dealt (proved with a defender that only dies if
 *     the 5 landed).
 *  2. Tank dodge: with a Tank 4 and a plain 2 defending, the ability may snipe the NON-Tank 2 (Tank
 *     governs combat assignment only); combat 5 vs Tank 4 then clears the field → conquer.
 *  3. Partner Onslaught (ven-081, same domain): +6 first → "equal to my Might" is 11 → an 11-Might wall
 *     dies to the ability alone and Kha'Zix walks in.
 *  4. "here": defenders at the OTHER battlefield / in base / friends are never offered.
 *  5. Only on attack: defending on P2's turn → no prompt; empty battlefield → no prompt but Hunt still
 *     pays on the conquer; hold at turn start → +1 XP.
 *  6. Reprint parity: the parsed abilities equal unl-119-219's exactly.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-180-166";
const ORIGINAL = "unl-119-219";
const ONSLAUGHT = "ven-081-166"; // Body · 4 · Give a unit +6 Might this turn.

function board(xp: number, foeMight: number) {
  return scenario()
    .xp(P1, xp)
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: foeMight, name: "Foe" }, "foe")
    .unit(P2, "bf2", { might: 1, name: "Elsewhere" }, "else")
    .unit(P2, "base", { might: 1, name: "Home" }, "home")
    .unit(P1, "base", CARD, "kz");
}

async function attackToPrompt(game: Game, units: string | string[] = "kz"): Promise<void> {
  await game.p1.move(units, "bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kz", controller: P1, triggered: true })]);
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
}

/** Say yes and shoot `target`; returns the offered ids (or [target] if the lone legal enemy was taken without asking). */
async function spendAndShoot(game: Game, target: string): Promise<string[]> {
  await game.p1.yes();
  // rule 402 (finalization): the target is chosen right away; the effect waits for the chain item to resolve.
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

describe("Kha'Zix, Evolving Hunter (ven-180-166)", () => {
  test("registry payload: Body champion 5+[body], 5 Might; Hunt 1 (+ conquer/hold gain-xp 1) and ONE optional attack trigger = sequence[spend-xp 3, damage {might:self} to an enemy unit here] — identical to the unl-119-219 printing", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "body", energyCost: 5, isChampion: true, might: 5, name: "Kha'Zix, Evolving Hunter", tags: ["Kha'Zix"] });
    expect(def?.powerCost).toEqual(["body"]);
    type Ab = { type: string; keyword?: string; optional?: boolean; trigger?: { event?: string; on?: string }; effect?: Record<string, unknown> };
    const abilities = (def?.abilities ?? []) as Ab[];
    expect(abilities).toHaveLength(4);
    expect(abilities.filter((a) => a.type === "keyword")).toEqual([{ keyword: "Hunt", type: "keyword", value: 1 } as Ab]);
    for (const ev of ["conquer", "hold"]) {
      expect(abilities.filter((a) => a.trigger?.event === ev)).toEqual([expect.objectContaining({ effect: { amount: 1, type: "gain-xp" }, trigger: { event: ev, on: "self" }, type: "triggered" })]);
    }
    expect(abilities.find((a) => a.trigger?.event === "attack")).toMatchObject({
      effect: { effects: [{ amount: 3, type: "spend-xp" }, { amount: { might: "self" }, target: { controller: "enemy", location: "here", type: "unit" }, type: "damage" }], type: "sequence" },
      optional: true,
      trigger: { event: "attack", on: "self" },
      type: "triggered",
    });
    expect(abilities).toEqual(pool.get(ORIGINAL)?.abilities as Ab[]);
  });

  test("cost: exactly 5 energy + 1 body; enters base exhausted as a 5 with Hunt, no chain item; 4 energy, or a mind pip instead of body → unplayable", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { body: 1 } }).hand(P1, CARD, "kz").build();
    await game.p1.play("kz");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.state("kz")).toMatchObject({ isExhausted: true, might: 5, zone: "base" });
    expect(game.state("kz").keywords).toContain("Hunt");
    expect((await scenario().resources(P1, { energy: 4, power: { body: 2 } }).hand(P1, CARD, "k").build()).p1.can("play", "k")).toBe(false);
    expect((await scenario().resources(P1, { energy: 5, power: { mind: 1 } }).hand(P1, CARD, "k").build()).p1.can("play", "k")).toBe(false);
  });

  test("exactly 3 XP vs a lone 5: yes → XP 0, 5 damage kills Foe before combat damage → Kha'Zix conquers unhurt, +1 point, Hunt refunds to 1 XP", async () => {
    const game = await board(3, 5).build();
    await attackToPrompt(game);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no" });
    expect(game.p1.xp()).toBe(3);
    await spendAndShoot(game, "foe");
    expect(game.p1.xp()).toBe(0);
    expect(game.zoneOf("foe")).toBe("trash");
    await game.settle();
    expect(game.state("kz")).toMatchObject({ damage: 0, location: "bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("spend is exactly 3, not all: 4 XP → 1 after the shot → 2 after the Hunt conquer", async () => {
    const game = await board(4, 3).build();
    await attackToPrompt(game);
    await spendAndShoot(game, "foe");
    expect(game.p1.xp()).toBe(1);
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.xp()).toBe(2);
  });

  test("declining: XP stays 3, no damage; 5 vs 5 trades, nobody conquers, no Hunt", async () => {
    const game = await board(3, 5).build();
    await attackToPrompt(game);
    await game.p1.no();
    await game.settle();
    expect(game.p1.xp()).toBe(3);
    expect(game.zoneOf("kz")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.p1.points()).toBe(0);
  });

  test("2 XP: the spend cannot be paid — 'yes' is refused, nothing is dealt (a 6-Might Foe survives 5 combat damage and kills Kha'Zix), XP stays 2", async () => {
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
    expect(game.state("foe")).toMatchObject({ zone: "battlefield-bf1" });
    expect(game.zoneOf("kz")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("Tank dodge (815): Tank 4 + plain 2 defending — the ability may snipe the NON-Tank 2 (both are offered); then 5 vs Tank 4 in combat clears bf1 and Kha'Zix conquers", async () => {
    const game = await scenario()
      .xp(P1, 3)
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { keywords: ["Tank"], might: 4, name: "Bulwark" }, "tank")
      .unit(P2, "bf1", { might: 2, name: "Squishy" }, "squishy")
      .unit(P1, "base", CARD, "kz")
      .build();
    await attackToPrompt(game);
    const offered = await spendAndShoot(game, "squishy");
    expect(offered).toEqual(["squishy", "tank"]);
    expect(game.zoneOf("squishy")).toBe("trash");
    expect(game.state("tank").damage).toBe(0);
    await game.settle();
    expect(game.zoneOf("tank")).toBe("trash"); // 5 ≥ 4
    expect(game.locationOf("kz")).toBe("bf1"); // 4 < 5
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.xp()).toBe(1);
  });

  test("partner Onslaught: +6 first (11 Might) → 'equal to my Might' is read on resolution → an 11-Might wall dies to the ability alone and Kha'Zix conquers untouched", async () => {
    const game = await board(3, 11).resources(P1, { energy: 4 }).hand(P1, ONSLAUGHT, "ons").build();
    await game.p1.cast("ons", { targets: "kz" });
    await game.settle();
    expect(game.state("kz").might).toBe(11);
    await attackToPrompt(game);
    await spendAndShoot(game, "foe");
    expect(game.zoneOf("foe")).toBe("trash");
    await game.settle();
    expect(game.state("kz")).toMatchObject({ damage: 0, location: "bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("negative space for the above: WITHOUT Onslaught the 5 only dents the 11 (damage 5), which then kills Kha'Zix in combat; XP spent for nothing", async () => {
    const game = await board(3, 11).build();
    await attackToPrompt(game);
    await spendAndShoot(game, "foe");
    expect(game.state("foe")).toMatchObject({ damage: 5, zone: "battlefield-bf1" });
    await game.settle();
    expect(game.zoneOf("kz")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("battlefield-bf1");
    expect(game.p1.xp()).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("'an enemy unit HERE': with a co-attacking Pal, only Foe is a legal shot — not Pal, not Kha'Zix, not Elsewhere (bf2), not Home (base)", async () => {
    const game = await board(3, 9).unit(P1, "base", { might: 1, name: "Pal" }, "pal").build();
    await attackToPrompt(game, ["kz", "pal"]);
    await game.p1.yes();
    // rule 402 (finalization): the target is picked immediately, before priority.
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["foe"]);
      for (const illegal of ["pal", "kz", "else", "home"]) {
        expect((await game.p1.try((p) => p.pick(illegal))).ok).toBe(false);
      }
      await game.p1.pick("foe");
    }
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.state("foe").damage).toBe(5);
    for (const untouched of ["pal", "else", "home"]) {
      expect(game.state(untouched).damage).toBe(0);
    }
    expect(game.p1.xp()).toBe(0);
  });

  test("no trigger when DEFENDING (P2's turn): a 2-Might raider hits Kha'Zix's field → no Kha'Zix chain item, no prompt, XP untouched; he kills it and keeps bf1", async () => {
    const game = await scenario().active(P2).xp(P1, 3).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "kz").unit(P2, "base", { might: 2, name: "Raider" }, "raider").build();
    await game.p2.move("raider", "bf1");
    expect(game.chain().some((i) => i.cardId === "kz")).toBe(false);
    expect((await game.settle()).reason).toBe("open");
    expect(game.p1.xp()).toBe(3);
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.locationOf("kz")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("no combat, no trigger: onto an EMPTY enemy battlefield → never a yes/no, conquers (+1 point) and bare [Hunt] pays exactly 1 XP (3 → 4)", async () => {
    const game = await scenario().xp(P1, 3).battlefield("bf1", { controller: P2 }).unit(P1, "base", CARD, "kz").build();
    await game.p1.move("kz", "bf1");
    expect(game.chain().some((i) => i.cardId === "kz")).toBe(false); // no attack trigger; Hunt comes later, on the conquer
    expect(game.decision()?.kind).not.toBe("yes-no");
    expect((await game.settle()).reason).toBe("open");
    expect((await game.settle()).reason).toBe("open"); // never "unanswered"
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(4);
  });

  test("[Hunt] on hold: parked on bf1 through P1's turn start → +1 XP and the hold point; P2's turn start pays P1 nothing and P2 nothing", async () => {
    const game = await scenario().turn(2).active(P2).xp(P1, 0).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "kz").build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.xp()).toBe(1);
    expect(game.p1.points()).toBe(1);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.xp()).toBe(1);
    expect(game.p2.xp()).toBe(0);
  });

  test("three holds fund one shot: from 0 XP, holding bf2 through three of P1's turn starts reaches exactly 3, and the attack prompt on bf1 is then acceptable", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .xp(P1, 0)
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P1 })
      .unit(P2, "bf1", { might: 5, name: "Foe" }, "foe")
      .unit(P1, "bf2", { might: 1, name: "Squatter" }, "squatter")
      .unit(P1, "base", CARD, "kz")
      .unit(P1, "bf2", "unl-094-219", "gemhand") // Gemhand Hunter: [Hunt] — the holder that earns the XP
      .build();
    for (let i = 0; i < 3; i++) {
      await game.advanceToTurnOf(P1);
      expect(game.p1.xp()).toBe(i + 1);
      if (i < 2) {
        await game.advanceTurn();
      }
    }
    expect(game.p1.xp()).toBe(3);
    await attackToPrompt(game);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    await spendAndShoot(game, "foe");
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.p1.xp()).toBe(0);
  });
});
