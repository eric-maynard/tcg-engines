/**
 * Ruling d9fe47b51fd2a56f — Blastcone Fae (OGN-097 → ogn-097-298) · Unit · Mind · [2][mind] · 2 Might
 *     "[Hidden] When you play me, give a unit -2 [Might] this turn, to a minimum of 1 [Might]."
 *   (Blast Cone UNL-133 / Teemo, Strategist OGN-121 are name-adjacent context; Teemo's case is "under review".)
 *   + Mischievous Marai (UNL-003 → unl-003-219) · Hidden unit "When you play me to a battlefield, deal 2 to an enemy unit
 *     here." — used for the "no valid target at all" branch of the answer.
 *
 * Q: Can a hidden unit be flipped/played if its play ability has no valid target, or is it unplayable?
 * A: It can still be flipped: the unit enters play and the ability simply doesn't happen. A unit whose ability can target
 *    itself (Blastcone Fae — "a unit") MUST target itself if it is the only valid target.
 * Rules: 811.1.d (only a hidden SPELL with no valid targets can't be played; permanents can), 811.1.d.2 (play-effect targets
 *        restricted to that battlefield), 355.4/355.7 (a mandatory target with one legal option is that option).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BLASTCONE_FAE = "ogn-097-298";
const MISCHIEVOUS_MARAI = "unl-003-219";

describe("Ruling d9fe47b51fd2a56f — hidden units flip even without targets; Blastcone Fae alone must shrink itself", () => {
  test("Blastcone Fae hidden at an otherwise EMPTY bf1 (P1 controls it): the flip is legal, the Fae enters bf1, and its mandatory '-2 to a unit' has exactly one legal unit here — itself → Fae is 2 - 2 → minimum 1", async () => {
    const game = await scenario()
      .turn(3)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 4, name: "Far" }, "far") // a unit elsewhere — NOT a legal choice from hidden
      .unit(P2, "base", { might: 4, name: "Home" }, "home")
      .facedown(P1, "bf1", BLASTCONE_FAE, "fae")
      .build();
    expect(game.p1.can("reveal", "fae")).toBe(true);
    await game.p1.reveal("fae");
    expect(game.p1.energy()).toBe(0); // from hidden: [0]
    expect(game.zoneOf("fae")).toBe("battlefield-bf1");
    // The target is either asked (only "fae" offered) or locked as the single legal option.
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect(d.options.map((o) => o.card ?? o.key)).toEqual(["fae"]);
      expect(d.allowDecline).toBe(false); // no "may": it must shrink itself
      await game.p1.pick("fae");
    }
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("fae")).toMatchObject({ baseMight: 2, might: 1, zone: "battlefield-bf1" });
    expect(game.state("fae").mightModifier).toBeLessThan(0);
    expect(game.state("far").might).toBe(4);
    expect(game.state("home").might).toBe(4);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("Mischievous Marai hidden at bf1 with NO enemy unit here: still flippable — Marai enters bf1, the 'deal 2 to an enemy unit here' play effect just doesn't happen (no prompt, nobody damaged)", async () => {
    const game = await scenario()
      .turn(3)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 3, name: "Anchor" }, "anchor")
      .unit(P2, "bf2", { might: 2, name: "Far" }, "far") // enemy, but not "here"
      .unit(P2, "base", { might: 2, name: "Home" }, "home")
      .facedown(P1, "bf1", MISCHIEVOUS_MARAI, "marai")
      .build();
    expect(game.p1.can("reveal", "marai")).toBe(true);
    await game.p1.reveal("marai");
    expect(game.zoneOf("marai")).toBe("battlefield-bf1");
    const r = await game.settle();
    expect(r.reason).toBe("open"); // never stalled on a target prompt
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("marai")).toBe("battlefield-bf1");
    expect(game.state("far").damage).toBe(0);
    expect(game.state("home").damage).toBe(0);
    expect(game.state("anchor").damage).toBe(0);
    expect(game.p1.units("bf1").toSorted()).toEqual(["anchor", "marai"]);
    expect(game.violations()).toEqual([]);
  });

  test("control: with an enemy unit here, the same Marai flip DOES deal it 2", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Anchor" }, "anchor")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .facedown(P1, "bf1", MISCHIEVOUS_MARAI, "marai")
      .build();
    await game.p2.move("raider", "bf1"); // Raider attacks bf1 → now an enemy unit "here"
    await game.p2.passFocus();
    await game.p1.reveal("marai", { answers: ["raider"] });
    for (let i = 0; i < 3 && game.decision()?.kind === "pick"; i++) {
      await game.acting().pick("raider");
    }
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (d?.kind !== "action") {
        break;
      }
      await game.seat(d.seat).pass();
    }
    expect(game.state("raider").damage).toBe(2);
    expect(game.zoneOf("marai")).toBe("battlefield-bf1");
  });
});
