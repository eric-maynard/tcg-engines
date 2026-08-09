/**
 * Svellsongur — sfd-059-221 · Gear (Equipment) · Calm · 3 energy + [calm] · Might bonus +0
 *
 *   [Equip] [1][calm] ([1][calm]: Attach this to a unit you control.)
 *   As this is attached to a unit, copy that unit's text to this Equipment's effect text for as
 *   long as this is attached to it.
 *
 * Rules: 818 (Equip = "[cost]: Attach this to a unit you control", an activated ability → chain),
 * 136.2.c / 434.1.c / 719.1 (an attached card's EFFECT TEXT is appended to the equipped unit's rules
 * text), 137.2 (+0 is a legal Might bonus), 807.2 / 814.2 (a keyword granted by an additional source
 * SUMS with the printed one), 435.1.c-d (on detach the effect text stops applying), 457.1 (loose
 * gear at a battlefield is recalled to base).
 *
 * Head-judge checklist (trickiest situations for THIS card):
 *  1. What the copy DOES: the unit's own text lands in Svellsongur's effect text, which is appended
 *     back onto that unit — the wearer has its text TWICE. Passive keywords sum (Shield → Shield 2),
 *     triggered abilities trigger twice ("When I move, draw 1" draws 2). A vanilla wearer gains nothing.
 *  2. +0 Might bonus: equipping never changes printed/effective Might by itself.
 *  3. The appended copy belongs to the UNIT (136.2.c/d): a copied "[Exhaust]: …" is paid by exhausting
 *     the wearer, so doubling an exhaust ability yields no second use — Svellsongur is not a second body.
 *  4. Duration "for as long as this is attached to it": when the wearer dies Svellsongur falls off
 *     (recalled to base, unattached, effect text blank again) and re-equipping copies the NEW wearer.
 *  5. Two costs: [3][calm] PLAYS it (base, ready, unattached, copies nothing); [1][calm] is the Equip
 *     activation, a chain item the opponent may respond to; only units you control are Equip targets.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-059-221";
const STALWART_PORO = "ogn-052-298"; // Calm · 2 · 2 Might · [Shield] (+1 Might while I'm a defender.)
const STELLACORN_HERDER = "sfd-048-221"; // Calm · 4 · 3 Might · When I move, draw 1.
const ARENA_KINGPIN = "unl-001-219"; // Fury · 5 · 3 Might · I enter ready. [Exhaust]: Give a unit +3 Might this turn.

async function equip(game: Game, unitId: string, gear = "sv"): Promise<void> {
  await game.p1.choose("equipCard:-", { params: { equipmentId: gear, unitId } });
  await game.settle();
}

function board(res: { energy?: number; power?: Record<string, number> } = { energy: 1, power: { calm: 1 } }) {
  return scenario()
    .resources(P1, res)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", STALWART_PORO, "poro")
    .unit(P1, "base", STELLACORN_HERDER, "herder")
    .unit(P2, "bf2", { might: 6, name: "Wall" }, "wall")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .gear(P1, CARD, "sv");
}

describe("Svellsongur (sfd-059-221)", () => {
  test("registry payload: calm Equipment, 3 energy + [calm], +0 bonus, [Equip] costing [1][calm], and the copy-the-wearer's-text marker", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ copyAttachedUnitText: true, domain: "calm", energyCost: 3, mightBonus: 0, name: "Svellsongur", powerCost: ["calm"] });
    expect(["gear", "equipment"]).toContain(def?.cardType as string);
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities[0]).toEqual({ cost: { energy: 1, power: ["calm"] }, keyword: "Equip", type: "keyword" });
  });

  test("play cost: 3 energy + 1 calm puts it in the base READY and unattached (nothing copied); 3 energy alone or 2 + calm is short; fury cannot pay the calm pip", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { calm: 1 } }).unit(P1, "base", STALWART_PORO, "poro").hand(P1, CARD, "sv").build();
    await game.p1.play("sv");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.zoneOf("sv")).toBe("base");
    expect(game.state("sv")).toMatchObject({ attachedTo: undefined, isReady: true });
    expect(game.state("sv").meta.copiedFromCardId).toBeUndefined();
    expect(game.state("poro").might).toBe(2);
    expect((await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "sv").build()).p1.can("play", "sv")).toBe(false);
    expect((await scenario().resources(P1, { energy: 2, power: { calm: 2 } }).hand(P1, CARD, "sv").build()).p1.can("play", "sv")).toBe(false);
    expect((await scenario().resources(P1, { energy: 3, power: { fury: 1 } }).hand(P1, CARD, "sv").build()).p1.can("play", "sv")).toBe(false);
  });

  test("Equip [1][calm]: exactly 1 energy + 1 calm, one chain item the opponent sees, attaches on resolution; +0 bonus leaves the Poro at 2 Might", async () => {
    const game = await board().build();
    await game.p1.choose("equipCard:-", { params: { equipmentId: "sv", unitId: "poro" } });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sv", controller: P1 })]);
    expect(game.state("sv").attachedTo).toBeUndefined();
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.settle();
    expect(game.state("sv")).toMatchObject({ attachedTo: "poro", zone: "battlefield-bf1" });
    expect(game.state("poro")).toMatchObject({ attachments: ["sv"], baseMight: 2, might: 2 });
    expect(game.state("sv").meta.copiedFromCardId).toBe("poro");
    expect(game.violations()).toEqual([]);
  });

  test("Equip costs and targets: no calm → not offered; only units YOU control are choices (the enemy Wall is refused)", async () => {
    expect((await board({ energy: 1 }).build()).p1.can("equipCard")).toBe(false);
    expect((await board({ energy: 0, power: { calm: 1 } }).build()).p1.can("equipCard")).toBe(false);
    const game = await board().build();
    expect([...(game.p1.option("equipCard")?.fields.find((f) => f.name === "unitId")?.options ?? [])].map(String).sort()).toEqual(["herder", "poro"]);
    expect((await game.p1.try((p) => p.choose("equipCard:-", { params: { equipmentId: "sv", unitId: "wall" } }))).ok).toBe(false);
  });

  test("the copy doubles a passive keyword (814.2) — an equipped Stalwart Poro defends with Shield + Shield = 4 Might, so a 3-Might attacker dies and the Poro lives", async () => {
    // Expected: Poro's own [Shield] plus the appended copy → +2 while defending → 4 vs 3: Raider dies, Poro survives (3 < 4).
    // Actual: the copy only re-exposes ACTIVATED abilities; the Poro defends at 3 and trades with the Raider.
    const game = await board().build();
    await equip(game, "poro");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("control for the above: WITHOUT Svellsongur the lone Shield Poro (3 as a defender) merely trades with a 3-Might attacker", async () => {
    const game = await board().build();
    await game.advanceTurn();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("trash");
  });

  test.failing("BUG: the copy doubles a triggered ability — an equipped Stellacorn Herder ('When I move, draw 1') draws 2 on one move", async () => {
    // Expected: two "When I move" triggers → hand +2. Actual: hand +1 (the copy is not appended to the wearer).
    const game = await board().build();
    await equip(game, "herder");
    const before = game.p1.hand().length;
    await game.p1.move("herder", "bf1"); // own battlefield: no showdown, just the trigger(s)
    await game.settle();
    expect(game.locationOf("herder")).toBe("bf1");
    expect(game.zoneOf("sv")).toBe("battlefield-bf1"); // rides along
    expect(game.p1.hand()).toHaveLength(before + 2);
  });

  test("control: an UNEQUIPPED Herder draws exactly 1 per move, and a vanilla wearer gains nothing from the copy", async () => {
    const game = await board().unit(P1, "base", { might: 2, name: "Blank" }, "blank").build();
    await equip(game, "blank");
    expect(game.state("blank")).toMatchObject({ grantedKeywords: [], keywords: [], might: 2 });
    const before = game.p1.hand().length;
    await game.p1.move("herder", "bf1");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(before + 1);
  });

  test.failing("BUG: the appended copy is the WEARER's text (136.2.c/d) — Kingpin's copied '[Exhaust]: +3 Might' is paid by exhausting Kingpin, so once Kingpin is exhausted no second activation exists on either card", async () => {
    // Expected: after Kingpin uses its own ability (exhausted, 6 Might) neither card offers another activation.
    // Actual: the engine hosts the copied ability on Svellsongur itself and lets the gear's own exhaustion pay for a second use.
    const game = await scenario()
      .resources(P1, { energy: 1, power: { calm: 1 } })
      .unit(P1, "base", ARENA_KINGPIN, "kingpin")
      .gear(P1, CARD, "sv")
      .build();
    await equip(game, "kingpin");
    expect(game.state("kingpin").isReady).toBe(true);
    expect(game.p1.can("activate", "kingpin")).toBe(true);
    await game.p1.activate("kingpin", undefined, { targets: "kingpin", answers: ["kingpin"] });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("kingpin");
      await game.settle();
    }
    expect(game.state("kingpin")).toMatchObject({ isExhausted: true, might: 6 });
    expect(game.p1.can("activate", "kingpin")).toBe(false);
    expect(game.p1.can("activate", "sv")).toBe(false); // Svellsongur is not a second body to exhaust
  });

  test("duration: the wearer dies → Svellsongur detaches, is recalled to base unattached with nothing copied; re-equipping copies the NEW wearer", async () => {
    const game = await board({ energy: 2, power: { calm: 2 } }).build();
    await equip(game, "herder");
    expect(game.state("sv").meta.copiedFromCardId).toBe("herder");
    await game.p1.move("herder", "bf2"); // 3 into the 6-Might Wall: Herder dies
    await game.settle();
    expect(game.zoneOf("herder")).toBe("trash");
    expect(game.zoneOf("sv")).toBe("base");
    expect(game.state("sv").attachedTo).toBeUndefined();
    expect(game.state("sv").meta.copiedFromCardId).toBeUndefined();
    await equip(game, "poro");
    expect(game.state("sv")).toMatchObject({ attachedTo: "poro", zone: "battlefield-bf1" });
    expect(game.state("sv").meta.copiedFromCardId).toBe("poro");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  });

  test("timing (818 is an activated gear ability): Equip is not offered on the opponent's turn nor during a showdown", async () => {
    expect((await board().active(P2).build()).p1.can("equipCard")).toBe(false);
    const game = await board().unit(P1, "base", { might: 1, name: "Runner" }, "runner").build();
    expect(game.p1.can("equipCard")).toBe(true);
    await game.p1.move("runner", "bf2");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("equipCard")).toBe(false);
  });
});
