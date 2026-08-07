/**
 * Rell, Magnetic — sfd-024-221 · Champion Unit (Rell) · Fury · 4 energy · 4 might
 *
 *   [Tank] (I must be assigned combat damage first.)
 *   When I attack, you may play an Equipment with Energy cost no more than [2], ignoring its
 *   cost. If you do, then do this: Attach it to me.
 *
 * Rules: 815 (Tank: lethal damage must be assigned to me before same-side non-Tank units);
 * 383.4.e (attack trigger — fires when Rell gains the Attacker designation, i.e. her move applied
 * Contested to an enemy-occupied battlefield; never when defending, never without a combat);
 * 464.2.e (the trigger goes on the combat chain before any Focus play, so it resolves before
 * combat damage — the attached bonus counts in this fight); 356.1.b.1 ("ignoring its cost" zeroes
 * BOTH base energy and base power cost); 206.1 (the "Energy cost no more than [2]" filter reads
 * the printed cost); 128.6 (a "play from hand" instruction may always be declined); "If you do,
 * then do this" = reflexive follow-up: the Equipment ends up attached to Rell with no Equip cost.
 *
 * Head-judge corner cases considered:
 *   - trigger only on ATTACK: defending, or walking onto an empty enemy-controlled battlefield
 *     (conquer without combat), must not offer anything;
 *   - optional: "no" leaves the hand untouched and the fight is a plain 4-vs-X;
 *   - the [2] filter: a 3-cost Equipment (Skyfall) is never eligible even for free; 1- and 2-cost are;
 *   - "ignoring its cost" must waive the [fury] pip of Long Sword too (parsed data says energy only);
 *   - zero resources: the free play + attach must still work and spend nothing;
 *   - timing: the +2 from Doran's Blade must already apply when combat damage is dealt
 *     (4+2 = 6 kills a 5-might defender that would otherwise kill Rell);
 *   - Tank on offence and on defence with the engine's default assignment as the control.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-024-221";
const DORANS_BLADE = "sfd-095-221"; // Equipment, 2 energy, +2, Equip [body]
const SKYFALL = "sfd-030-221"; // Equipment, 3 energy, +2
const LONG_SWORD = "sfd-022-221"; // Equipment, 2 energy + [fury], +2, Quick-Draw
const HEART = "sfd-052-221"; // Heart of Dark Ice — a NON-equipment gear

function attack(foeMight = 5) {
  return scenario()
    .resources(P1, { energy: 0 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: foeMight, name: "Foe" }, "foe")
    .unit(P1, "base", CARD, "rell");
}

/** Move Rell in, let the trigger resolve (both pass), and return the game at the "you may" prompt. */
async function attackToPrompt(game: Game): Promise<void> {
  await game.p1.move("rell", "bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rell", controller: P1, triggered: true })]);
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
}

/** After "yes": take an equipment pick if one is offered, then finish the showdown + combat. */
async function finishChoosing(game: Game, prefer: string): Promise<void> {
  for (let i = 0; i < 4; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (r.reason !== "unanswered" || !d || d.kind !== "pick" || d.seat !== P1) {
      return;
    }
    const opt = d.options.find((o) => (o.card ?? o.key) === prefer) ?? d.options[0]!;
    await game.p1.pick(opt.card ?? opt.key);
  }
}

describe("Rell, Magnetic (sfd-024-221)", () => {
  test("cost: 4 energy, no power; a 4-might unit with the Tank keyword; 3 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "rell").build();
    await game.p1.play("rell", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("rell")).toBe("base");
    expect(game.state("rell")).toMatchObject({ baseMight: 4, might: 4 });
    expect(game.state("rell").keywords).toContain("Tank");
    const poor = await scenario().resources(P1, { energy: 3, power: { fury: 2 } }).hand(P1, CARD, "rell").build();
    expect(poor.p1.can("play", "rell")).toBe(false);
  });

  test("'When I attack': moving into an enemy-occupied battlefield puts Rell's trigger on the chain, then asks 'you may' after both pass", async () => {
    const game = await attack().hand(P1, DORANS_BLADE, "blade").build();
    await attackToPrompt(game);
    expect(game.zoneOf("blade")).toBe("hand"); // nothing happens before the choice
  });

  test("optional — answering 'no': nothing is played, the Equipment stays in hand, and the plain 4-vs-5 fight kills Rell", async () => {
    const game = await attack(5).hand(P1, DORANS_BLADE, "blade").build();
    await attackToPrompt(game);
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("blade")).toBe("hand");
    expect(game.zoneOf("rell")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  test("no trigger when DEFENDING: an enemy attacking Rell's battlefield creates no Rell chain item and no prompt", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "rell")
      .hand(P1, DORANS_BLADE, "blade")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.chain().some((i) => i.cardId === "rell")).toBe(false);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("raider")).toBe("trash"); // 4 ≥ 3
    expect(game.locationOf("rell")).toBe("bf1");
    expect(game.zoneOf("blade")).toBe("hand");
  });

  test("no trigger without a combat: moving onto an EMPTY enemy-controlled battlefield just conquers it", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "rell")
      .hand(P1, DORANS_BLADE, "blade")
      .build();
    await game.p1.move("rell", "bf1");
    expect(game.chain().some((i) => i.cardId === "rell")).toBe(false);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.zoneOf("blade")).toBe("hand");
  });

  test("BUG: 'yes' with Doran's Blade (2-cost) and ZERO resources: it is played free, attached to Rell (+2 → 6) before damage, so the 5-might Foe dies and Rell conquers", async () => {
    // Expected: blade leaves hand, ends attached to Rell, no energy/power spent, Rell 6 might beats Foe 5.
    // Actual: answering yes does nothing at all — blade stays in hand and Rell (4) dies to Foe (5).
    const game = await attack(5).hand(P1, DORANS_BLADE, "blade").build();
    await attackToPrompt(game);
    await game.p1.yes();
    await finishChoosing(game, "blade");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.state("blade").attachedTo).toBe("rell");
    expect(game.state("rell").attachments).toContain("blade");
    expect(game.state("rell").might).toBe(6);
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.locationOf("rell")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("BUG: 'Energy cost no more than [2]' — with Skyfall (3) and Doran's Blade (2) in hand only the Blade may be chosen; Skyfall alone yields nothing", async () => {
    // Expected: any pick offered excludes skyfall; blade ends attached, skyfall stays in hand.
    // Actual: nothing is ever played/attached (and the hand filter ignores energyCost anyway).
    const game = await attack(5).hand(P1, SKYFALL, "skyfall").hand(P1, DORANS_BLADE, "blade").build();
    await attackToPrompt(game);
    await game.p1.yes();
    const d = game.decision();
    if (d?.kind === "pick") {
      expect(d.options.map((o) => o.card ?? o.key)).not.toContain("skyfall");
    }
    await finishChoosing(game, "blade");
    expect(game.zoneOf("skyfall")).toBe("hand");
    expect(game.state("blade").attachedTo).toBe("rell");

    const onlyBig = await attack(5).hand(P1, SKYFALL, "skyfall").build();
    await onlyBig.p1.move("rell", "bf1");
    await onlyBig.settle({ policy: "first" }); // says "yes" to anything offered
    expect(onlyBig.zoneOf("skyfall")).toBe("hand");
    expect(onlyBig.state("rell").attachments).toEqual([]);
  });

  test("BUG: 'ignoring its cost' waives POWER too (356.1.b.1) — Long Sword (2 + [fury]) is played and attached with no fury available", async () => {
    // Expected: sword attached, Rell 6, pool untouched. Actual: nothing happens (and the parsed
    // effect only ignores the energy component).
    const game = await attack(5).hand(P1, LONG_SWORD, "sword").build();
    await attackToPrompt(game);
    await game.p1.yes();
    await finishChoosing(game, "sword");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.state("sword").attachedTo).toBe("rell");
    expect(game.state("rell").might).toBe(6);
    expect(game.zoneOf("foe")).toBe("trash");
  });

  test("negative space: with only a non-Equipment gear (and plenty of resources) in hand, nothing is played or attached whatever P1 answers", async () => {
    const game = await attack(3).resources(P1, { energy: 9, power: { calm: 3, fury: 3 } }).hand(P1, HEART, "heart").build();
    await game.p1.move("rell", "bf1");
    await game.settle({ policy: "first" });
    expect(game.zoneOf("heart")).toBe("hand");
    expect(game.state("rell").attachments).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 9, power: { calm: 3, fury: 3 } });
    expect(game.zoneOf("foe")).toBe("trash"); // 4 ≥ 3, Rell survives 3 < 4
    expect(game.locationOf("rell")).toBe("bf1");
  });

  test("[Tank] on offence: a 1-might ally attacking beside Rell into a 3-might Foe survives — all 3 damage must go to Rell first (815)", async () => {
    // Control: without a Tank the engine's assignment kills the first-listed weak attacker.
    const control = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
      .unit(P1, "base", { might: 1, name: "Squire" }, "squire")
      .unit(P1, "base", { might: 4, name: "Big Vanilla" }, "big")
      .build();
    await control.p1.move(["squire", "big"], "bf1");
    await control.settle({ policy: "first" });
    expect(control.zoneOf("squire")).toBe("trash");

    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
      .unit(P1, "base", { might: 1, name: "Squire" }, "squire")
      .unit(P1, "base", CARD, "rell")
      .script(P1, ["no"])
      .build();
    await game.p1.move(["squire", "rell"], "bf1");
    await game.settle({ policy: "first" });
    expect(game.zoneOf("foe")).toBe("trash"); // took 1 + 4
    expect(game.locationOf("squire")).toBe("bf1"); // spared: 3 non-lethal damage all on Rell
    expect(game.locationOf("rell")).toBe("bf1");
    expect(game.state("rell").damage).toBe(0); // healed in the combat cleanup (143.3.b.2)
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("[Tank] on defence: a 3-might raider into {2-might ally, Rell} — the ally survives, the raider dies", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Small" }, "small")
      .unit(P1, "bf1", CARD, "rell")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash"); // took 2 + 4
    expect(game.locationOf("small")).toBe("bf1");
    expect(game.locationOf("rell")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("parsed abilities: Tank keyword + ONE optional self attack-trigger = sequence[play Equipment (energy ≤ 2) from hand, attach the played card to self]", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "fury", energyCost: 4, isChampion: true, might: 4, tags: ["Rell"] });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[0]).toEqual({ keyword: "Tank", type: "keyword" });
    expect(def?.abilities?.[1]).toMatchObject({
      effect: {
        effects: [
          { from: "hand", target: { filter: { energyCost: { lte: 2 } }, type: "equipment" }, type: "play" },
          { equipment: { type: "pending-value" }, to: "self", type: "attach" },
        ],
        pendingValue: { source: 0 },
        type: "sequence",
      },
      optional: true,
      trigger: { event: "attack", on: "self" },
      type: "triggered",
    });
  });

  test("BUG: parsed play step should ignore the WHOLE cost ('ignoring its cost' → energy AND power, 356.1.b.1), not `ignoreCost: \"energy\"`", async () => {
    const pool = await loadDefaultCardPool();
    const seq = (pool.get(CARD)?.abilities?.[1] as { effect?: { effects?: { ignoreCost?: unknown }[] } })?.effect?.effects ?? [];
    expect(seq[0]?.ignoreCost).toBe(true);
  });
});
