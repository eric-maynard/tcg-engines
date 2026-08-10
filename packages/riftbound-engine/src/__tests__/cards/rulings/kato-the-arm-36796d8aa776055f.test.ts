/**
 * Ruling 36796d8aa776055f — Kato the Arm (SFD-112 → sfd-112-221) · Unit · Body · [4][body] · 3 Might
 *     "[Deflect] When I move to a battlefield, give another friendly unit my keywords and +[Might] equal to my Might this turn."
 *   × Inferna (unl-002-219) · 1 Might · "[Ambush] (You may play me as a [Reaction] to a battlefield where you have units.)"
 *
 * Q: Move Kato to a battlefield, then Ambush a unit in there — can the Ambush unit receive Kato's +Might/keywords?
 * A: No. The trigger's target is chosen as it is put on the chain (finalized) — BEFORE anyone may react; only then can
 *    the Ambush unit be played. It enters, then Kato's ability resolves on the previously chosen unit. Nuance: with no
 *    other friendly unit at all, the trigger is removed at once (402.3) for lack of a legal choice.
 * Rules: 383.3 / 402.2 (triggered items choose targets when finalized), 822 (Ambush = Reaction play), 402.3/402.4.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KATO = "sfd-112-221";
const INFERNA = "unl-002-219";

type PickD = Extract<Decision, { kind: "pick" }>;

/** P1's turn. P1 holds bf1 with Holder (1); Kato (3) + Buddy (2) in base; Inferna in hand with [2]. P2 idle. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 2, name: "Foe" }, "foe")
    .unit(P1, "base", KATO, "kato")
    .unit(P1, "base", { might: 2, name: "Buddy" }, "buddy")
    .hand(P1, INFERNA, "inferna");
}

/** Kato walks to bf1; the trigger's target prompt is answered with Holder. Returns with the item finalized on the chain. */
async function moveKatoAndTargetHolder(): Promise<{ game: Game; offered: string[] }> {
  const game = await board().build();
  await game.p1.move("kato", "bf1");
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  const offered = (d as PickD).options.map((o) => o.card ?? o.key).sort();
  await game.p1.pick("holder");
  return { game, offered };
}

describe("Ruling 36796d8aa776055f — Kato's move trigger picks its target before the Ambush unit can be played", () => {
  test("moving Kato to bf1 asks P1 for the target AT ONCE (finalization, timing FIN) — the options are the friendly units already on the board (Holder, Buddy); Inferna in hand is not one", async () => {
    const { game, offered } = await moveKatoAndTargetHolder();
    expect(offered).toEqual(["buddy", "holder"]);
    expect(offered).not.toContain("inferna");
    expect(offered).not.toContain("kato");
    // The ability is now a finalized chain item bound to Holder, and only NOW does P1 hold priority.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kato", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.zoneOf("inferna")).toBe("hand");
  });

  test("the target prompt comes before any reaction window: while it is open P1 has no way to play Inferna", async () => {
    const game = await board().build();
    await game.p1.move("kato", "bf1");
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    expect((d as PickD).timing).toBe("FIN");
    expect(game.p1.can("play", "inferna")).toBe(false);
  });

  test("with the item on the chain P1 may Ambush Inferna into bf1 as a Reaction; it enters, then Kato's ability resolves on HOLDER (+3 → 4) — Inferna stays a plain 1-Might unit with no Deflect", async () => {
    const { game } = await moveKatoAndTargetHolder();
    expect(game.p1.can("play", "inferna")).toBe(true);
    await game.p1.play("inferna", { to: "bf1" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("inferna")).toBe("battlefield-bf1");
    expect(game.state("holder")).toMatchObject({ might: 4, mightModifier: 3 });
    expect(game.state("holder").keywords).toContain("Deflect");
    expect(game.state("inferna")).toMatchObject({ might: 1, mightModifier: 0 });
    expect(game.state("inferna").grantedKeywords).toEqual([]);
    expect(game.state("inferna").keywords).not.toContain("Deflect");
    expect(game.state("buddy").might).toBe(2);
    expect(game.state("kato").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });

  test("nuance (402.3): with NO other friendly unit on the board the trigger is removed immediately — nothing on the chain, no prompt", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: null })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 2, name: "Foe" }, "foe")
      .unit(P1, "base", KATO, "kato")
      .hand(P1, INFERNA, "inferna")
      .build();
    await game.p1.move("kato", "bf1");
    expect(game.chain()).toEqual([]);
    const d = game.decision();
    expect(d?.kind === "pick").toBe(false);
    await game.settle();
    expect(game.zoneOf("kato")).toBe("battlefield-bf1");
    expect(game.state("kato").might).toBe(3);
    expect(game.state("foe").might).toBe(2);
  });
});
