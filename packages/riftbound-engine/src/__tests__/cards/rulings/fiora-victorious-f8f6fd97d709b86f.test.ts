/**
 * Ruling f8f6fd97d709b86f — Fiora, Victorious (OGN-232 → ogn-232-298) · Champion Unit · Order · [4] · 4 Might
 *     "While I'm [Mighty], I have [Deflect], [Ganking], and [Shield]. (I'm Mighty while I have 5+ [Might].)"
 *   × Trifarian War Camp (OGN-294 → ogn-294-298) · Battlefield — "Units here have +1 [Might]. (This includes attackers.)"
 *   Observer: Grand Duelist (Fiora legend, sfd-205-221) "When one of your units becomes [Mighty], you may exhaust me to
 *   channel 1 rune exhausted."
 *
 * Q: Does Fiora, Victorious "become Mighty" when played directly onto Trifarian War Camp?
 * A: No. The Camp's +1 applies the instant she arrives, so she is 5 Might from her first moment on the board — there is
 *    no transition from <5 to 5+ while in play, so "becomes [Mighty]" abilities do not trigger (she IS Mighty, though,
 *    and has her keywords). Contrast: a 4-Might Fiora already on the board that moves onto the Camp does become Mighty.
 * Rules: 709/710 (becomes Mighty = a unit in play crossing to 5+), 730 (Mighty = 5+), statics apply on arrival.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIORA_VICTORIOUS = "ogn-232-298";
const TRIFARIAN_WAR_CAMP = "ogn-294-298";
const GRAND_DUELIST = "sfd-205-221";

/** P1's turn with [4]; Grand Duelist is P1's legend; P1 holds the LIVE War Camp with a 1-Might Holder; Fiora in hand. */
function playBoard() {
  return scenario()
    .resources(P1, { energy: 4 })
    .legend(P1, GRAND_DUELIST, "duelist")
    .battlefield("camp", { controller: P1, def: TRIFARIAN_WAR_CAMP, inert: false })
    .unit(P1, "camp", { might: 1, name: "Holder" }, "holder")
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .hand(P1, FIORA_VICTORIOUS, "fiora");
}

/** Drive any chain window after an action, reporting whether the legend ever asked / triggered. Answers yes if asked. */
async function watchLegend(game: Game): Promise<{ asked: boolean; sawTrigger: boolean }> {
  let asked = false;
  let sawTrigger = false;
  for (let i = 0; i < 12; i++) {
    sawTrigger ||= game.chain().some((c) => c.cardId === "duelist" && c.triggered);
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "yes-no" && d.seat === P1) {
      asked = true;
      await game.p1.yes();
    } else if (d.kind === "action") {
      await game.acting().passPriority();
    } else {
      break;
    }
  }
  sawTrigger ||= game.chain().some((c) => c.cardId === "duelist" && c.triggered);
  return { asked, sawTrigger };
}

describe("Ruling f8f6fd97d709b86f — Fiora, Victorious played onto Trifarian War Camp is Mighty at once but never 'becomes' Mighty", () => {
  test("premise: the Camp is live (Holder 1 → 2) and Fiora can be played straight onto it", async () => {
    const game = await playBoard().build();
    expect(game.state("holder").might).toBe(2);
    const where = (game.p1.option("playUnit", "fiora")?.fields.find((f) => f.name === "location")?.options ?? []) as string[];
    expect(where).toContain("battlefield-camp");
  });

  test("played to the Camp she is 5 Might the instant she is on the board — Mighty, with Deflect / Ganking / Shield live", async () => {
    const game = await playBoard().build();
    await game.p1.play("fiora", { to: "camp" });
    expect(game.zoneOf("fiora")).toBe("battlefield-camp");
    expect(game.state("fiora")).toMatchObject({ baseMight: 4, might: 5 });
    await watchLegend(game);
    expect(game.state("fiora").might).toBe(5);
    expect(game.state("fiora").keywords).toEqual(expect.arrayContaining(["Deflect", "Ganking", "Shield"]));
  });

  test("…but she did not 'become' Mighty: Grand Duelist never triggers — no prompt, nothing on the chain from the legend, legend stays ready, no rune channeled", async () => {
    const game = await playBoard().build();
    const runesBefore = game.p1.runes().length;
    await game.p1.play("fiora", { to: "camp" });
    const r = await watchLegend(game);
    expect(r.asked).toBe(false);
    expect(r.sawTrigger).toBe(false);
    expect(game.state("duelist").isExhausted).toBe(false);
    expect(game.p1.runes()).toHaveLength(runesBefore);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: a 4-Might Fiora already in play that MOVES onto the Camp crosses 4 → 5 while a game object — she becomes Mighty and Grand Duelist DOES trigger (prompt, exhaust, +1 rune)", async () => {
    const game = await scenario()
      .legend(P1, GRAND_DUELIST, "duelist")
      .battlefield("camp", { controller: P1, def: TRIFARIAN_WAR_CAMP, inert: false })
      .unit(P1, "camp", { might: 1, name: "Holder" }, "holder")
      .unit(P1, "base", FIORA_VICTORIOUS, "fiora")
      .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
      .build();
    expect(game.state("fiora").might).toBe(4);
    expect(game.state("fiora").keywords).not.toContain("Deflect");
    const runesBefore = game.p1.runes().length;
    await game.p1.move("fiora", "camp");
    expect(game.state("fiora").might).toBe(5);
    const r = await watchLegend(game);
    await game.settle();
    expect(r.sawTrigger || r.asked).toBe(true);
    expect(r.asked).toBe(true);
    expect(game.state("duelist").isExhausted).toBe(true);
    expect(game.p1.runes()).toHaveLength(runesBefore + 1);
    expect(game.state("fiora").keywords).toEqual(expect.arrayContaining(["Deflect", "Ganking", "Shield"]));
  });
});
