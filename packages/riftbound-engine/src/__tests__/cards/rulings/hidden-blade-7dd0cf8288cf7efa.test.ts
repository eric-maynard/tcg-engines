/**
 * Ruling 7dd0cf8288cf7efa — Hidden Blade (OGN-213 → ogn-213-298) · Spell · Order · [2][order] · Action · [Hidden]
 *     "Kill a unit at a battlefield. Its controller draws 2."
 *   × Immortal Phoenix (OGN-037 → ogn-037-298) · 3 Might ·
 *     "When you kill a unit with a spell, you may pay [1][fury] to play me from your trash."
 *
 * Q: Hidden Blade kills my own Phoenix and draws me 2 — can the Phoenix's ability then bring it back from the trash?
 * A: Yes. Hidden Blade must resolve completely first (the kill AND the draw); only then is the death trigger put on
 *    the chain. Paying [1][fury] plays the Phoenix out of the trash.
 * Rules: 321/337.1 (nothing is put on the chain in the middle of a resolution — triggers wait until it finishes),
 *        383.3.a/402 (the "you may pay" cost is settled at Finalization), 419.3 (an effect that plays a card).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const IMMORTAL_PHOENIX = "ogn-037-298";

/** P1's turn with [3][order][fury] — enough for Hidden Blade ([2][order]) and the Phoenix's [1][fury] rebuy.
 *  P1 holds bf1 with the Phoenix and a Holder (so control does not lapse when the Phoenix dies). */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { fury: 1, order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", IMMORTAL_PHOENIX, "phoenix")
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .hand(P1, HIDDEN_BLADE, "blade");
}

describe("Ruling 7dd0cf8288cf7efa — the Phoenix's trigger waits for Hidden Blade to finish, then replays it from the trash", () => {
  test("ruling: Hidden Blade resolves in full first — the Phoenix is in the trash AND P1 has drawn 2 — and only then is the death trigger on the chain", async () => {
    const game = await board().build();
    const deck = game.p1.deck().length;
    await game.p1.cast("blade", { targets: "phoenix" });
    await game.settle();
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(game.p1.deck()).toHaveLength(deck - 2); // "Its controller draws 2" — the caster is the controller here
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "phoenix", triggered: true })]);
  });

  test("ruling: the trigger's cost is offered to P1 as a 'you may pay [1][fury]' — declining leaves the Phoenix in the trash and pays nothing", async () => {
    const game = await board().build();
    await game.p1.cast("blade", { targets: "phoenix" });
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, timing: "FIN" });
    expect(game.decision()?.prompt).toContain("[1][fury]");
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("phoenix")).toBe("trash");
    expect(game.p1.power("fury")).toBe(1);
  });

  test("ruling: paying it plays the Phoenix out of the trash — it comes back onto the board (exhausted, as any played unit)", async () => {
    const game = await board().build();
    await game.p1.cast("blade", { targets: "phoenix" });
    await game.settle();
    await game.p1.yes();
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    expect(game.zoneOf("phoenix")).toBe("battlefield-bf1");
    expect(game.state("phoenix")).toMatchObject({ baseMight: 3, controller: P1, isExhausted: true });
    expect(game.p1.power("fury")).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
