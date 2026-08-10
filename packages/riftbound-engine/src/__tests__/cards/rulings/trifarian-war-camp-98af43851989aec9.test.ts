/**
 * Ruling 98af43851989aec9 — Trifarian War Camp (OGN-294 → ogn-294-298, Battlefield) "Units here have +1 [Might]. (This includes
 *   attackers.)"
 *   × Fiora, Victorious (OGN-232 → ogn-232-298) · Champion · Order · 4 · 4 Might "While I'm [Mighty], I have [Deflect], [Ganking],
 *     and [Shield]."
 *   × Grand Duelist (Fiora legend, sfd-205-221) "When one of your units becomes [Mighty], you may exhaust me to channel 1 rune
 *     exhausted."
 *
 * Q: I already hold Trifarian War Camp and play Fiora, Victorious directly to it — she is instantly Mighty. Can I use my Fiora
 *    legend to channel a rune?
 * A: No. The Camp's +1 applies as she enters, so she is 5 the instant she exists on the board — she never changes from <5 to 5+
 *    while in play, so she did not "become Mighty" and Grand Duelist does not trigger. Moving an already-in-play 4-Might unit
 *    from base to the Camp DOES trigger it.
 * Rules: 522 (statics apply continuously, including on arrival), 780 (Mighty = 5+; "becomes Mighty" = crossing the threshold
 *        while in play), 383 (trigger conditions).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TRIFARIAN_WAR_CAMP = "ogn-294-298";
const FIORA_VICTORIOUS = "ogn-232-298";
const GRAND_DUELIST = "sfd-205-221";

/** P1 (Fiora — Grand Duelist, ready) holds the live War Camp with a 1-Might Holder; Fiora, Victorious in hand with exactly [4]; a second Fiora-sized 4-Might Squire in base for the contrast. */
function board() {
  return scenario()
    .legend(P1, GRAND_DUELIST, "duelist")
    .resources(P1, { energy: 4 })
    .battlefield("camp", { controller: P1, def: TRIFARIAN_WAR_CAMP, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "camp", { might: 1, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 4, name: "Squire" }, "squire")
    .unit(P2, "bf2", { might: 2, name: "Onlooker" }, "onlooker")
    .hand(P1, FIORA_VICTORIOUS, "fiora");
}

/** Drain to the open main phase, answering YES to any legend opt-in; report whether it was asked / a duelist item appeared. */
async function drainWatchingDuelist(game: Game): Promise<{ asked: boolean; sawTrigger: boolean }> {
  let asked = false;
  let sawTrigger = false;
  for (let i = 0; i < 12; i++) {
    sawTrigger ||= game.chain().some((c) => c.cardId === "duelist" && c.triggered);
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "yes-no") {
      expect(d.seat).toBe(P1);
      asked = true;
      await game.p1.yes();
    } else if (d.kind === "action") {
      await game.acting().pass();
    } else if (d.kind === "order") {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  return { asked, sawTrigger };
}

describe("Ruling 98af43851989aec9 — Fiora, Victorious played straight onto Trifarian War Camp never 'becomes' Mighty", () => {
  test("premise: the Camp is live (Holder reads 2) and Fiora played directly to it is 5 — Mighty, with Deflect/Ganking/Shield — the moment she is on the board", async () => {
    const game = await board().build();
    expect(game.state("holder").might).toBe(2);
    const to = game.p1.option("playUnit", "fiora")?.fields.find((f) => f.name === "location")?.options ?? [];
    expect(to.map(String)).toContain("battlefield-camp");
    await game.p1.play("fiora", { to: "camp" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("fiora")).toBe("battlefield-camp");
    expect(game.state("fiora")).toMatchObject({ baseMight: 4, might: 5 });
    expect(game.state("fiora").keywords).toEqual(expect.arrayContaining(["Deflect", "Ganking", "Shield"]));
  });

  test("Grand Duelist does NOT trigger off that play: no 'exhaust me' prompt, no legend item on the chain, legend still ready, no rune channeled", async () => {
    const game = await board().build();
    const runesBefore = game.p1.runes().length;
    await game.p1.play("fiora", { to: "camp" });
    const r = await drainWatchingDuelist(game);
    expect(r.asked).toBe(false);
    expect(r.sawTrigger).toBe(false);
    expect(game.state("duelist").isExhausted).toBe(false);
    expect(game.p1.runes()).toHaveLength(runesBefore);
    expect(game.state("fiora").might).toBe(5);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // BUG: the engine recalculates the Camp's static +1 on arrival (Squire reads 5) but emits no "become-mighty" event for a
  // threshold crossed via a location-based static, so Grand Duelist never asks. Expected (FAQ #8556 per the ruling): it triggers.
  test("ruling 98af43851989aec9 — engine fires no become-Mighty trigger when an in-play unit crosses to 5 by moving onto the War Camp. Contrast (the FAQ's distinction): the 4-Might Squire already in play MOVES from base to the Camp → 4 → 5 while in play = 'becomes Mighty' → Grand Duelist asks, exhausts, and channels 1 rune exhausted", async () => {
    const game = await board().build();
    const runesBefore = game.p1.runes().length;
    await game.p1.move("squire", "camp");
    expect(game.state("squire").might).toBe(5);
    const r = await drainWatchingDuelist(game);
    expect(r.asked).toBe(true);
    expect(game.state("duelist").isExhausted).toBe(true);
    expect(game.p1.runes()).toHaveLength(runesBefore + 1);
    expect(game.state(game.p1.runes().at(-1) as string).isExhausted).toBe(true);
  });
});
