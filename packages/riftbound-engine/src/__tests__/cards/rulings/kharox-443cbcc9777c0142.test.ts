/**
 * Ruling 443cbcc9777c0142 — Kharox (VEN-114 → ven-114-166) · Unit · Chaos · 6 · 5 Might
 *   "[Empower] [6][chaos][chaos] (Empower me. Use only if not Empowered.) When I become [Empowered], choose an
 *    opponent. They [Burn 3]. Then you may do this: Choose a unit in their trash and play it, ignoring its cost."
 *   × Tornado Warrior (VEN-099 → ven-099-166) · [Hidden] · "When you play me from face down, you may empower
 *     something here. Disempower it at end of turn."
 *   × Windsinger (SFD-138 → sfd-138-221) · [Hidden] unit with no empower text (control case).
 *
 * Q: Kharox and a hidden Tornado Warrior share my battlefield; I reveal the Warrior to empower Kharox — may I
 *    play the unit from the opponent's trash to that battlefield?
 * A: Revealing a hidden card does not by itself empower Kharox — only Kharox's own [Empower] cost or a card
 *    whose ability empowers it does. Once Kharox IS empowered its trigger fires: the opponent Burns 3, then you
 *    may play a unit from their trash following normal play rules — to your base OR a battlefield you control,
 *    so the battlefield Kharox is standing on is a legal destination.
 * Rules: 827.1.c / 827.1.c.1 (Empower keyword + "when I become Empowered"), 440.1 (Burn), 419.3 (where a
 *        played unit may go), 811.1.c.3 (playing a hidden card).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KHAROX = "ven-114-166";
const TORNADO_WARRIOR = "ven-099-166";
const WINDSINGER = "sfd-138-221";

const DEAD_GUY = { cardType: "unit", energyCost: 3, might: 3, name: "Dead Guy" } as const;

/** Resolve exactly the top chain item: every seat passes priority once. */
async function resolveTop(game: Game): Promise<void> {
  const top = game.chain().at(-1)?.id;
  for (let i = 0; i < 4 && top !== undefined && game.chain().at(-1)?.id === top; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      return;
    }
  }
}

/** P1's turn; P1 controls bf1 with Kharox there and a hidden card at bf1. P2's trash holds a unit and a spell. */
function board(hidden: string) {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", KHAROX, "kharox")
    .facedown(P1, "bf1", hidden, "hidden")
    .trash(P2, DEAD_GUY, "deadguy")
    .trash(P2, { cardType: "spell", energyCost: 1, name: "Dead Spell" }, "deadspell")
    .fillDecks({ main: 5, runes: 12 });
}

describe("Ruling 443cbcc9777c0142 — Kharox is empowered only by an empowering effect; its trigger may play the stolen unit to Kharox's battlefield", () => {
  test("control: revealing a hidden card with NO empower text (Windsinger) at Kharox's battlefield does not empower Kharox and nothing is burned", async () => {
    const game = await board(WINDSINGER).build();
    expect(game.state("kharox").isEmpowered).toBe(false);
    await game.p1.reveal("hidden");
    // Windsinger's own "you may return a unit" — decline it if asked.
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1) {
        await game.p1.no();
      } else if (d?.kind === "pick" && d.seat === P1 && d.allowDecline) {
        await game.p1.decline();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.zoneOf("hidden")).toBe("battlefield-bf1");
    expect(game.state("kharox").isEmpowered).toBe(false);
    expect(game.p2.trash().toSorted()).toEqual(["deadguy", "deadspell"]); // no Burn 3
    expect(game.zoneOf("deadguy")).toBe("trash");
  });

  test("Kharox's own [Empower] costs [6][chaos][chaos]: unaffordable without it, and paying it empowers Kharox and fires the Burn-3 trigger", async () => {
    const poor = await board(WINDSINGER).resources(P1, { energy: 6, power: { chaos: 1 } }).build();
    expect(poor.p1.can("activate", "kharox")).toBe(false);
    const game = await board(WINDSINGER).resources(P1, { energy: 6, power: { chaos: 2 } }).build();
    expect(game.p1.can("activate", "kharox")).toBe(true);
    await game.p1.activate("kharox");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await resolveTop(game); // Empower resolves
    expect(game.state("kharox").isEmpowered).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kharox", controller: P1, triggered: true })]);
    await resolveTop(game); // trigger resolves: P2 burns 3, then P1 may pick a unit from P2's trash
    expect(game.p2.trash()).toHaveLength(5); // 2 + Burn 3
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("deadguy");
    await game.p1.pick("base");
    await game.settle();
    expect(game.zoneOf("deadguy")).toBe("base");
    expect(game.state("deadguy").controller).toBe(P1);
    // Once empowered, the ability can't be used again ("Use only if not Empowered").
    expect(game.state("kharox").isEmpowered).toBe(true);
    expect(game.p1.can("activate", "kharox")).toBe(false);
  });

  // rule 359.3.e.6: "Then you MAY do this: Choose a unit in their trash and play it" — the "you may" makes the
  // trash pick declinable even though the trash is a public zone.
  test("ruling 443cbcc9777c0142 — the 'you may … play it' trash pick is declinable", async () => {
    const game = await board(WINDSINGER).resources(P1, { energy: 6, power: { chaos: 2 } }).build();
    await game.p1.activate("kharox");
    await resolveTop(game);
    await resolveTop(game);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.allowDecline : undefined).toBe(true);
    await game.p1.decline();
    await game.settle();
    expect(game.zoneOf("deadguy")).toBe("trash");
    expect(game.state("kharox").isEmpowered).toBe(true);
  });

  test("the asked scenario: revealing Tornado Warrior and choosing Kharax as the 'something here' empowers Kharox → P2 Burns 3 → P1 may play Dead Guy from P2's trash, and bf1 (where Kharox is) is a legal destination alongside base", async () => {
    const game = await board(TORNADO_WARRIOR).build();
    expect(game.p1.can("reveal", "hidden")).toBe(true);
    await game.p1.reveal("hidden");
    // Tornado Warrior: "you MAY empower something here" — P1 opts in and picks Kharox.
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    const pickTarget = game.decision();
    expect(pickTarget).toMatchObject({ kind: "pick", seat: P1 });
    expect(pickTarget?.kind === "pick" ? pickTarget.options.map((o) => o.card ?? o.key) : []).toContain("kharox");
    await game.p1.pick("kharox");
    expect(game.state("kharox").isEmpowered).toBe(false); // still on the chain
    await resolveTop(game); // Warrior's trigger resolves → Kharox empowered → Kharox's trigger goes on the chain
    expect(game.state("kharox").isEmpowered).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kharox", controller: P1, triggered: true })]);
    await resolveTop(game);
    // P2 burned 3; P1 is offered the UNITS in P2's trash (Dead Guy + burned filler units), not the spell.
    expect(game.p2.trash()).toHaveLength(5);
    const pick = game.decision();
    expect(pick).toMatchObject({ kind: "pick", seat: P1 });
    const offered = pick?.kind === "pick" ? pick.options.map((o) => o.card ?? o.key) : [];
    expect(offered).toContain("deadguy");
    expect(offered).not.toContain("deadspell");
    await game.p1.pick("deadguy");
    // Normal play rules for the destination: P1's base or a battlefield P1 controls — bf1 yes, P2's bf2 no.
    const dest = game.decision();
    expect(dest).toMatchObject({ kind: "pick", seat: P1 });
    const places = dest?.kind === "pick" ? dest.options.map((o) => o.key) : [];
    expect(places).toContain("base");
    expect(places).toContain("battlefield-bf1");
    expect(places).not.toContain("battlefield-bf2");
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    expect(game.zoneOf("deadguy")).toBe("battlefield-bf1");
    expect(game.state("deadguy").controller).toBe(P1);
    expect(game.state("deadguy").owner).toBe(P2);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // ignoring its cost
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
