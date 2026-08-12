/**
 * Ruling 29806f17cf68dc5e — Heimerdinger, Inventor (OGN-111 → ogn-111-298) · 3 + [mind] · 3 Might
 *   "I have all [Exhaust] abilities of all friendly legends, units, and gear."
 *   × Renata Glasc, Mastermind (SFD-088 → sfd-088-221) · 4 Might
 *     "[1][mind]: Draw 1.  [4][mind][mind][mind][mind], [Exhaust]: Score 1 point.
 *      Use my abilities only while I'm at a battlefield."
 *
 * Q: Does Heimerdinger copy Renata's battlefield restriction, and can he use her ability from base?
 * A: He gains her [Exhaust] ability, not her separate "use my abilities only while I'm at a
 *    battlefield" passive — so he may fire it from base. He still pays the ability's full cost
 *    ([4] + four [mind]) and exhausts HIMSELF, not Renata. Only the one [Exhaust] ability is copied;
 *    her non-exhaust "[1][mind]: Draw 1" is not.
 * Rules: 151 / 376–377 (activated abilities: choose one, pay all of its costs), 383 (a separate
 *        static restriction is not part of the ability it restricts).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HEIMERDINGER = "ogn-111-298";
const RENATA = "sfd-088-221";

/** Ability options Heimerdinger currently offers: ability index → the card the line was inherited from. */
function heimerLines(game: Game): Record<number, string> {
  const out: Record<number, string> = {};
  for (const o of game.p1.legal()) {
    const m = /^activateAbility:heimer#(\d+)$/.exec(o.key);
    if (m) {
      out[Number(m[1])] = String(o.fields.find((f) => f.name === "sourceCardId")?.options?.[0]);
    }
  }
  return out;
}

/** P1's turn with [5] + five [mind]. Heimerdinger in base; Renata in base too (`atBattlefield` puts her at bf1). */
function board(atBattlefield: boolean) {
  const s = scenario()
    .victoryScore(20)
    .resources(P1, { energy: 5, power: { mind: 5 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
    .unit(P1, "base", HEIMERDINGER, "heimer");
  return atBattlefield ? s.unit(P1, "bf1", RENATA, "renata") : s.unit(P1, "base", RENATA, "renata");
}

describe("Ruling 29806f17cf68dc5e — Heimerdinger copies Renata's [Exhaust] ability, not her battlefield restriction", () => {
  test("premise: Renata's own abilities are dead while she sits in base (her passive restriction bites her)", async () => {
    const game = await board(false).build();
    expect(game.p1.legal().some((o) => o.key.startsWith("activateAbility:renata"))).toBe(false);
  });

  test("ruling: Heimerdinger — also in base — still offers her line; exactly ONE line is inherited (the [Exhaust] one, not '[1][mind]: Draw 1')", async () => {
    const game = await board(false).build();
    const lines = heimerLines(game);
    expect(Object.values(lines)).toEqual(["renata"]);
    expect(Object.keys(lines)).toHaveLength(1);
  });

  test("…and firing it from base works: the full cost ([4] + four [mind]) is paid, HEIMERDINGER exhausts, Renata does not, and P1 scores the point", async () => {
    const game = await board(false).build();
    const index = Number(Object.keys(heimerLines(game))[0]);
    await game.p1.activate("heimer", index);
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { mind: 1 } }); // 5−4 energy, 5−4 mind
    expect(game.state("heimer")).toMatchObject({ isExhausted: true, location: "base" });
    expect(game.state("renata")).toMatchObject({ isExhausted: false, location: "base" });
    expect(game.violations()).toEqual([]);
  });

  test("the cost really is required: with only [3] the inherited line is not offered at all", async () => {
    const game = await scenario()
      .victoryScore(20)
      .resources(P1, { energy: 3, power: { mind: 5 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
      .unit(P1, "base", HEIMERDINGER, "heimer")
      .unit(P1, "base", RENATA, "renata")
      .build();
    expect(heimerLines(game)).toEqual({});
  });

  test("control: with Renata AT a battlefield her own ability is live too — and Heimerdinger's copy is a separate activation", async () => {
    const game = await board(true).build();
    expect(game.p1.legal().some((o) => o.key.startsWith("activateAbility:renata"))).toBe(true);
    expect(Object.values(heimerLines(game))).toEqual(["renata"]);
    const index = Number(Object.keys(heimerLines(game))[0]);
    await game.p1.activate("heimer", index);
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.state("renata").isExhausted).toBe(false); // her own [Exhaust] is still available
    expect(game.state("heimer").isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
