/**
 * Rumble, Hotheaded — sfd-026-221 · Champion Unit (Rumble) · Fury · 4 energy · 4 Might
 *
 *   Your Mechs each have [Assault]. (+1 [Might] while we're attackers.)
 *   When I conquer, you may recycle another friendly unit to play a Mech from your trash. Reduce
 *   its Energy cost by the Might of the unit you recycled.
 *
 * Head-judge checklist for this card:
 *  - Static (364/522, 807): every FRIENDLY Mech — including ones that arrive later, including the
 *    Mech this very trigger plays — has Assault 1; enemy Mechs and friendly non-Mechs do not; it is
 *    gone the moment Rumble leaves the board; it only adds Might while ATTACKING (a defending Mech
 *    gets nothing). Reminder text says "we" → Rumble counts himself among "your Mechs".
 *  - Trigger: only when RUMBLE conquers (not another unit); optional ("you may").
 *  - Cost-within-instruction (355.10.c.1): recycling ANOTHER friendly unit (never Rumble) is the
 *    price; with no other friendly unit the Mech cannot be played at all.
 *  - "play a Mech from your trash": only Mech-tagged units are offered; it is PLAYED (enters
 *    exhausted, to base or a battlefield you control, its own play effects fire) and its Energy
 *    cost is reduced by the recycled unit's Might — 7-cost Mega-Mech after recycling a 3-Might unit
 *    costs 4; a reduction ≥ cost makes it free, never a refund. Power costs are untouched.
 *  - Cost: 4 energy, no power.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-026-221";
const MEGA_MECH = "ogn-088-298"; // Mind unit · 7 energy · 8 Might · Mech
const BUBBLE_BOT = "sfd-062-221"; // Mind unit · 3 energy · 3 Might · Mech · "When you play me, ready another friendly Mech."
const SKULKER = "ogn-175-298"; // vanilla 3-Might non-Mech unit
const EXHAUSTED = { __flags: { exhausted: true } } as const;

/** Rumble ready in base, an empty enemy battlefield to walk onto, fodder units, Mechs in the trash. */
function conquerBoard(energy = 8) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", CARD, "rumble")
    .unit(P1, "base", { might: 1, name: "Scrap" }, "scrap")
    .unit(P1, "base", { might: 3, name: "Big Scrap" }, "big")
    .trash(P1, MEGA_MECH, "mega")
    .trash(P1, BUBBLE_BOT, "bubble")
    .trash(P1, SKULKER, "skulker");
}

/** Rumble walks onto bf1 and conquers; drain to his optional-trigger prompt. */
async function conquer(game: Game) {
  await game.p1.move("rumble", "bf1");
  const stop = await game.settle();
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.p1.points()).toBe(1);
  return stop;
}

const assault = (game: Game, id: string) => game.state(id).grantedKeywords.filter((k) => k.keyword === "Assault");

/**
 * Answer P1's follow-up picks: for each prompt, if any key of `want.pick` is among the options, pick
 * its mapped value (else the first option). Returns the option lists seen, in order.
 */
async function drive(game: Game, want: { pick: Record<string, string> }): Promise<string[][]> {
  const seen: string[][] = [];
  for (let i = 0; i < 6 && game.decision()?.kind === "pick"; i++) {
    const keys = (game.decision() as { options: { key: string }[] }).options.map((o) => o.key);
    seen.push(keys);
    const match = Object.keys(want.pick).find((k) => keys.includes(k));
    await game.p1.pick(match ? (want.pick[match] as string) : (keys[0] as string));
    await game.settle();
  }
  return seen;
}

describe("Rumble, Hotheaded (sfd-026-221)", () => {
  test("registry payload (skeleton): static Assault 1 to friendly Mech units + optional 'When I conquer' trigger with a recycle-another-friendly-unit cost that plays a Mech unit from trash", async () => {
    await conquerBoard().build();
    const def = peekDefaultCardPool()?.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", energyCost: 4, isChampion: true, might: 4 });
    const [stat, trig] = (def?.abilities ?? []) as Record<string, any>[];
    expect(stat).toEqual({
      effect: { duration: "permanent", keyword: "Assault", target: { controller: "friendly", filter: { tag: "Mech" }, type: "unit" }, type: "grant-keyword", value: 1 },
      type: "static",
    });
    expect(trig).toMatchObject({
      condition: { cost: { recycle: { amount: 1, from: "board", target: { controller: "friendly", excludeSelf: true, type: "unit" } } }, type: "pay-cost" },
      effect: { from: "trash", target: { filter: { tag: "Mech" }, type: "unit" }, type: "play" },
      optional: true,
      trigger: { event: "conquer", on: "self" },
      type: "triggered",
    });
    expect(def?.abilities).toHaveLength(2);
  });

  test("'Reduce its Energy cost by the Might of the unit you recycled' is encoded as a Might-sized reduction, not ignoreCost:'energy'", async () => {
    await conquerBoard().build();
    const trig = (peekDefaultCardPool()?.get(CARD)?.abilities?.[1] ?? {}) as { effect?: Record<string, unknown> };
    expect(trig.effect?.ignoreCost).toBeUndefined();
    expect(JSON.stringify(trig.effect)).toMatch(/might/i);
  });

  test("cost: 4 energy, no power; enters exhausted; 3 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "rumble").build();
    await game.p1.play("rumble");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("rumble")).toBe("base");
    expect(game.state("rumble")).toMatchObject({ isExhausted: true, might: 4 });
    expect((await scenario().resources(P1, { energy: 3, power: { fury: 2 } }).hand(P1, CARD, "r").build()).p1.can("play", "r")).toBe(false);
  });

  test("static: friendly Mechs have Assault 1 — not friendly non-Mechs, not ENEMY Mechs; a Mech played later picks it up on arrival", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .unit(P1, "base", CARD, "rumble")
      .unit(P1, "base", MEGA_MECH, "mega")
      .unit(P1, "base", SKULKER, "skulker")
      .unit(P2, "base", MEGA_MECH, "theirs")
      .hand(P1, BUBBLE_BOT, "bubble")
      .build();
    expect(assault(game, "mega")).toEqual([expect.objectContaining({ keyword: "Assault", value: 1 })]);
    expect(game.state("mega").might).toBe(8); // Assault adds nothing at rest
    expect(assault(game, "skulker")).toEqual([]);
    expect(assault(game, "theirs")).toEqual([]);
    await game.p1.play("bubble");
    await game.settle({ policy: "first" }); // its "ready another friendly Mech" prompt is irrelevant here
    expect(game.zoneOf("bubble")).toBe("base");
    expect(assault(game, "bubble")).toEqual([expect.objectContaining({ keyword: "Assault", value: 1 })]);
  });

  test("'(+1 [Might] while WE're attackers)' — Rumble is one of 'your Mechs' and carries Assault himself", async () => {
    const game = await scenario().unit(P1, "base", CARD, "rumble").build();
    expect(game.state("rumble").keywords).toContain("Assault");
  });

  test("static is continuous (522): when Rumble dies in combat, the surviving Mech's Assault disappears", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "rumble")
      .unit(P1, "base", MEGA_MECH, "mega", EXHAUSTED)
      .unit(P2, "bf1", { might: 6, name: "Wall" }, "wall")
      .build();
    expect(assault(game, "mega")).toHaveLength(1);
    await game.p1.move("rumble", "bf1");
    await game.settle();
    expect(game.zoneOf("rumble")).toBe("trash"); // 4 into 6
    expect(assault(game, "mega")).toEqual([]);
    expect(game.state("mega").keywords).not.toContain("Assault");
  });

  test("Assault in combat: a 3-Might Bubble Bot attacks as 4 — kills a 3-Might defender, survives (3 < 4) and conquers; as a DEFENDER it gets no bonus and trades with a 3-Might attacker", async () => {
    const atk = await scenario().battlefield("bf1", { controller: P2 }).unit(P1, "base", CARD, "rumble").unit(P1, "base", BUBBLE_BOT, "bubble").unit(P2, "bf1", { might: 3 }, "picket").build();
    await atk.p1.move("bubble", "bf1");
    await atk.settle();
    expect(atk.zoneOf("picket")).toBe("trash");
    expect(atk.locationOf("bubble")).toBe("bf1");
    expect(atk.gameState.battlefields.bf1?.controller).toBe(P1);
    const def = await scenario().active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "base", CARD, "rumble").unit(P1, "bf1", BUBBLE_BOT, "bubble").unit(P2, "base", { might: 3 }, "raider").build();
    await def.p2.move("raider", "bf1");
    await def.settle();
    expect(def.zoneOf("bubble")).toBe("trash"); // 3 vs 3: no Assault while defending
    expect(def.zoneOf("raider")).toBe("trash");
  });

  test("When I conquer: optional prompt → pick a Mech from the trash → choose base or the just-conquered field → it is played there exhausted and immediately has Assault", async () => {
    const game = await conquerBoard().build();
    const stop = await conquer(game);
    expect(stop.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    const seen = await drive(game, { pick: { mega: "mega", base: "battlefield-bf1", scrap: "scrap" } });
    expect(seen.some((keys) => keys.includes("mega") && keys.includes("bubble") && !keys.includes("rumble"))).toBe(true);
    expect(seen).toContainEqual(expect.arrayContaining(["base", "battlefield-bf1"]));
    expect(game.zoneOf("mega")).toBe("battlefield-bf1");
    expect(game.state("mega").isExhausted).toBe(true);
    expect(assault(game, "mega")).toHaveLength(1);
    expect(game.zoneOf("bubble")).toBe("trash");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("'play a MECH from your trash' — non-Mech units in the trash (Shipyard Skulker) are not offered or playable", async () => {
    const game = await conquerBoard().build();
    await conquer(game);
    await game.p1.yes();
    await game.settle();
    const seen = await drive(game, { pick: { mega: "mega", base: "base", scrap: "scrap" } });
    const trashPick = seen.find((keys) => keys.includes("mega"));
    expect(trashPick).toBeDefined();
    expect(trashPick).not.toContain("skulker");
    const onlySkulker = await scenario().resources(P1, { energy: 8 }).battlefield("bf1", { controller: P2 }).unit(P1, "base", CARD, "rumble").unit(P1, "base", { might: 1 }, "scrap").trash(P1, SKULKER, "skulker").build();
    await conquer(onlySkulker);
    if (onlySkulker.decision()?.kind === "yes-no") {
      await onlySkulker.p1.answer((onlySkulker.decision() as { canAccept?: boolean }).canAccept !== false);
    }
    await onlySkulker.settle({ policy: "first" });
    expect(onlySkulker.zoneOf("skulker")).toBe("trash");
    expect(onlySkulker.zoneOf("scrap")).toBe("base");
  });

  test.failing("BUG: the price is recycling ANOTHER friendly unit and the Mech costs (Energy − that unit's Might): Big Scrap (3) → deck bottom, Mega-Mech (7) charges 4", async () => {
    // Expected: after "yes" P1 picks the unit to recycle (scrap | big — never rumble), it goes to the
    // bottom of P1's main deck, then Mega-Mech is played for 7 − 3 = 4 energy (8 → 4).
    // Actual: no recycle choice is ever asked, nothing is recycled, and the Mech is played for free.
    const game = await conquerBoard(8).build();
    await conquer(game);
    await game.p1.yes();
    await game.settle();
    const seen = await drive(game, { pick: { big: "big", mega: "mega", base: "base" } });
    expect(seen.some((keys) => keys.includes("big") && keys.includes("scrap") && !keys.includes("rumble"))).toBe(true);
    expect(game.zoneOf("mega")).toBe("base");
    expect(game.zoneOf("big")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("big");
    expect(game.zoneOf("rumble")).toBe("battlefield-bf1"); // "another": never himself
    expect(game.zoneOf("scrap")).toBe("base");
    expect(game.p1.energy()).toBe(4);
  });

  test.failing("BUG: with NO other friendly unit the recycle cost is unpayable, so no Mech may be played (and nothing is free)", async () => {
    // Expected: Rumble alone conquers → either no prompt or "yes" is not acceptable; Mega-Mech stays in
    // the trash. Actual: the engine skips the cost and plays Mega-Mech for 0.
    const game = await scenario().resources(P1, { energy: 8 }).battlefield("bf1", { controller: P2 }).unit(P1, "base", CARD, "rumble").trash(P1, MEGA_MECH, "mega").build();
    await conquer(game);
    const d = game.decision();
    if (d?.kind === "yes-no") {
      if (d.canAccept !== false) {
        await game.p1.yes();
      } else {
        await game.p1.no();
      }
    }
    await game.settle({ policy: "first" });
    expect(game.zoneOf("mega")).toBe("trash");
    expect(game.p1.energy()).toBe(8);
  });

  test("'you may': declining leaves the trash, the fodder and the energy untouched", async () => {
    const game = await conquerBoard().build();
    await conquer(game);
    expect(game.decision()?.kind).toBe("yes-no");
    await game.p1.no();
    const stop = await game.settle();
    expect(stop.reason).toBe("open");
    expect(game.zoneOf("mega")).toBe("trash");
    expect(game.zoneOf("scrap")).toBe("base");
    expect(game.zoneOf("big")).toBe("base");
    expect(game.p1.energy()).toBe(8);
  });

  test("negative space: an EMPTY trash gives nothing to play and costs no unit; 'When I conquer' ignores conquers by OTHER friendly units", async () => {
    const empty = await scenario().resources(P1, { energy: 8 }).battlefield("bf1", { controller: P2 }).unit(P1, "base", CARD, "rumble").unit(P1, "base", { might: 1 }, "scrap").build();
    await conquer(empty);
    if (empty.decision()?.kind === "yes-no") {
      await empty.p1.answer((empty.decision() as { canAccept?: boolean }).canAccept !== false);
    }
    await empty.settle({ policy: "first" });
    expect(empty.zoneOf("scrap")).toBe("base");
    expect(empty.p1.units()).toHaveLength(2);
    expect(empty.decision()).toMatchObject({ context: "main", kind: "action" });

    const other = await conquerBoard().build();
    await other.p1.move("scrap", "bf1");
    const stop = await other.settle();
    expect(other.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(other.p1.points()).toBe(1);
    expect(stop.reason).toBe("open"); // no Rumble prompt
    expect(other.zoneOf("mega")).toBe("trash");
  });

  test("the Mech is PLAYED (419.4.a): Bubble Bot fetched by Rumble fires its own play effect and readies the exhausted Mega-Mech", async () => {
    const game = await scenario()
      .resources(P1, { energy: 8 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "rumble")
      .unit(P1, "base", { might: 1, name: "Scrap" }, "scrap")
      .unit(P1, "base", MEGA_MECH, "mega", EXHAUSTED)
      .trash(P1, BUBBLE_BOT, "bubble")
      .build();
    await conquer(game);
    await game.p1.yes();
    await game.settle();
    await drive(game, { pick: { bubble: "bubble", base: "base", mega: "mega", scrap: "scrap" } });
    expect(game.zoneOf("bubble")).toBe("base");
    expect(game.state("bubble").isExhausted).toBe(true);
    expect(game.state("mega").isReady).toBe(true);
    expect(assault(game, "bubble")).toHaveLength(1);
  });
});
