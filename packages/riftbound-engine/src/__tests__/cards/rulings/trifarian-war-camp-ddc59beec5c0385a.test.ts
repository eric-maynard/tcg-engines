/**
 * Ruling ddc59beec5c0385a — Trifarian War Camp (OGN-294 → ogn-294-298) · Battlefield
 *     "Units here have +1 [Might]. (This includes attackers.)"
 *   × Grand Duelist (Fiora legend, SFD-205 → sfd-205-221)
 *     "When one of your units becomes [Mighty], you may exhaust me to channel 1 rune exhausted."
 *
 * Q: If I play a 4-Might unit directly to Trifarian War Camp, does it "become Mighty" for Fiora's legend?
 * A: No. The Camp's "while here" +1 applies the instant the unit resolves onto the battlefield, so it is 5 Might from the
 *    moment it exists in play — there is never a 4-Might version of it on the board. "Becoming Mighty" needs a unit already
 *    in play to have its Might raised across the threshold; that does not happen here.
 * Rules: 522 (statics apply continuously, incl. on arrival), 780 (Mighty = 5+; "becomes"), 383 (trigger conditions).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TRIFARIAN_WAR_CAMP = "ogn-294-298";
const GRAND_DUELIST = "sfd-205-221";
const RECRUIT = { cardType: "unit", energyCost: 3, might: 4, name: "Recruit" } as const;

/** P1 (Grand Duelist, ready) holds the live War Camp with a 1-Might Holder; a 4-Might Recruit in hand with [3]; a 4-Might Squire in base for the contrast. */
function board() {
  return scenario()
    .legend(P1, GRAND_DUELIST, "duelist")
    .resources(P1, { energy: 3 })
    .battlefield("camp", { controller: P1, def: TRIFARIAN_WAR_CAMP, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "camp", { might: 1, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 4, name: "Squire" }, "squire")
    .unit(P2, "bf2", { might: 2, name: "Onlooker" }, "onlooker")
    .hand(P1, RECRUIT, "recruit");
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
      expect(d.source?.cardId).toBe("duelist");
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

describe("Ruling ddc59beec5c0385a — a 4-Might unit played straight onto Trifarian War Camp never 'becomes' Mighty", () => {
  test("premise: the Camp is live (Holder reads 2); the Recruit played directly there is 5 Might the moment it is on the board", async () => {
    const game = await board().build();
    expect(game.state("holder").might).toBe(2);
    const to = game.p1.option("playUnit", "recruit")?.fields.find((f) => f.name === "location")?.options ?? [];
    expect(to.map(String)).toContain("battlefield-camp");
    await game.p1.play("recruit", { to: "camp" });
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("recruit")).toBe("battlefield-camp");
    expect(game.state("recruit")).toMatchObject({ baseMight: 4, might: 5 });
  });

  test("Grand Duelist does NOT trigger: no 'exhaust me' opt-in, no legend item on the chain, legend still ready, no rune channeled", async () => {
    const game = await board().build();
    const runesBefore = game.p1.runes().length;
    await game.p1.play("recruit", { to: "camp" });
    const r = await drainWatchingDuelist(game);
    expect(r.asked).toBe(false);
    expect(r.sawTrigger).toBe(false);
    expect(game.state("duelist").isExhausted).toBe(false);
    expect(game.p1.runes()).toHaveLength(runesBefore);
    expect(game.state("recruit").might).toBe(5);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — 'exist in play, then have its Might increased': the in-play 4-Might Squire MOVES onto the Camp (4 → 5) and Grand Duelist DOES ask; yes ⇒ legend exhausted, 1 rune channeled exhausted", async () => {
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
