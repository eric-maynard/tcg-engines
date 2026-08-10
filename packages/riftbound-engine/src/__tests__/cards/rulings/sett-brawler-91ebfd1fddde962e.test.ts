/**
 * Ruling 91ebfd1fddde962e — Sett, Brawler (OGN-164 → ogn-164-298, [5][body], 4 Might: "When I'm played and when I
 *   conquer, buff me. Spend my buff: Give me +4 [Might] this turn.") × Relentless Storm (OGN-249 → ogn-249-298,
 *   Volibear legend: "When you play a [Mighty] unit, you may exhaust me to channel 1 rune exhausted.")
 *   × Darius, Executioner (OGN-243 → ogn-243-298: "Other friendly units have +1 [Might] here.")
 *   × Trifarian War Camp (OGN-294 → ogn-294-298: "Units here have +1 [Might].")
 *
 * Q: Playing Sett with Volibear's legend — does Sett buff himself to 5 (Mighty) in time to trigger Relentless Storm?
 * A: No. Relentless Storm checks Mighty at the moment the unit is played; Sett is 4 then, and his own "when I'm played"
 *    buff resolves later. Playing him next to Darius, or onto Trifarian War Camp, DOES work — those passives make him
 *    5 the instant he arrives.
 * Rules: 383.4.a (play triggers evaluate the unit as it is played), 706 (Mighty = 5+ Might), 365 (passives are immediate).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const SETT = "ogn-164-298";
const RELENTLESS_STORM = "ogn-249-298";
const DARIUS = "ogn-243-298";
const TRIFARIAN_WAR_CAMP = "ogn-294-298";

function base() {
  return scenario().resources(P1, { energy: 5, power: { body: 1 } }).legend(P1, RELENTLESS_STORM, "voli").hand(P1, SETT, "sett");
}

/** Drain every prompt after the play, answering YES to Relentless Storm if it ever asks; report whether it did. */
async function drainWatchingVolibear(game: Game): Promise<boolean> {
  let voliAsked = false;
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (game.chain().some((c) => c.cardId === "voli")) {
      voliAsked = true;
    }
    if (d.kind === "yes-no" && d.source?.cardId === "voli") {
      voliAsked = true;
      await game.p1.yes();
    } else if (d.kind === "yes-no") {
      await game.seat(d.seat).yes();
    } else if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else if (d.kind === "order") {
      await game.p1.order(d.items.map((it) => it.key));
    } else if (d.kind === "pick") {
      await game.seat(d.seat).pick(d.options[0]?.key as string);
    } else if (d.kind === "action") {
      await game.acting().pass();
    } else {
      break;
    }
  }
  return voliAsked;
}

describe("Ruling 91ebfd1fddde962e — Sett is not Mighty 'when played'; Relentless Storm only fires if a passive already makes him 5 on arrival", () => {
  test("Sett played to base: he arrives at 4 (not Mighty) → Relentless Storm never triggers; only afterwards does his own play-buff take him to 5", async () => {
    const game = await base().build();
    const runesBefore = game.p1.runes().length;
    await game.p1.play("sett");
    expect(game.state("sett").might).toBe(4); // as played: not Mighty
    expect(game.chain().some((c) => c.cardId === "voli")).toBe(false);
    const voliAsked = await drainWatchingVolibear(game);
    expect(voliAsked).toBe(false);
    expect(game.state("voli").isExhausted).toBe(false);
    expect(game.p1.runes().length).toBe(runesBefore); // nothing channeled
    expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 5 }); // Mighty now — too late
    expect(game.violations()).toEqual([]);
  });

  test("Sett played next to Darius, Executioner (other friendly units +1 here): he is 5 the moment he lands → Relentless Storm triggers; accepting exhausts the legend and channels 1 rune exhausted", async () => {
    const game = await base().battlefield("bf1", { controller: P1 }).unit(P1, "bf1", DARIUS, "darius").build();
    const runesBefore = game.p1.runes().length;
    await game.p1.play("sett", { to: "bf1" });
    expect(game.state("sett").might).toBeGreaterThanOrEqual(5); // 4 + Darius' 1 (before his own buff)
    const voliAsked = await drainWatchingVolibear(game);
    expect(voliAsked).toBe(true);
    expect(game.state("voli").isExhausted).toBe(true);
    expect(game.p1.runes().length).toBe(runesBefore + 1);
    const newest = game.p1.runes().find((r) => game.state(r).isExhausted);
    expect(newest).toBeDefined(); // channeled exhausted
    expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 6 });
  });

  test("Sett played directly onto Trifarian War Camp (units here +1): also 5 on arrival → Relentless Storm triggers", async () => {
    const game = await base().battlefield("camp", { controller: P1, def: TRIFARIAN_WAR_CAMP, inert: false }).unit(P1, "camp", { might: 1, name: "Holder" }, "holder").build();
    await game.p1.play("sett", { to: "camp" });
    expect(game.state("sett").might).toBeGreaterThanOrEqual(5);
    const voliAsked = await drainWatchingVolibear(game);
    expect(voliAsked).toBe(true);
    expect(game.state("voli").isExhausted).toBe(true);
    expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 6 });
  });
});
