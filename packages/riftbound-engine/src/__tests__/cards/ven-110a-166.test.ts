/**
 * Mel, Defiant Soul — ven-110a-166 · Champion Unit (Mel) · Chaos · 5 energy · 4 Might
 *
 *   [Empower] — Discard a spell
 *   When I become [Empowered], banish an enemy unit at a battlefield with 3 [Might] or less.
 *
 * Head-judge notes (the tricky spots this file pins down):
 *  1. The Empower cost is a NON-resource cost (827.1.c.2): discard a SPELL from hand. A unit or gear
 *     in hand cannot pay it; with no spell in hand the ability is unusable (422.3). The pitched spell
 *     goes to the trash as the ability is activated (cost), before anyone can respond; the empower
 *     itself resolves off the chain, and is switched off once Empowered (827.1.c.1).
 *  2. "When I become [Empowered]" is an EVENT trigger (441.2.a / 828.1.d): it fires off her own
 *     [Empower] AND off any other Empower source (Sanction). A redundant empower of an already-Empowered
 *     Mel is not "becoming" Empowered (441.1.c) → nothing.
 *  3. Banish target: ENEMY unit, AT A BATTLEFIELD, effective Might ≤ 3. Enemy units in a base, friendly
 *     units, and 4-Might units are never legal; a printed-3 unit buffed to 4 is illegal, a printed-4
 *     unit is illegal even when damaged (damage is not −Might). No legal target → the trigger resolves
 *     doing nothing (Mel is still Empowered). It is mandatory, not "you may".
 *  4. Banish ≠ kill (427.2.a): the unit lands in BANISHMENT, not the trash, and its Deathknell does not
 *     trigger. Emptying the defender's battlefield this way is not a conquer.
 *  5. Champion unit: playable from the Champion Zone for the same 5.
 *  6. Engine status: the "[Empower] — Discard a spell" line did not parse (no activated ability at all)
 *     and the trigger's effect is a `raw` string — the trigger reaches the chain when Mel becomes
 *     Empowered by another source, but resolves doing nothing → BUG tests below.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-110a-166";
const SPELL = "ogn-004-298"; // Cleave — a spell to pitch
const UNIT = "ogn-175-298"; // Shipyard Skulker — a non-spell card in hand
const SANCTION = "ven-035-166"; // Calm Reaction · 3 + [calm] · mode 0: Empower a unit (disempower at end of turn)

function board(opts: { empowered?: boolean } = {}) {
  return scenario()
    .resources(P1, { energy: 3, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", CARD, "mel", opts.empowered ? { empowered: true } : undefined)
    .unit(P1, "bf2", { might: 1, name: "Own Scout" }, "ownScout") // friendly, small, at a battlefield — never legal
    .unit(P2, "bf1", { might: 3, name: "Small" }, "small") // legal
    .unit(P2, "bf1", { might: 4, name: "Big" }, "big") // too mighty
    .unit(P2, "bf2", { might: 2, name: "Tiny" }, "tiny") // legal
    .unit(P2, "base", { might: 1, name: "Homebody" }, "home") // not at a battlefield
    .hand(P1, SPELL, "cleave")
    .hand(P1, UNIT, "skulker");
}

/** Drain the chain; whenever P1 is asked to choose the banish target, choose `target`. */
async function resolveChoosing(game: Game, target?: string): Promise<string[] | undefined> {
  let offered: string[] | undefined;
  for (let i = 0; i < 8; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      offered = d.options.map((o) => o.card ?? o.key);
      const key = d.options.find((o) => o.card === target || o.key === target)?.key ?? d.options[0]?.key;
      await game.p1.answer({ keys: [key as string], kind: "pick" });
      continue;
    }
    if (r.reason !== "unanswered") {
      break;
    }
  }
  return offered;
}

/** P1 casts Sanction (mode 0) on `target`; returns right after the target is chosen (Sanction resolved, nothing else drained). */
async function sanctionEmpower(game: Game, target: string): Promise<void> {
  await game.p1.cast("sanction");
  for (let i = 0; i < 10; i++) {
    await game.settle();
    const d = game.decision();
    if (d?.kind !== "pick") {
      return;
    }
    const opt = d.options.find((o) => o.card === target);
    if (opt) {
      await game.p1.answer({ keys: [opt.key], kind: "pick" });
      return;
    }
    if (d.options.some((o) => o.card !== undefined)) {
      return; // a card pick that does not offer `target` — leave it to the caller
    }
    await game.p1.chooseMode(0);
  }
}

describe("Mel, Defiant Soul (ven-110a-166)", () => {
  test("registry payload (what did parse): a 5-cost 4-Might Mel champion with a 'when I become Empowered' self trigger", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "chaos", energyCost: 5, isChampion: true, might: 4, name: "Mel, Defiant Soul", tags: ["Mel"] });
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities.find((a) => a.type === "triggered")).toMatchObject({ trigger: { event: "empower", on: "self" }, type: "triggered" });
  });

  test("registry payload should ALSO carry the activated [Empower] (cost: discard a SPELL, gate not-empowered) and a structured banish effect (enemy / battlefield / ≤3 Might), not a raw string", async () => {
    const abilities = ((await loadDefaultCardPool()).get(CARD)?.abilities ?? []) as { type: string; cost?: unknown; effect?: { type: string } }[];
    expect(abilities).toHaveLength(2);
    const activated = abilities.find((a) => a.type === "activated");
    expect(activated).toMatchObject({ effect: { target: "self", type: "empower" } });
    expect(JSON.stringify(activated?.cost)).toMatch(/discard/);
    expect(JSON.stringify(activated?.cost)).toMatch(/spell/);
    const trigger = abilities.find((a) => a.type === "triggered");
    expect(trigger?.effect?.type).not.toBe("raw");
    expect(JSON.stringify(trigger?.effect)).toContain('"banish"');
    expect(JSON.stringify(trigger?.effect)).toContain('"enemy"');
    expect(JSON.stringify(trigger?.effect)).toContain('"battlefield"');
  });

  test("cost: 5 energy, no power; enters the base exhausted as a 4-Might non-Empowered Mel champion; 4 energy is one short", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "mel").build();
    await game.p1.play("mel");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("mel")).toBe("base");
    expect(game.state("mel")).toMatchObject({ baseMight: 4, isEmpowered: false, isExhausted: true, might: 4 });
    expect(game.chain()).toHaveLength(0); // no play trigger
    expect((await scenario().resources(P1, { energy: 4, power: { chaos: 3 } }).hand(P1, CARD, "mel").build()).p1.can("play", "mel")).toBe(false);
  });

  test("champion zone: playable from the Champion Zone for the same 5 energy", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).champion(P1, CARD, "mel").build();
    expect(game.p1.champion()).toBe("mel");
    await game.p1.playChampion("base");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("mel")).toBe("base");
    expect(game.p1.champion()).toBeUndefined();
  });

  test("[Empower] — Discard a spell: pitching Cleave (→ trash, at activation) puts the empower on the chain; no energy/power is spent; resolves → Empowered", async () => {
    const game = await board().build();
    expect(game.p1.can("activate", "mel")).toBe(true);
    await game.p1.activate("mel", 0, { discard: "cleave" });
    expect(game.zoneOf("cleave")).toBe("trash"); // cost — paid before anyone responds
    expect(game.p1.resources()).toEqual({ energy: 3, power: { calm: 1 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mel", controller: P1, triggered: false })]);
    expect(game.state("mel").isEmpowered).toBe(false);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("mel")).toMatchObject({ isEmpowered: true, might: 4 }); // no Might rider on this card
  });

  test("the cost wants a SPELL — the Skulker (a unit) in hand is not an acceptable discard, Cleave is", async () => {
    const game = await board().build();
    const bad = await game.p1.try((p) => p.activate("mel", 0, { discard: "skulker" }));
    expect(bad.ok).toBe(false);
    expect(game.zoneOf("skulker")).toBe("hand");
    const good = await game.p1.try((p) => p.activate("mel", 0, { discard: "cleave" }));
    expect(good.ok).toBe(true);
  });

  test("negative space (422.3 / 827.1.c.1 / 381): with only a unit in hand, when already Empowered, or on the opponent's turn the ability is not offered", async () => {
    const noSpell = await scenario().unit(P1, "base", CARD, "mel").hand(P1, UNIT, "skulker").build();
    expect(noSpell.p1.can("activate", "mel")).toBe(false);
    expect((await board({ empowered: true }).build()).p1.can("activate", "mel")).toBe(false);
    expect((await board().active(P2).build()).p1.can("activate", "mel")).toBe(false);
  });

  test("becoming Empowered (own ability) → banish: only ENEMY units AT A BATTLEFIELD with ≤3 Might are offered (small, tiny); the chosen one goes to BANISHMENT, not trash", async () => {
    const game = await board().build();
    await game.p1.activate("mel", 0, { discard: "cleave" });
    const offered = await resolveChoosing(game, "small");
    expect([...(offered ?? [])].sort()).toEqual(["small", "tiny"]);
    expect(game.zoneOf("small")).toBe("banishment");
    expect(game.p2.trash()).toEqual([]);
    expect(game.zoneOf("big")).toBe("battlefield-bf1");
    expect(game.zoneOf("tiny")).toBe("battlefield-bf2");
    expect(game.zoneOf("home")).toBe("base");
    expect(game.zoneOf("ownScout")).toBe("battlefield-bf2");
    expect(game.p1.points()).toBe(0); // removing a defender is not conquering
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  function sanctionBoard() {
    return scenario()
      .resources(P1, { energy: 3, power: { calm: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "mel")
      .unit(P2, "bf1", { might: 2, name: "Tiny" }, "tiny")
      .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
      .hand(P1, SANCTION, "sanction");
  }

  test("becoming Empowered from ANOTHER source (Sanction, 441.2.a / 828.1.d): Mel is Empowered and HER trigger goes on the chain under P1's control; P2 may respond", async () => {
    const game = await sanctionBoard().build();
    await sanctionEmpower(game, "mel");
    expect(game.state("mel")).toMatchObject({ isEmpowered: true, might: 4 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mel", controller: P1, triggered: true })]);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.zoneOf("tiny")).toBe("battlefield-bf1"); // nothing banished before resolution
  });

  test("…and when that trigger resolves the lone legal Tiny (2 Might, enemy, at a battlefield) is BANISHED; the 5-Might Wall stays", async () => {
    const game = await sanctionBoard().build();
    await sanctionEmpower(game, "mel");
    await resolveChoosing(game, "tiny");
    expect(game.zoneOf("tiny")).toBe("banishment");
    expect(game.p2.trash()).toEqual([]);
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.state("mel").isEmpowered).toBe(true);
  });

  test("negative space — Sanction on an ALREADY-Empowered Mel is not 'becoming' Empowered (441.1.c): nothing is banished, no prompt", async () => {
    const game = await board({ empowered: true }).hand(P1, SANCTION, "sanction").build();
    await sanctionEmpower(game, "mel");
    await game.settle();
    expect(game.state("mel").isEmpowered).toBe(true);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    for (const id of ["small", "big", "tiny", "home", "ownScout"]) {
      expect(game.zoneOf(id)).not.toBe("banishment");
    }
  });

  test("Might filter is EFFECTIVE Might — a printed-3 enemy buffed to 4 is not offered, a damaged printed-4 is not offered, a printed-2 is; with it as the only choice it is banished", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "mel")
      .unit(P2, "bf1", { might: 3, name: "Buffed" }, "buffed", { buffed: true }) // 3 + 1 = 4
      .unit(P2, "bf1", { might: 4, name: "Hurt" }, "hurt", { damage: 2 }) // still 4 Might
      .unit(P2, "bf1", { might: 2, name: "Legal" }, "legal")
      .hand(P1, SPELL, "cleave")
      .build();
    expect(game.state("buffed").might).toBe(4);
    expect(game.state("hurt").might).toBe(4);
    await game.p1.activate("mel", 0, { discard: "cleave" });
    const offered = await resolveChoosing(game, "legal");
    expect(offered ?? ["legal"]).toEqual(["legal"]); // a sole legal choice may be auto-bound
    expect(game.zoneOf("legal")).toBe("banishment");
    expect(game.zoneOf("buffed")).toBe("battlefield-bf1");
    expect(game.zoneOf("hurt")).toBe("battlefield-bf1");
  });

  test("no legal target (enemies only in base / all 4+ Might): Mel still becomes Empowered, the trigger does nothing, no dangling prompt", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "mel")
      .unit(P2, "bf1", { might: 4, name: "Big" }, "big")
      .unit(P2, "base", { might: 1, name: "Homebody" }, "home")
      .hand(P1, SPELL, "cleave")
      .build();
    await game.p1.activate("mel", 0, { discard: "cleave" });
    await resolveChoosing(game);
    expect(game.state("mel").isEmpowered).toBe(true);
    expect(game.zoneOf("big")).toBe("battlefield-bf1");
    expect(game.zoneOf("home")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("banish is not a death (427.2.a) — a Deathknell unit banished by Mel does not trigger its Deathknell (no card drawn)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "mel")
      .unit(P2, "bf1", {
        abilities: [{ effect: { amount: 1, type: "draw" }, keyword: "Deathknell", trigger: { event: "die", on: "self" }, type: "triggered" }],
        might: 2,
        name: "Dying Wish",
      }, "wish")
      .hand(P1, SPELL, "cleave")
      .build();
    await game.p1.activate("mel", 0, { discard: "cleave" });
    await resolveChoosing(game, "wish");
    expect(game.zoneOf("wish")).toBe("banishment");
    expect(game.chain()).toHaveLength(0);
    expect(game.p2.hand()).toEqual([]);
  });
});
