/**
 * Ruling 37d256520696059c — Trifarian War Camp (OGN-294 → ogn-294-298) · Battlefield
 *   "Units here have +1 [Might]. (This includes attackers.)"
 *   × Relentless Storm (OGN-249 → ogn-249-298, Volibear legend) "When you play a [Mighty] unit, you may
 *     exhaust me to channel 1 rune exhausted."
 *   × Sett, Brawler (OGN-164 → ogn-164-298) · [5][body] · 4 Might "When I'm played and when I conquer,
 *     buff me." (a +1 [Might] buff)
 *
 * Q: Does Sett trigger Volibear's legend when played, given he buffs himself to 5 on entry?
 * A: No. "When you play a Mighty unit" tests the unit as it is played: Sett arrives as a 4 and only
 *    becomes Mighty once his own on-play trigger RESOLVES — far too late. An effect that applies
 *    instantly instead, like the War Camp's static +1, does make him a 5 the moment he lands, and then
 *    Volibear does trigger.
 * Rules: 383.4 (a trigger's condition is tested as the event happens), 780 (Mighty = 5+ Might),
 *        611 (a static Might modifier applies continuously, with no resolution step), 359.3.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WAR_CAMP = "ogn-294-298";
const RELENTLESS_STORM = "ogn-249-298";
const SETT_BRAWLER = "ogn-164-298";

/** P1's turn with Volibear's legend and [5][body] for Sett; P1 holds the War Camp with a Holder on it. */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { body: 1 } })
    .legend(P1, RELENTLESS_STORM, "voli")
    .battlefield("camp", { controller: P1, def: WAR_CAMP, inert: false })
    .battlefield("plain", { controller: P1 })
    .unit(P1, "camp", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "plain", { might: 2, name: "Anchor" }, "anchor")
    .hand(P1, SETT_BRAWLER, "sett");
}

/** Play Sett to `where` and report whether Volibear's legend was ever offered / put on the chain. */
async function playSett(game: Game, where: string): Promise<{ sawTrigger: boolean }> {
  await game.p1.play("sett", { to: where });
  let sawTrigger = game.chain().some((c) => c.cardId === "voli");
  const d = game.decision();
  if (d?.kind === "yes-no" && d.source?.cardId === "voli") {
    sawTrigger = true;
    await game.p1.no();
  }
  for (let i = 0; i < 8; i++) {
    sawTrigger ||= game.chain().some((c) => c.cardId === "voli");
    const dd = game.decision();
    if (dd?.kind === "yes-no" && dd.source?.cardId === "voli") {
      sawTrigger = true;
      await game.p1.no();
    } else if (dd?.kind === "action" && (dd.context === "chain" || dd.context === "showdown")) {
      await game.acting().pass();
    } else {
      break;
    }
  }
  return { sawTrigger };
}

describe("Ruling 37d256520696059c — Sett is not Mighty when he is played, so Volibear's legend stays silent", () => {
  test("ruling 37d256520696059c — Sett played to a plain battlefield: he arrives as a 4, Volibear never triggers, and only afterwards does his own buff make him a 5", async () => {
    const game = await board().build();
    const { sawTrigger } = await playSett(game, "plain");
    expect(sawTrigger).toBe(false);
    await game.settle();
    expect(game.state("sett")).toMatchObject({ baseMight: 4, isBuffed: true, might: 5 });
    expect(game.p1.runes()).toHaveLength(0); // nothing was channeled
    expect(game.state("voli").isReady).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("the nuance: onto the Trifarian War Camp its static +1 applies instantly, so he IS a Mighty unit as he is played and Volibear triggers", async () => {
    const game = await board().build();
    const { sawTrigger } = await playSett(game, "camp");
    expect(sawTrigger).toBe(true);
    await game.settle();
    expect(game.state("sett").baseMight).toBe(4);
    expect(game.state("sett").might).toBe(6); // 4 + 1 camp + 1 buff
  });

  test("and taking Volibear's offer there really does channel an exhausted rune", async () => {
    const game = await board().build();
    await game.p1.play("sett", { to: "camp" });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(d?.source?.cardId).toBe("voli");
    await game.p1.yes();
    expect(game.state("voli").isExhausted).toBe(true);
    await game.settle();
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
  });

  test("control: a plain 5-Might unit played to a plain battlefield does trigger Volibear — the legend itself works", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5 })
      .legend(P1, RELENTLESS_STORM, "voli")
      .battlefield("plain", { controller: P1 })
      .unit(P1, "plain", { might: 2, name: "Anchor" }, "anchor")
      .hand(P1, { cardType: "unit", energyCost: 5, might: 5, name: "Colossus" }, "colossus")
      .build();
    await game.p1.play("colossus", { to: "plain" });
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "voli" } });
  });

  test("…and a 4-Might unit played to a plain battlefield does not", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .legend(P1, RELENTLESS_STORM, "voli")
      .battlefield("plain", { controller: P1 })
      .unit(P1, "plain", { might: 2, name: "Anchor" }, "anchor")
      .unit(P2, "base", { might: 1, name: "Bystander" }, "bystander")
      .hand(P1, { cardType: "unit", energyCost: 4, might: 4, name: "Brute" }, "brute")
      .build();
    await game.p1.play("brute", { to: "plain" });
    expect(game.chain().some((c) => c.cardId === "voli")).toBe(false);
    expect(game.decision()).not.toMatchObject({ kind: "yes-no" });
  });
});
