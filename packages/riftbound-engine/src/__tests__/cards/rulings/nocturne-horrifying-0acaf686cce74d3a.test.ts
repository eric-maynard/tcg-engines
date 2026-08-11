/**
 * Ruling 0acaf686cce74d3a — Nocturne, Horrifying (OGN-194 → ogn-194-298) · Champion Unit · Chaos · [4][chaos] · 4
 *   "[Ganking] As you look at or reveal me from the top of your deck, you may banish me. If you do, you may play
 *    me for [rainbow]."
 *   × Teemo, Strategist (ogn-121-298 — the "Teemo's trigger" of the ruling; errata'd to defend-only) · 2 Might
 *     "[Hidden] When I defend, choose an enemy unit here and reveal the top 5 cards of your Main Deck. Deal 1 to
 *     that unit for each card with [Hidden] revealed this way, then recycle the revealed cards."
 *
 * Q: Can Nocturne be played directly to the DEFENDING battlefield after Teemo's defend trigger reveals it?
 * A: Yes. Teemo's reveal hits Nocturne's "as you reveal me" → banish, then play for [rainbow]; the play may put
 *    it straight onto the battlefield being defended, where it arrives as a (late) defender.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NOCTURNE = "ogn-194-298";
const TEEMO_STRATEGIST = "ogn-121-298";
const SKULKER = "ogn-175-298"; // vanilla deck filler with a known identity

/**
 * P2's turn. P1 holds bf1 with a face-up Teemo, Strategist; P1's deck (top first): Nocturne, then 5 Skulkers;
 * P1 has exactly one [rainbow] and no energy. P2's Raider (3) attacks bf1 from base.
 */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", TEEMO_STRATEGIST, "teemo")
    .deck(P1, [NOCTURNE, SKULKER, SKULKER, SKULKER, SKULKER, SKULKER], ["noc", "s1", "s2", "s3", "s4", "s5"])
    .resources(P1, { energy: 0, power: { rainbow: 1 } })
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider");
}

function isNocturneOffer(d: Decision | null): boolean {
  if (!d || d.seat !== P1) {
    return false;
  }
  if (d.kind === "yes-no") {
    return /nocturne|banish/i.test(`${d.prompt} ${d.consequence ?? ""}`) || d.source?.cardId === "noc";
  }
  if (d.kind === "pick") {
    return d.source?.cardId === "noc" || (/banish|nocturne/i.test(d.prompt) && d.options.some((o) => (o.card ?? o.key) === "noc"));
  }
  return false;
}

/** P2's Raider attacks bf1; Teemo's defend trigger goes on the chain; both pass so it starts resolving. Stops at the first non-pass prompt. */
async function teemoDefendsAndReveals(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(game.state("teemo").combatRole).toBe("defender");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "teemo", controller: P1, triggered: true })]);
  for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "teemo"); i++) {
    const d = game.decision();
    if (d?.kind !== "action" || !d.passKey) {
      break;
    }
    await game.seat(d.seat).pass();
  }
  return game;
}

describe("Ruling 0acaf686cce74d3a — Nocturne revealed by Teemo's defend trigger can be banished and played straight to the defending battlefield", () => {
  test("premise: Raider attacking bf1 makes Teemo a defender and fires 'When I defend' — the top 5 (Nocturne + 4 Skulkers) are revealed and recycled, Raider takes 0 (no [Hidden] among them)", async () => {
    const game = await teemoDefendsAndReveals();
    // Decline anything optional (incl. a Nocturne offer, if the engine makes one) to observe the bare trigger.
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (!d || d.kind === "action") {
        break;
      }
      if (d.kind === "yes-no") {
        await game.seat(d.seat).no();
      } else if (d.kind === "pick" && d.allowDecline) {
        await game.seat(d.seat).decline();
      } else if (d.kind === "pick") {
        await game.seat(d.seat).pick(d.options[0]!.key);
      } else {
        break;
      }
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("raider").damage).toBe(0);
    // Revealed cards were recycled to the bottom: s5 is the new top, Nocturne is no longer on top.
    expect(game.p1.deck()[0]).toBe("s5");
    expect(game.p1.deck().indexOf("noc")).toBeGreaterThan(4);
  });

  // Expected: while Teemo's trigger reveals the top 5, Nocturne's "as you reveal me" replacement asks P1 (a) banish
  // me? → yes, (b) play me for [rainbow]? → yes, (c) where? → the offer includes bf1 (the battlefield being
  // defended); choosing it puts Nocturne AT bf1, [rainbow] spent, and it picks up the Defender designation.
  test("ruling 0acaf686cce74d3a — P1 may banish Nocturne off Teemo's reveal and play it for [rainbow] directly to the defending bf1", async () => {
    const game = await teemoDefendsAndReveals();
    // (a) banish offer
    let d = game.decision();
    expect(isNocturneOffer(d)).toBe(true);
    expect(d!.seat).toBe(P1);
    if (d!.kind === "yes-no") {
      await game.p1.yes();
    } else {
      await game.p1.pick("noc");
    }
    // (b) "you may play me for [rainbow]" — accept; (c) destination — must offer bf1, pick it.
    let placed = false;
    for (let i = 0; i < 6 && !placed; i++) {
      d = game.decision();
      if (!d || d.seat !== P1 || d.kind === "action") {
        break;
      }
      if (d.kind === "yes-no") {
        await game.p1.yes();
        continue;
      }
      if (d.kind === "pick") {
        const bf1 = d.options.find((o) => /bf1/.test(`${o.key} ${o.zone ?? ""} ${o.label}`));
        if (bf1) {
          expect(d.options.length).toBeGreaterThan(1); // a real choice: base is offered too
          await game.p1.answer({ keys: [bf1.key], kind: "pick" });
          placed = true;
        } else {
          await game.p1.pick(d.options[0]!.key);
        }
      }
    }
    expect(placed).toBe(true);
    // rule 464.2.c.3.a — the designation is picked up AT arrival, while the combat is still open.
    expect(game.state("noc").combatRole).toBe("defender");
    await game.settle({ maxSteps: 20 });
    expect(game.zoneOf("noc")).toBe("battlefield-bf1");
    expect(game.p1.power("rainbow")).toBe(0); // played "for [rainbow]" — not its printed [4][chaos]
    expect(game.p1.energy()).toBe(0);
    // rule 466 — the combat has since ended, so the designation is gone but the battlefield stands.
    expect(game.state("noc").meta.combatRoleAt).toBe("bf1");
    expect(game.p1.banishment()).not.toContain("noc");
  });
});
