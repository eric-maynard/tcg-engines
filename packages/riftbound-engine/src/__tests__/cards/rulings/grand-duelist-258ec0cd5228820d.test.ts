/**
 * Ruling 258ec0cd5228820d — Grand Duelist (Fiora legend, SFD-205 → sfd-205-221) "When one of your units becomes [Mighty],
 *   you may exhaust me to channel 1 rune exhausted."
 *   × Trifarian War Camp (OGN-294 → ogn-294-298) "Units here have +1 [Might]."
 *   × Relentless Storm (Volibear legend, OGN-249 → ogn-249-298) "When you play a [Mighty] unit, you may exhaust me to
 *     channel 1 rune exhausted."
 *
 * Q: A 4-Might unit is played onto Trifarian War Camp (so it is 5 there). Does Fiora's legend trigger like Volibear's does?
 * A: No. The unit enters already Mighty — Volibear sees "you played a Mighty unit" and triggers, but Fiora needs a
 *    non-Mighty unit to BECOME Mighty, which never happens here. (Fiora does trigger when a unit on the board crosses to 5+.)
 * Rules: 522 (War Camp's static applies as the unit arrives), 383 (trigger conditions), 780 (Mighty = 5+ Might).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GRAND_DUELIST = "sfd-205-221";
const RELENTLESS_STORM = "ogn-249-298";
const TRIFARIAN_WAR_CAMP = "ogn-294-298";
const DISCIPLINE = "ogn-058-298"; // [Reaction] +2 Might this turn, draw 1
const BRUTE = { cardType: "unit", energyCost: 4, might: 4, name: "Brute" } as const;

/** P1's turn with `legend`; P1 holds a live Trifarian War Camp (a 1-Might Holder stands there); Brute (4) + Discipline in hand; a 4-Might Basebrute in base. */
function board(legend: string) {
  return scenario()
    .resources(P1, { energy: 6 })
    .battlefield("camp", { controller: P1, def: TRIFARIAN_WAR_CAMP, inert: false })
    .legend(P1, legend, "legend")
    .unit(P1, "camp", { might: 1, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 4, name: "Basebrute" }, "basebrute")
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .hand(P1, BRUTE, "brute")
    .hand(P1, DISCIPLINE, "disc");
}

/** Play the Brute onto the War Camp; report whether the legend asked to be exhausted, answering yes. */
async function playBruteToCamp(game: Game): Promise<{ asked: boolean; sawTrigger: boolean }> {
  await game.p1.play("brute", { to: "camp" });
  let asked = false;
  let sawTrigger = false;
  for (let i = 0; i < 12; i++) {
    sawTrigger ||= game.chain().some((c) => c.cardId === "legend" && c.triggered);
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "yes-no") {
      expect(d.seat).toBe(P1);
      asked = true;
      await game.p1.yes();
    } else if (d.kind === "action") {
      await game.acting().passPriority();
    } else {
      break;
    }
  }
  return { asked, sawTrigger };
}

describe("Ruling 258ec0cd5228820d — a 4-Might unit played onto Trifarian War Camp: Volibear's legend triggers, Fiora's does not", () => {
  test("premise: the Brute played to the War Camp is a 5 (Mighty) the moment it is on the board", async () => {
    const game = await board(RELENTLESS_STORM).build();
    expect(game.state("holder").might).toBe(2); // camp is live: 1 + 1
    await game.p1.play("brute", { to: "camp" });
    expect(game.zoneOf("brute")).toBe("battlefield-camp");
    expect(game.state("brute")).toMatchObject({ baseMight: 4, might: 5 });
  });

  test("Volibear (Relentless Storm): 'you played a Mighty unit' → the may-exhaust prompt appears (P1's), the trigger resolves and P1 channels 1 rune exhausted", async () => {
    const game = await board(RELENTLESS_STORM).build();
    const runesBefore = game.p1.runes().length;
    const r = await playBruteToCamp(game);
    expect(r.asked).toBe(true);
    expect(r.sawTrigger).toBe(true);
    expect(game.state("legend").isExhausted).toBe(true);
    expect(game.p1.runes()).toHaveLength(runesBefore + 1);
    expect(game.state(game.p1.runes().at(-1) as string).isExhausted).toBe(true);
  });

  test("Fiora (Grand Duelist): the Brute never 'becomes' Mighty — it entered Mighty — so NO prompt, no trigger, legend stays ready, no rune", async () => {
    const game = await board(GRAND_DUELIST).build();
    const runesBefore = game.p1.runes().length;
    const r = await playBruteToCamp(game);
    expect(game.state("brute").might).toBe(5);
    expect(r.asked).toBe(false);
    expect(r.sawTrigger).toBe(false);
    expect(game.state("legend").isExhausted).toBe(false);
    expect(game.p1.runes()).toHaveLength(runesBefore);
    expect(game.violations()).toEqual([]);
  });

  test("control: Fiora DOES trigger when a unit on the board crosses to Mighty — Discipline takes the 4-Might Basebrute to 6 → prompt, exhaust, channel 1", async () => {
    const game = await board(GRAND_DUELIST).build();
    const runesBefore = game.p1.runes().length;
    await game.p1.cast("disc", { targets: "basebrute" });
    let asked = false;
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "yes-no") {
        expect(d.seat).toBe(P1);
        asked = true;
        await game.p1.yes();
      } else if (d.kind === "action") {
        await game.acting().passPriority();
      } else {
        break;
      }
    }
    expect(game.state("basebrute").might).toBe(6);
    expect(asked).toBe(true);
    expect(game.state("legend").isExhausted).toBe(true);
    expect(game.p1.runes()).toHaveLength(runesBefore + 1);
  });
});
