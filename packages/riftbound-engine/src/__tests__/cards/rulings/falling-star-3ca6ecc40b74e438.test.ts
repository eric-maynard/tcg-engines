/**
 * Ruling 3ca6ecc40b74e438 — Falling Star (OGN-029 → ogn-029-298) · Spell · [2][fury][fury] · "Deal 3 to a unit. Deal 3 to a unit."
 *   × Jax, Unmatched (SFD-054 → sfd-054-221) · 5 Might · "[Deflect] Your Equipment everywhere have [Quick-Draw]. (Each gains
 *     [Reaction]. When you play it, attach it to a unit you control.)"
 *   Equipment used: Doran's Blade (sfd-095-221) · [2] · +2 Might · "[Equip] [body]".
 *
 * Q: Can Jax's Quick-Draw be used against Falling Star to raise a unit's Might while it is on the chain?
 * A: Yes. With Falling Star on the chain (Closed state) you may play an Equipment from hand at Reaction speed; the gear
 *    enters play, its Quick-Draw "when you play it, attach it" trigger goes on the chain above Falling Star and resolves
 *    first (LIFO), attaching it — the Might bonus is live before Falling Star resolves, so a unit pushed above 3 survives.
 * Rules: 819.1 (Quick-Draw: triggered + Reaction; play & attach at Reaction timing), 819.1.d, 136/718.4 (Might bonus while
 *        attached), 336–340 (Closed state, Reaction timing, LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FALLING_STAR = "ogn-029-298";
const JAX_UNMATCHED = "sfd-054-221";
const DORANS_BLADE = "sfd-095-221";

/**
 * P2's turn with exactly [2][fury][fury]. P1: Jax (5), Squire (2), Other (3) in base; Doran's Blade in HAND; exactly [2].
 * P2 aims 3 at the Squire and 3 at Other (Jax's Deflect keeps him out of it for free).
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 2, power: { fury: 2 } })
    .unit(P1, "base", JAX_UNMATCHED, "jax")
    .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
    .unit(P1, "base", { might: 3, name: "Other" }, "other")
    .hand(P1, DORANS_BLADE, "blade")
    .hand(P2, FALLING_STAR, "star");
}

/** P2 casts Falling Star (Squire, Other) and passes → P1 holds priority with the spell on the chain. */
async function starOnTheChain(): Promise<Game> {
  const game = await board().build();
  expect(game.state("blade").keywords).toContain("Quick-Draw"); // "everywhere": granted in hand
  await game.p2.cast("star", { targets: ["squire", "other"] });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

/** P1 plays the Blade at Reaction speed, naming the Squire for the attach. */
async function quickDrawOntoSquire(game: Game): Promise<void> {
  const opt = game.p1.legal().find((o) => o.card === "blade" && (o.verb === "equip" || o.verb === "play"));
  expect(opt).toBeDefined();
  await game.p1.choose(opt!.key, {}, { answers: ["squire"] });
  expect(game.p1.energy()).toBe(0); // paid the Blade's [2]; no [Equip] cost
}

describe("Ruling 3ca6ecc40b74e438 — Quick-Draw an Equipment in response to Falling Star to out-grow the 3 damage", () => {
  test("steps 1–4: with Falling Star on the chain (Closed state) P1 — thanks to Jax — is offered playing Doran's Blade from hand as a Reaction; without Jax there is no such option", async () => {
    const game = await starOnTheChain();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "star", controller: P2, targets: ["squire", "other"] })]);
    expect(game.p1.legal().some((o) => o.card === "blade")).toBe(true);

    const noJax = await scenario()
      .active(P2)
      .resources(P1, { energy: 2 })
      .resources(P2, { energy: 2, power: { fury: 2 } })
      .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
      .unit(P1, "base", { might: 3, name: "Other" }, "other")
      .hand(P1, DORANS_BLADE, "blade")
      .hand(P2, FALLING_STAR, "star")
      .build();
    await noJax.p2.cast("star", { targets: ["squire", "other"] });
    await noJax.p2.passPriority();
    expect(noJax.p1.legal().some((o) => o.card === "blade")).toBe(false);
  });

  test("steps 5–7 + resolution: the Blade is attached to the Squire (2 + 2 = 4) BEFORE Falling Star resolves; Falling Star then deals its 3s — the Squire survives with 3 damage, the un-helped Other (3) dies", async () => {
    const game = await starOnTheChain();
    await quickDrawOntoSquire(game);
    // Drive any attach prompt / trigger resolution, stopping while Falling Star is still the bottom link.
    for (let i = 0; i < 6; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        await game.p1.pick("squire");
      } else if (game.chain().length > 1 && d?.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else {
        break;
      }
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["star"]); // Falling Star has not resolved yet …
    expect(game.state("blade").attachedTo).toBe("squire"); // … and the bonus is already live
    expect(game.state("squire").might).toBe(4);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("star")).toBe("trash");
    expect(game.zoneOf("squire")).toBe("base");
    expect(game.state("squire")).toMatchObject({ attachments: ["blade"], damage: 3, might: 4 });
    expect(game.zoneOf("other")).toBe("trash");
    expect(game.state("jax").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  // 819.1 "Quick-Draw is a Triggered Ability keyword" (ruling step 6): after the Blade is played it is on the board UNATTACHED
  // and its "When you play it, attach it to a unit you control" trigger is a new chain link ABOVE Falling Star; only when that
  // link resolves (first, LIFO) does the Blade attach.
  // The engine instead attaches synchronously inside the play pipeline (playPermanent's Quick-Draw branch),
  // so the chain never grows past Falling Star and the interposed reaction window is missing. The observable
  // end state (attached, Squire 4, before Falling Star resolves) is already correct — see the test above.
  test("step 6: the Quick-Draw attach is its own chain link ABOVE Falling Star — Blade unattached (Squire 2) until it resolves first (LIFO), then attached (Squire 4) with Falling Star still waiting", async () => {
    const game = await starOnTheChain();
    await quickDrawOntoSquire(game);
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("squire");
    }
    expect(game.chain()).toHaveLength(2);
    expect(game.chain()[0]).toMatchObject({ cardId: "star" });
    expect(game.chain()[1]).toMatchObject({ cardId: "blade", controller: P1, triggered: true });
    expect(game.state("blade").attachedTo).toBeUndefined();
    expect(game.state("squire").might).toBe(2);
    // LIFO: the trigger resolves first → attached, 4 Might; Falling Star still waiting.
    await game.acting().pass();
    await game.acting().pass();
    expect(game.state("blade").attachedTo).toBe("squire");
    expect(game.state("squire").might).toBe(4);
    expect(game.chain().map((c) => c.cardId)).toEqual(["star"]);
  });

  test("control: if P1 just passes, Falling Star kills both the 2-Might Squire and the 3-Might Other", async () => {
    const game = await starOnTheChain();
    await game.p1.passPriority();
    await game.settle();
    expect(game.zoneOf("squire")).toBe("trash");
    expect(game.zoneOf("other")).toBe("trash");
    expect(game.zoneOf("blade")).toBe("hand");
  });
});
