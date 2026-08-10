/**
 * Ruling 83cbae8b435f9cf6 — Relentless Storm (Volibear legend, OGN-249 → ogn-249-298) · "When you play a [Mighty] unit, you may
 *   exhaust me to channel 1 rune exhausted."   × Trifarian War Camp (OGN-294 → ogn-294-298) · "Units here have +1 [Might]. (This
 *   includes attackers.)"   × Rengar, Pouncing (sfd-025-221) · 3 Might · [Reaction] [Assault 2] "I can be played to a battlefield
 *   you're attacking." — the "Rengar (3 might, assault 2)" of the question.
 *
 * Q: Do units played from hand during a showdown get their Assault/Shield bonus? And does playing Rengar (3, Assault 2) as an
 *    attacker trigger Volibear's legend?
 * A: Yes — a Cleanup follows the play, the newcomer takes its controller's attacker/defender designation and Assault/Shield then
 *    apply. But Rengar ENTERS as a 3 and only becomes 5 after that Cleanup, so "you played a Mighty unit" is false — no Volibear
 *    trigger. Contrast: a 4-Might unit played onto Trifarian War Camp is 5 the instant it arrives → Volibear DOES trigger.
 * Rules: 464.2.c.3 (late arrivals gain their controller's designation at Cleanup), 803 (Assault), 780 (Mighty = 5+), 383.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RELENTLESS_STORM = "ogn-249-298";
const TRIFARIAN_WAR_CAMP = "ogn-294-298";
const RENGAR_POUNCING = "sfd-025-221";
const BRUTE = { cardType: "unit", energyCost: 4, might: 4, name: "Brute" } as const;

/** P1's turn 3 (Volibear legend). P2 holds bf1 with a 6-Might Wall; P1's 2-Might Scout attacks from base; Rengar in hand with 3 + [fury]. */
function showdownBoard() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 3, power: { fury: 1 } })
    .legend(P1, RELENTLESS_STORM, "voli")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 6, name: "Wall" }, "wall")
    .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
    .hand(P1, RENGAR_POUNCING, "rengar");
}

/** Scout attacks bf1; P1 (Focus) plays Rengar, Pouncing to the battlefield it is attacking; drive any chain window, watching for the legend. */
async function rengarJoinsTheAttack(game: Game): Promise<{ asked: boolean; sawTrigger: boolean }> {
  await game.p1.move("scout", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("play", "rengar")).toBe(true);
  const where = (game.p1.option("playUnit", "rengar")?.fields.find((f) => f.name === "location")?.options ?? []) as string[];
  expect(where).toContain("battlefield-bf1"); // "a battlefield you're attacking"
  await game.p1.play("rengar", { to: "bf1" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  let asked = false;
  let sawTrigger = false;
  for (let i = 0; i < 8; i++) {
    sawTrigger ||= game.chain().some((c) => c.cardId === "voli");
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "voli") {
      asked = true;
      await game.p1.no();
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.acting().passPriority();
    } else {
      break;
    }
  }
  sawTrigger ||= game.chain().some((c) => c.cardId === "voli");
  return { asked, sawTrigger };
}

describe("Ruling 83cbae8b435f9cf6 — showdown arrivals get Assault, but Rengar (3 → 5 only after Cleanup) is not 'played Mighty'", () => {
  test("Rengar, Pouncing played into the attack: he is designated an ATTACKER and Assault 2 applies — 3 + 2 = 5 Might at bf1", async () => {
    const game = await showdownBoard().build();
    await rengarJoinsTheAttack(game);
    expect(game.zoneOf("rengar")).toBe("battlefield-bf1");
    expect(game.state("rengar").combatRole).toBe("attacker");
    expect(game.state("rengar")).toMatchObject({ baseMight: 3, might: 5 });
  });

  test("… yet Volibear's legend does NOT trigger: Rengar entered as a 3 (Mighty only after the Cleanup) — no prompt, nothing on the chain from the legend, legend still ready, no rune channeled", async () => {
    const game = await showdownBoard().build();
    const runesBefore = game.p1.runes().length;
    const r = await rengarJoinsTheAttack(game);
    expect(r.asked).toBe(false);
    expect(r.sawTrigger).toBe(false);
    expect(game.state("voli").isExhausted).toBe(false);
    expect(game.p1.runes()).toHaveLength(runesBefore);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: a 4-Might Brute played onto P1's Trifarian War Camp is 5 the moment it lands → Volibear triggers (P1's 'you may exhaust me'), and accepting channels 1 rune exhausted", async () => {
    const game = await scenario()
      .turn(3)
      .resources(P1, { energy: 4 })
      .legend(P1, RELENTLESS_STORM, "voli")
      .battlefield("camp", { controller: P1, def: TRIFARIAN_WAR_CAMP, inert: false })
      .unit(P1, "camp", { might: 1, name: "Holder" }, "holder")
      .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
      .hand(P1, BRUTE, "brute")
      .build();
    const runesBefore = game.p1.runes().length;
    await game.p1.play("brute", { to: "camp" });
    expect(game.state("brute")).toMatchObject({ baseMight: 4, might: 5, zone: "battlefield-camp" });
    let asked = false;
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1) {
        expect(d.source?.cardId).toBe("voli");
        asked = true;
        await game.p1.yes();
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.acting().passPriority();
      } else {
        break;
      }
    }
    await game.settle();
    expect(asked).toBe(true);
    expect(game.state("voli").isExhausted).toBe(true);
    expect(game.p1.runes()).toHaveLength(runesBefore + 1);
    expect(game.state(game.p1.runes().at(-1) as string).isExhausted).toBe(true);
  });
});
