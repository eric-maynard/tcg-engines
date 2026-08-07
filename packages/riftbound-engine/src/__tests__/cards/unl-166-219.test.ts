/**
 * Stalking Wolf — unl-166-219 · Unit · Order · 4 energy + [order] · 6 Might
 *
 *   [Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)
 *   As an additional cost to play me, kill a Bird, Cat, Dog, or Poro you control. You may play me
 *   to its battlefield (even if you don't have other units there).
 *
 * Rules: 822 (Ambush = "may be played to a battlefield where you control units" + "[Reaction] while
 * being played there"; base is NOT an Ambush destination; 822.3 no units there at finalization → not
 * valid by Ambush alone, but 822.3.a other permissions — this card's own second sentence — may still
 * allow it), 204.2 / 356.2.a.1 (a MANDATORY additional cost — no "may": no eligible pet → the Wolf
 * cannot be played at all), 355.10.c (the kill is a cost, not a target: only pets YOU control), 428.1
 * (a real kill: trash + death triggers), 357.2 (non-standard costs are paid with the rest of the cost,
 * before the unit enters), 355.2 ("you may play me to ITS battlefield" — an extra legal location keyed
 * to where the killed pet was).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. Mandatory: 4+[order] in the pool but no Bird/Cat/Dog/Poro under MY control → not playable; an
 *     ENEMY Poro or my own untagged unit never qualifies; there is no "skip the kill" variant.
 *  2. The signature line: my lone Poro is attacking P2's battlefield; with Focus I Ambush the Wolf in as
 *     a Reaction, killing that very Poro as the cost, to ITS battlefield "even if you don't have other
 *     units there" — the 6-Might Wolf inherits the attack and wins the combat the Poro started.
 *  3. Ambush on defence: P2 raids the battlefield my Poro holds; once Focus passes I react with the
 *     Wolf there. Reaction speed applies ONLY to a battlefield where I have units — not to base, not to
 *     an empty battlefield, and never in P2's neutral open state.
 *  4. All four tags qualify (Bird token, inline Cat/Dog, real Poro); the sacrifice menu lists exactly them.
 *  5. Cost accounting: 4 energy + 1 order + the pet; 3 energy or no order power → illegal even with a pet.
 *  6. Parser check: the registry must encode the kill-a-pet additional cost and the "its battlefield"
 *     permission — today it carries Ambush plus a placeholder keyword nobody reads.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-166-219";
const SINISTER_PORO = "unl-137-219"; // Chaos 2+[chaos], 1 Might, Poro
const BIRD_TOKEN = "unl-t02"; // 1 Might Bird token
const CAT = { might: 2, name: "Test Cat", tags: ["Cat"] };
const DOG = { might: 2, name: "Test Dog", tags: ["Dog"] };
const COST = { energy: 4, power: { order: 1 } };

const sacrificeMenu = (game: { p1: { option: (v: string, c: string) => { fields: readonly { arg: string; options?: readonly unknown[] }[] } | undefined } }) =>
  ((game.p1.option("play", "wolf")?.fields.find((f) => f.arg === "sacrifice")?.options as string[] | undefined) ?? []).toSorted();

const playLocations = (game: { p1: { option: (v: string, c: string) => { fields: readonly { arg: string; name?: string; options?: readonly unknown[] }[] } | undefined } }) =>
  ((game.p1.option("play", "wolf")?.fields.find((f) => f.arg === "to" || f.name === "location")?.options as string[] | undefined) ?? []);

describe("Stalking Wolf (unl-166-219)", () => {
  // Expected (356.2.a.1): with 4+[order] but no Bird/Cat/Dog/Poro under P1's control the Wolf is not
  // playable — an ENEMY Poro and my own untagged Grunt do not qualify. Actual: the additional cost is
  // not wired (placeholder "AmbushKillPet" keyword), so the Wolf plays freely for 4+[order].
  test("the kill-a-pet cost is MANDATORY — no pet you control (only an enemy Poro and an untagged friendly) → the Wolf cannot be played (356.2.a.1)", async () => {
    const game = await scenario()
      .resources(P1, COST)
      .unit(P1, "base", { might: 2, name: "Grunt" }, "grunt")
      .unit(P2, "base", SINISTER_PORO, "theirPoro")
      .hand(P1, CARD, "wolf")
      .build();
    expect(game.p1.can("play", "wolf")).toBe(false);
    expect((await game.p1.try((p) => p.play("wolf", { to: "base" }))).ok).toBe(false);
    expect(game.zoneOf("wolf")).toBe("hand");
  });

  // Expected: the play offers exactly my Poro as the sacrifice (never the Grunt, never P2's Poro);
  // paying kills it for real (P1's trash), charges 4 energy + 1 order, and the Wolf enters the base
  // exhausted at 6 Might; every variant carries a sacrifice. Actual: no sacrifice is asked for.
  test("playing the Wolf kills the chosen pet as an additional cost — 4 energy + [order] + my Sinister Poro → Poro in trash, 6-Might Wolf exhausted in base", async () => {
    const game = await scenario()
      .resources(P1, COST)
      .unit(P1, "base", SINISTER_PORO, "poro")
      .unit(P1, "base", { might: 2, name: "Grunt" }, "grunt")
      .unit(P2, "base", SINISTER_PORO, "theirPoro")
      .hand(P1, CARD, "wolf")
      .build();
    expect(sacrificeMenu(game)).toEqual(["poro"]);
    expect((game.p1.option("play", "wolf")?.variants ?? []).every((v) => v.params.sacrificeId === "poro")).toBe(true);
    await game.p1.play("wolf", { sacrifice: "poro", to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.p1.trash()).toEqual(["poro"]);
    expect(game.zoneOf("grunt")).toBe("base");
    expect(game.zoneOf("theirPoro")).toBe("base");
    expect(game.state("wolf")).toMatchObject({ isExhausted: true, might: 6, zone: "base" });
  });

  // Expected: Bird (token), Cat, Dog and Poro all satisfy the cost; the untagged Grunt does not.
  // Actual: no sacrifice field exists at all.
  test("all four tags qualify — the sacrifice menu is exactly {Bird token, Cat, Dog, Poro}, not the untagged Grunt", async () => {
    const game = await scenario()
      .resources(P1, COST)
      .unit(P1, "base", BIRD_TOKEN, "bird")
      .unit(P1, "base", CAT, "cat")
      .unit(P1, "base", DOG, "dog")
      .unit(P1, "base", SINISTER_PORO, "poro")
      .unit(P1, "base", { might: 5, name: "Grunt" }, "grunt")
      .hand(P1, CARD, "wolf")
      .build();
    expect(sacrificeMenu(game)).toEqual(["bird", "cat", "dog", "poro"]);
    await game.p1.play("wolf", { sacrifice: "dog", to: "base" });
    await game.settle();
    expect(game.zoneOf("dog")).toBe("trash");
    expect(game.p1.units("base").toSorted()).toEqual(["bird", "cat", "grunt", "poro", "wolf"]);
  });

  test("cost floor: even with a Poro to kill, 3 energy + [order] or 4 energy without [order] cannot play the Wolf", async () => {
    const lowEnergy = await scenario().resources(P1, { energy: 3, power: { order: 1 } }).unit(P1, "base", SINISTER_PORO, "poro").hand(P1, CARD, "wolf").build();
    expect(lowEnergy.p1.can("play", "wolf")).toBe(false);
    const noPower = await scenario().resources(P1, { energy: 6 }).unit(P1, "base", SINISTER_PORO, "poro").hand(P1, CARD, "wolf").build();
    expect(noPower.p1.can("play", "wolf")).toBe(false);
  });

  test("[Ambush] on defence: P2 raids bf1 where my Poro stands; in P2's neutral open state I cannot act, but once Focus passes I react with the Wolf TO bf1 — it arrives, defends at 6 and the 3-Might raider dies", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, COST)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", SINISTER_PORO, "poro")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .hand(P1, CARD, "wolf")
      .build();
    expect(game.p1.can("play", "wolf")).toBe(false); // 822 gives Reaction speed, not Action-in-their-open-state
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("play", "wolf")).toBe(true);
    // Reaction speed is tied to "a battlefield where you have units": base is not on the menu now.
    expect(playLocations(game)).not.toContain("base");
    expect((await game.p1.try((p) => p.play("wolf", { to: "base" }))).ok).toBe(false);
    await game.p1.play("wolf", { to: "bf1", ...(sacrificeMenu(game).length ? { sacrifice: "poro" } : {}) });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.locationOf("wolf")).toBe("bf1");
    expect(game.zoneOf("raider")).toBe("trash"); // 3 into a 6-Might defender
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("[Ambush] scope: during P2's showdown at bf1 the Wolf may NOT be reacted onto empty bf2 (no friendly units there) — only bf1 is offered", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, COST)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "bf1", SINISTER_PORO, "poro")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .hand(P1, CARD, "wolf")
      .build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    const locs = playLocations(game).map((l) => l.replace(/^battlefield-/, ""));
    expect(locs).toContain("bf1");
    expect(locs).not.toContain("bf2");
    expect((await game.p1.try((p) => p.play("wolf", { to: "bf2" }))).ok).toBe(false);
    expect(game.zoneOf("wolf")).toBe("hand");
  });

  // Expected (the signature line, 822 + this card's "its battlefield" clause + 357.2): my lone Poro
  // attacks P2's bf1; holding Focus I Ambush the Wolf to bf1 as a Reaction, killing THAT Poro as the
  // cost; the Wolf still enters bf1 ("even if you don't have other units there"), becomes the attacker
  // and its 6 Might kills the 4-Might Guard → P1 conquers. Actual: no sacrifice exists, the Poro
  // survives, so the assertion on the Poro's death fails (the Wolf itself does arrive and win).
  test("Ambush + kill my attacking Poro as the cost + 'play me to ITS battlefield even with no other units there' — the Wolf takes over the attack and conquers bf1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { order: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
      .unit(P1, "base", SINISTER_PORO, "poro")
      .hand(P1, CARD, "wolf")
      .build();
    await game.p1.move("poro", "bf1");
    // Sinister Poro's own attack trigger: decline it (keep the Guard here).
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (d?.seat === P1 && d.kind === "yes-no") {
        await game.p1.no();
        break;
      }
      if (d?.seat === P1 && d.kind === "pick") {
        await game.p1.decline();
        break;
      }
      if (d?.kind === "action" && d.seat === P2) {
        await game.p2.pass();
      } else if (d?.kind === "action" && d.seat === P1 && !game.p1.can("play", "wolf")) {
        await game.p1.pass();
      } else {
        break;
      }
    }
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("play", "wolf")).toBe(true);
    await game.p1.play("wolf", { sacrifice: "poro", to: "bf1" });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.locationOf("wolf")).toBe("bf1");
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("on my own turn in the open state the Wolf plays at normal speed to base or to a battlefield I control (Ambush adds options, removes none) and is a 6-Might body with the Ambush keyword", async () => {
    const game = await scenario()
      .resources(P1, COST)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", SINISTER_PORO, "poro")
      .unit(P2, "bf2", { might: 1 }, "theirs")
      .hand(P1, CARD, "wolf")
      .build();
    const locs = playLocations(game).map((l) => l.replace(/^battlefield-/, ""));
    expect(locs).toEqual(expect.arrayContaining(["base", "bf1"]));
    expect(locs).not.toContain("bf2"); // enemy battlefield with no friendly unit: neither rule 355.2 nor Ambush
    await game.p1.play("wolf", { to: "bf1", ...(sacrificeMenu(game).length ? { sacrifice: "poro" } : {}) });
    await game.settle();
    expect(game.state("wolf")).toMatchObject({ baseMight: 6, isExhausted: true, might: 6, zone: "battlefield-bf1" });
    expect(game.state("wolf").keywords).toContain("Ambush");
  });

  // Expected: the registry encodes the printed text — the Ambush keyword, a MANDATORY additional cost
  // that kills a friendly unit filtered to the Bird/Cat/Dog/Poro tags, and the extra "its battlefield"
  // play location. Actual: two self-grant statics, `Ambush` and a placeholder `AmbushKillPet` keyword
  // that no engine code reads; the cost and the location clause are absent.
  test("parsed abilities carry only Ambush + an inert 'AmbushKillPet' placeholder — the kill-a-pet additional cost and the 'its battlefield' permission are not encoded", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "order", energyCost: 4, might: 6, name: "Stalking Wolf" });
    expect(def?.powerCost).toEqual(["order"]);
    const json = JSON.stringify(def?.abilities ?? []);
    expect(json).toContain("Ambush");
    expect(json).not.toContain("AmbushKillPet");
    expect(json).toMatch(/additional-cost/);
    expect(json).toMatch(/"kill"/);
    for (const tag of ["Bird", "Cat", "Dog", "Poro"]) {
      expect(json).toContain(tag);
    }
  });
});
