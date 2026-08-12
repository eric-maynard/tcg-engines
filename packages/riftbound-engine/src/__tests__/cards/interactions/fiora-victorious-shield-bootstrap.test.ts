/**
 * Interaction: does Fiora's own conditional [Shield] bootstrap her into being [Mighty]?
 *
 *   Fiora, Victorious (ogn-232-298) · Unit 4 · 4 [Might]
 *     "While I'm [Mighty], I have [Deflect], [Ganking], and [Shield].
 *      (I'm Mighty while I have 5+ [Might].)"
 *   En Garde (ogn-046-298) · Spell 1 · [Reaction]
 *     "Give a friendly unit +1 [Might] this turn, then an additional +1 [Might] this turn
 *      if it is the only unit you control there."
 *   Singularity (ogn-105-298) · Spell 6 [mind][mind] · "Deal 6 to each of up to two units."
 *
 * Rules: 708 (Mighty = 5+ [Might]) · 710 (the layer set is re-read; a lost modifier takes
 * everything that depended on it with it) · 814 ([Shield] = +X [Might] while a defender) ·
 * 809.1.c.1 (the [Deflect] surcharge is paid when the object is chosen, in any domain) ·
 * 477 (continuous effects apply to the current characteristics) · 355.15 (a spell resolves
 * against the objects it locked on, or fizzles for them — it is never re-aimed or re-priced).
 *
 * Q: (a) Fiora is DEFENDING at a printed 4. Does the [Shield] she would only have while
 *        Mighty raise her to 5 and thereby satisfy its own condition?
 *    (b) With a second friendly unit there, En Garde gives exactly +1 → 5: does she then gain
 *        [Shield] and defend at 6 (one +1 buying two Might)? Alone, +1+1 = 6 → 7?
 *    (c) Is an enemy Singularity's [Deflect] surcharge owed only in the state where she is
 *        Mighty AT PICK TIME — never retro-charged when her Mightiness flips on the chain?
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIORA = "ogn-232-298";
const EN_GARDE = "ogn-046-298";
const SINGULARITY = "ogn-105-298";
const GRANTED = ["Deflect", "Ganking", "Shield"];

/** A free [Action] "buff a unit" spell — the buff counter is +1 [Might], and it is permanent. */
const BUFF = {
  abilities: [{ effect: { target: { type: "unit" }, type: "buff" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "order",
  energyCost: 0,
  name: "Test Buff",
  timing: "action",
} as const;

/** P2 is on turn; P1 holds bf1 with Fiora (and optionally an ally) and has En Garde in hand. */
function defending(withAlly: boolean) {
  const s = scenario()
    .active(P2)
    .resources(P1, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", FIORA, "fiora")
    .hand(P1, EN_GARDE, "enGarde")
    .unit(P2, "base", { might: 4, name: "Bruiser" }, "bruiser");
  return withAlly ? s.unit(P1, "bf1", { might: 1, name: "Ally" }, "ally") : s;
}

/** P2 attacks bf1 and passes Focus, so P1 may act inside the showdown. */
async function attacked(withAlly: boolean): Promise<Game> {
  const game = await defending(withAlly).build();
  await game.p2.move("bruiser", "bf1");
  expect(game.state("fiora").combatRole).toBe("defender");
  await game.p2.passFocus();
  return game;
}

describe("(a) no bootstrap: the conditional Shield cannot satisfy its own condition", () => {
  test("a DEFENDING 4-Might Fiora is not Mighty, so she has none of the three keywords and defends at 4 (708 / 710 / 477)", async () => {
    const game = await attacked(false);
    expect(game.state("fiora").baseMight).toBe(4);
    expect(game.state("fiora").might).toBe(4); // reading her Might as a defender: still 4
    for (const k of GRANTED) {
      expect(game.state("fiora").keywords).not.toContain(k);
    }
    expect(game.state("fiora").grantedKeywords ?? []).toEqual([]);
  });

  test("…and the self-referential loop resolves to OFF in combat too: a 4-Might attacker trades with her", async () => {
    const game = await attacked(false);
    await game.p1.passFocus();
    await game.settle();
    expect(game.zoneOf("fiora")).toBe("trash"); // took 4 ≥ 4 — no Shield ever applied
    expect(game.zoneOf("bruiser")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});

describe("(b) En Garde: one +1 buys two Might", () => {
  test("with a second friendly unit there En Garde gives exactly +1 → 5 → Mighty → [Shield] → she reads 6 as a defender (814)", async () => {
    const game = await attacked(true);
    await game.p1.cast("enGarde", { targets: "fiora" });
    await game.p1.passPriority();
    await game.p2.passPriority();

    expect(game.state("fiora").keywords).toEqual(expect.arrayContaining(GRANTED));
    expect(game.state("fiora").might).toBe(6); // 4 + 1 (En Garde) + 1 (its own Shield)
    expect(game.state("ally").might).toBe(1); // the ally is untouched
  });

  test("alone she gets +1+1 = 6 → Mighty → 7", async () => {
    const game = await attacked(false);
    await game.p1.cast("enGarde", { targets: "fiora" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("fiora").might).toBe(7); // 4 + 1 + 1 (alone) + 1 (Shield)
    expect(game.state("fiora").keywords).toEqual(expect.arrayContaining(GRANTED));
  });

  test("…and she survives the 4-Might attacker she used to trade with, holding the battlefield", async () => {
    const game = await attacked(false);
    await game.p1.cast("enGarde", { targets: "fiora" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p2.passFocus(); // Focus moved to P2 when P1 acted with it
    await game.p1.passFocus();
    await game.settle();
    expect(game.locationOf("fiora")).toBe("bf1"); // took 4 < 7
    expect(game.zoneOf("bruiser")).toBe("trash"); // took 6 ≥ 4
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("losing the 'this turn' +1 reverses BOTH steps at once (710): Might and the three keywords go together", async () => {
    const game = await scenario()
      .active(P1)
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf1", FIORA, "fiora")
      .unit(P1, "bf1", { might: 1, name: "Ally" }, "ally")
      .unit(P1, "bf2", { might: 1, name: "Holder" }, "holder")
      .hand(P1, EN_GARDE, "enGarde")
      .build();
    await game.p1.cast("enGarde", { targets: "fiora" });
    await game.settle();
    expect(game.state("fiora").might).toBe(5); // not a defender here: no Shield bonus
    expect(game.state("fiora").keywords).toEqual(expect.arrayContaining(GRANTED));
    expect(game.p1.can("gank", "fiora")).toBe(true); // [Ganking] is live while Mighty

    await game.advanceTurn(); // the buff is "this turn"
    expect(game.state("fiora").might).toBe(4);
    for (const k of GRANTED) {
      expect(game.state("fiora").keywords).not.toContain(k);
    }
  });
});

describe("(c) the [Deflect] surcharge is priced at pick time, never retroactively", () => {
  test("Singularity choosing a 4-Might Fiora owes nothing extra — 6 energy + [mind][mind] is the whole bill", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 6, power: { mind: 2 } })
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", FIORA, "fiora")
      .unit(P1, "bf1", { might: 1, name: "Ally" }, "ally")
      .hand(P1, EN_GARDE, "enGarde")
      .hand(P2, SINGULARITY, "singularity")
      .build();

    await game.p2.cast("singularity", { targets: "fiora" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.chain()).toMatchObject([{ cardId: "singularity", targets: ["fiora"] }]);

    // She becomes Mighty while the spell sits on the chain …
    await game.p2.passPriority();
    await game.p1.cast("enGarde", { targets: "fiora" });
    await game.settle();

    // … the spell is neither taxed retroactively nor countered: it resolves on its locked
    // target (355.15) and 6 damage kills the now-5-Might Fiora.
    expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.zoneOf("fiora")).toBe("trash");
    expect(game.zoneOf("singularity")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("battlefield-bf1"); // "up to two": only Fiora was chosen
    expect(game.violations()).toEqual([]);
  });

  test("choosing her while she IS Mighty owes the surcharge at pick time, and it may be paid in ANY domain (809.1.c.1)", async () => {
    const game = await scenario()
      .active(P1)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", FIORA, "fiora")
      .unit(P1, "bf1", { might: 1, name: "Ally" }, "ally")
      .hand(P1, BUFF, "buff")
      .hand(P2, SINGULARITY, "singularity")
      .build();
    await game.p1.cast("buff", { targets: "fiora" }); // permanent +1 → 5 → Mighty
    await game.settle();
    expect(game.state("fiora").might).toBe(5);
    expect(game.state("fiora").keywords).toContain("Deflect");

    await game.advanceTurn(); // → P2's turn
    await game.p2.do("addResources", { energy: 6, power: { mind: 2 } });
    // Exactly the printed cost is NOT enough while she has [Deflect]…
    expect((await game.p2.try((p) => p.cast("singularity", { targets: "fiora" }))).ok).toBe(false);
    // …but the ally, with no Deflect, is choosable for the printed cost.
    expect(game.p2.can("cast", "singularity")).toBe(true);

    await game.p2.do("addResources", { power: { fury: 1 } }); // any domain pays Deflect
    await game.p2.cast("singularity", { targets: "fiora" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0, mind: 0 } });
    await game.settle();
    expect(game.zoneOf("fiora")).toBe("trash");
  });
});
