/**
 * Ruling 87643f2da469476f — Sett, Kingpin (OGN-240 → ogn-240-298) · Champion · Order · 4 · 5 Might
 *     "[Tank] I get +1 [Might] for each buffed friendly unit at my battlefield."
 *   × a buffed 3-Might [Tank] "Shen" (4 Might) beside him; Singularity (OGN-105 → ogn-105-298, 6+[mind][mind], "Deal 6 to each of up
 *     to two units.") for the out-of-combat contrast.
 *
 * Q: In a showdown Shen (4, buffed) and Sett (6 thanks to Shen's buff) are assigned 4 and 5 combat damage. Shen dies and
 *    Sett loses the +1 — does Sett (now 5 Might with 5 damage) die too?
 * A: No. In the combat damage step lethal units die and then damage is healed from everyone immediately, before Sett is
 *    re-evaluated at his new Might — so Sett survives at 5 with no damage. Outside a showdown (a spell kill) there is no
 *    heal: Shen dying re-evaluates Sett with his marked damage and he can die in the following cleanup.
 * Rules: 465.2 (combat damage → kills), 465.3 / 519 (combat cleanup heals all units), 520 (state-based cleanup: damage ≥ Might).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SETT_KINGPIN = "ogn-240-298";
const SINGULARITY = "ogn-105-298";
const SHEN = { keywords: ["Tank"], might: 3, name: "Shen" } as const;

describe("Ruling 87643f2da469476f — Sett survives Shen's combat death (heal precedes re-evaluation) but not Shen's spell death", () => {
  test("showdown: P2's 9-Might Bruiser attacks; P2 must split 9 and CHOOSES 4 → Shen (lethal), 5 → Sett (not lethal at 6); Shen dies, damage is healed, Sett stands at 5 Might / 0 damage and P1 keeps bf1", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", SHEN, "shen", { buffed: true })
      .unit(P1, "bf1", SETT_KINGPIN, "sett")
      .unit(P2, "base", { might: 9, name: "Bruiser" }, "bruiser")
      .build();
    expect(game.state("shen")).toMatchObject({ isBuffed: true, might: 4 });
    expect(game.state("sett")).toMatchObject({ baseMight: 5, might: 6 }); // +1 for buffed Shen here

    await game.p2.move("bruiser", "bf1");
    await game.p2.passFocus();
    await game.p1.passFocus();
    // Both defenders have Tank → the attacker's controller decides the split between them.
    const d = game.decision();
    expect(d).toMatchObject({ kind: "distribute", seat: P2, total: 9 });
    expect(d?.kind === "distribute" ? d.buckets.map((b) => [b.key, b.lethal]) : []).toEqual(
      expect.arrayContaining([
        ["shen", 4],
        ["sett", 6],
      ]),
    );
    await game.p2.distribute({ sett: 5, shen: 4 });
    await game.settle();

    expect(game.zoneOf("shen")).toBe("trash");
    expect(game.zoneOf("bruiser")).toBe("trash"); // took 4 + 6 = 10 ≥ 9
    expect(game.zoneOf("sett")).toBe("battlefield-bf1"); // did NOT die
    expect(game.state("sett")).toMatchObject({ damage: 0, might: 5 }); // healed, and back to 5 without Shen
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast, outside a showdown: Sett already carries 5 damage (fine at 6 Might); Singularity deals 6 to Shen only → Shen dies, Sett drops to 5 Might with 5 damage still marked and dies in the ensuing cleanup", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 6, power: { mind: 2 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", SHEN, "shen", { buffed: true })
      .unit(P1, "bf1", SETT_KINGPIN, "sett", { damage: 5 })
      .unit(P2, "bf2", { might: 2, name: "Onlooker" }, "onlooker")
      .hand(P2, SINGULARITY, "sing")
      .build();
    expect(game.state("sett")).toMatchObject({ damage: 5, might: 6, zone: "battlefield-bf1" });
    await game.p2.cast("sing", { targets: ["shen"] });
    // "up to two": if the engine asks to extend the set, stop at Shen.
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      await game.p2.decline();
    }
    expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.zoneOf("sing")).toBe("trash");
    expect(game.zoneOf("shen")).toBe("trash");
    expect(game.zoneOf("sett")).toBe("trash"); // 5 damage ≥ 5 Might once Shen's buff bonus is gone — no heal outside combat
    expect(game.violations()).toEqual([]);
  });

  test("control for the contrast: the same Singularity on Shen with an UNDAMAGED Sett just leaves Sett at 5 Might", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 6, power: { mind: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", SHEN, "shen", { buffed: true })
      .unit(P1, "bf1", SETT_KINGPIN, "sett")
      .hand(P2, SINGULARITY, "sing")
      .build();
    await game.p2.cast("sing", { targets: ["shen"] });
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      await game.p2.decline();
    }
    await game.settle();
    expect(game.zoneOf("shen")).toBe("trash");
    expect(game.state("sett")).toMatchObject({ damage: 0, might: 5, zone: "battlefield-bf1" });
  });
});
