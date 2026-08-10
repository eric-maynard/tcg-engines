/**
 * Ruling acfcd0ec37dcf81c — Deathgrip (SFD-163 → sfd-163-221) · Reaction [2][order] "Kill a friendly unit. If you do, give +Might equal to
 *     its Might to another friendly unit this turn. Draw 1."
 *   × Soraka, Wanderer (SFD-173 → sfd-173-221) · 4 Might "If another unit you control here would die, if it has less Might than me,
 *     instead heal it, exhaust it, and recall it."
 *
 * Q: Can I Deathgrip a unit at the same battlefield as my Soraka?
 * A: Yes, it is a legal target — but Soraka's replacement turns the death into heal + exhaust + recall, so the unit was not killed:
 *    the "If you do" Might bonus does not happen; the (unlinked) Draw 1 still does.
 * Rules: 366 / 371–372 (replacement effects alter the kill as it executes), 359.3.e.14.b ("If you do" — Deathgrip is the printed
 *        example), 359.3.e.5 (Draw 1 is independent).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEATHGRIP = "sfd-163-221";
const SORAKA = "sfd-173-221";

/** P1's turn. P1 holds bf1 with Soraka (4) + Sprout (2); Brawler (3) in base; Deathgrip + [2][order]; known deck. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", SORAKA, "soraka")
    .unit(P1, "bf1", { might: 2, name: "Sprout" }, "sprout")
    .unit(P1, "base", { might: 3, name: "Brawler" }, "brawler")
    .unit(P2, "bf2", { might: 3, name: "Onlooker" }, "onlooker")
    .hand(P1, DEATHGRIP, "grip")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

function gripTargets(game: Game): string[] {
  const f = game.p1.option("cast", "grip")?.fields.find((x) => x.arg === "targets" || x.name === "targets");
  return [...new Set((f?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/** Resolve the spell; if a "+Might recipient" pick appears for P1, take the Brawler and report that it was asked. */
async function resolveGrip(game: Game): Promise<{ recipientAsked: boolean }> {
  let recipientAsked = false;
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "pick" && d.seat === P1) {
      recipientAsked = true;
      await game.p1.pick("brawler");
    } else if (d.kind === "action") {
      await game.seat(d.seat).pass();
    } else if (d.kind === "yes-no") {
      await game.seat(d.seat).yes();
    } else {
      break;
    }
  }
  return { recipientAsked };
}

describe("Ruling acfcd0ec37dcf81c — Deathgrip on an ally beside Soraka: legal, but Soraka saves it, so no Might bonus (still Draw 1)", () => {
  test("the Sprout at Soraka's battlefield IS a legal Deathgrip target and the spell goes on the chain choosing it", async () => {
    const game = await board().build();
    expect(gripTargets(game)).toContain("sprout");
    await game.p1.cast("grip", { targets: "sprout" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "grip", controller: P1, targets: ["sprout"] })]);
  });

  test("on resolution Soraka's replacement applies (2 < 4): the Sprout is NOT killed — healed, exhausted, recalled to base — so 'If you do' fails: no recipient is chosen, Brawler stays 3; P1 still draws 1", async () => {
    const game = await board().build();
    await game.p1.cast("grip", { targets: "sprout" });
    const r = await resolveGrip(game);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("grip")).toBe("trash");
    // Saved, not dead:
    expect(game.zoneOf("sprout")).toBe("base");
    expect(game.p1.trash()).not.toContain("sprout");
    expect(game.state("sprout")).toMatchObject({ damage: 0, isExhausted: true });
    // "If you do" not met:
    expect(r.recipientAsked).toBe(false);
    expect(game.state("brawler")).toMatchObject({ might: 3, mightModifier: 0 });
    expect(game.state("soraka")).toMatchObject({ might: 4, mightModifier: 0 });
    // Unlinked "Draw 1" still happens:
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: Deathgrip on the Brawler in BASE (not 'here' for Soraka) really kills it → P1 picks a recipient: Sprout gets +3 this turn, and draws 1", async () => {
    const game = await board().build();
    await game.p1.cast("grip", { targets: "brawler" });
    let asked = false;
    for (let i = 0; i < 10; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick" && d.seat === P1) {
        asked = true;
        expect(d.options.map((o) => o.card ?? o.key)).toEqual(expect.arrayContaining(["sprout", "soraka"]));
        await game.p1.pick("sprout");
      } else if (d.kind === "action") {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(asked).toBe(true);
    expect(game.zoneOf("brawler")).toBe("trash");
    expect(game.state("sprout")).toMatchObject({ might: 5, mightModifier: 3 });
    expect(game.p1.hand()).toEqual(["d1"]);
  });
});
