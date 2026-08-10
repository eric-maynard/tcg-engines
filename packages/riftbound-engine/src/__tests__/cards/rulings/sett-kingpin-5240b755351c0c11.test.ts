/**
 * Ruling 5240b755351c0c11 — Sett, Kingpin (OGN-240 → ogn-240-298) · Unit · [4][order] · 5 Might · Tank
 *   × Arena Bar (OGN-124 → ogn-124-298) · Gear "[Exhaust]: Buff an exhausted friendly unit."
 *
 * Q: I play Sett, Kingpin to base and buff it with Arena Bar — can my opponent play an Action card during that?
 * A: No. Playing the unit and activating the ability each create a chain (Closed State); only [Reaction] cards/abilities can be
 *    played onto a chain. The opponent may respond only with Reactions until the chain is empty.
 * Rules: 309.1/309.1.a (chain ⇒ Closed State; Reactions only), 331.1, 419.1 + 359.2 (a unit is played via the chain but leaves
 *        it as soon as it is finalized), 377.3 (activated abilities use the chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SETT_KINGPIN = "ogn-240-298";
const ARENA_BAR = "ogn-124-298";
const RUNE_PRISON = "ogn-050-298"; // P2's Action: "Stun a unit."
const STUPEFY = "ogn-095-298"; // P2's Reaction: "Give a unit -1 [Might] this turn… Draw 1."

/** P1's turn. P1: Sett in hand + exactly [4][order], ready Arena Bar, a Pal in base. P2: Rune Prison (Action) + Stupefy (Reaction), plenty of resources. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { order: 1 } })
    .resources(P2, { energy: 5, power: { calm: 2 } })
    .battlefield("bf1", { controller: P2 })
    .gear(P1, ARENA_BAR, "bar")
    .unit(P1, "base", { might: 2, name: "Pal" }, "pal")
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .hand(P1, SETT_KINGPIN, "sett")
    .hand(P2, RUNE_PRISON, "prison")
    .hand(P2, STUPEFY, "stupefy");
}

async function p2Window(game: Game): Promise<void> {
  if (game.actingSeat() === P1) {
    await game.p1.passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
}

describe("Ruling 5240b755351c0c11 — no Action cards for the opponent while Sett's play / Arena Bar's activation is on the chain", () => {
  test("playing Sett, Kingpin: the play closes the state, and as a permanent with no play trigger he leaves the chain the moment he is finalized (359.2) — P2 never even gets a window, so certainly no Action (Rune Prison stays in hand)", async () => {
    const game = await board().build();
    await game.p1.play("sett");
    expect(game.zoneOf("sett")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.can("cast", "prison")).toBe(false);
    expect((await game.p2.try((p) => p.cast("prison", { targets: "pal" }))).ok).toBe(false);
    expect(game.zoneOf("prison")).toBe("hand");
  });

  test("activating Arena Bar on the (exhausted) Sett creates a chain (Closed State): in P2's response window Rune Prison (Action) is NOT legal, Stupefy (Reaction) is; the buff lands on resolution (5 → 6)", async () => {
    const game = await board().build();
    await game.p1.play("sett");
    await game.settle();
    expect(game.state("sett")).toMatchObject({ isExhausted: true, location: "base", might: 5 });
    const asksNow = game.p1.option("activate", "bar")?.fields.some((f) => f.name === "targets") === true;
    await game.p1.activate("bar", 0, asksNow ? { targets: "sett" } : { answers: ["sett"] });
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("sett");
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bar", controller: P1 })]);
    expect(game.state("bar").isExhausted).toBe(true);
    await p2Window(game);
    expect(game.p2.can("cast", "prison")).toBe(false);
    expect(game.p2.can("cast", "stupefy")).toBe(true);
    await game.settle();
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("sett");
      await game.settle();
    }
    expect(game.state("sett")).toMatchObject({ isBuffed: true, might: 6 });
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
