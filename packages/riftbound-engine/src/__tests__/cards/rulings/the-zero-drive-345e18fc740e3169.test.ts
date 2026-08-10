/**
 * Ruling 345e18fc740e3169 — The Zero Drive (SFD-090 → sfd-090-221) · Equipment · +2 · "[Equip] [1][mind] … [3][mind], Banish this:
 *     Play all units banished with this, ignoring their costs. … [Deathknell] — Banish me." (Effect Text → the wearer's)
 *   × Baited Hook (OGN-242 → ogn-242-298) · Gear · "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 cards of
 *     your Main Deck. You may banish a unit … with Might up to 1 more than the killed unit and play it, ignoring its cost.
 *     Then recycle the rest."
 *   Wearer used: Watchful Sentry (ogn-096-298, 1 Might, "[Deathknell] — Draw 1.") so the unit has a Deathknell of its own.
 *
 * Q: Zero Drive × Baited Hook — does the banish stop the kill, and do Deathknells still trigger?
 * A: The unit IS killed by the Hook. Both the Zero-Drive-granted Deathknell (banish me) and the unit's own Deathknell go on
 *    the chain as pending items; the Hook finishes (look at 5, banish+play a unit — which resolves immediately); then the
 *    Deathknells resolve, the Drive's one banishing the dead unit FROM THE TRASH. The banish never prevents the death.
 * Rules: 428 (kill → trash), 808 (Deathknell triggers on dying), 718.3/136 (Effect Text is the wearer's ability),
 *        719.5 (wearer leaves → Equipment detaches, stays on board), 359.3.e.13 (last known Might incl. the +2), 340 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZERO_DRIVE = "sfd-090-221";
const BAITED_HOOK = "ogn-242-298";
const WATCHFUL_SENTRY = "ogn-096-298";

/**
 * P1's turn. Watchful Sentry (1 + 2 Zero Drive = 3) in base wearing The Zero Drive; Baited Hook ready; exactly [1][order].
 * Deck top→: Five(5) Four(4) Three(3) Junk(spell) Two(2) | DrawMe — the 6th card is what the Sentry's own Deathknell draws.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { order: 1 } })
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, "base", WATCHFUL_SENTRY, "sentry", { equippedWith: ["zd"] })
    .card("zd", { def: ZERO_DRIVE, meta: { attachedTo: "sentry" }, owner: P1, zone: "base" })
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .deck(
      P1,
      [
        { cardType: "unit", energyCost: 5, might: 5, name: "Five" },
        { cardType: "unit", energyCost: 4, might: 4, name: "Four" },
        { cardType: "unit", energyCost: 3, might: 3, name: "Three" },
        { cardType: "spell", energyCost: 1, name: "Junk" },
        { cardType: "unit", energyCost: 2, might: 2, name: "Two" },
        { cardType: "unit", energyCost: 2, might: 2, name: "DrawMe" },
      ],
      ["five", "four", "three", "junk", "two", "drawme"],
    );
}

/** Activate the Hook choosing the Sentry; both pass → the Hook resolves up to its look-at-5 offer. */
async function hookTheSentry(): Promise<Game> {
  const game = await board().build();
  expect(game.state("sentry")).toMatchObject({ attachments: ["zd"], baseMight: 1, might: 3 });
  await game.p1.activate("hook", 0, { targets: "sentry" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hook", targets: ["sentry"], triggered: false })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

describe("Ruling 345e18fc740e3169 — Baited Hook kills the Zero-Drive wearer; both Deathknells trigger; the Drive's banishes it from the trash afterwards", () => {
  test("steps 1–3: the Hook resolves and KILLS the equipped Sentry (→ trash, not banishment); two Deathknell items for it are pending on the chain; the Drive detached and stayed on the board", async () => {
    const game = await hookTheSentry();
    expect(game.zoneOf("sentry")).toBe("trash"); // killed — the banish did not replace or prevent the death
    expect(game.p1.banishment()).toEqual([]);
    const triggers = game.chain().filter((c) => c.cardId === "sentry" && c.triggered);
    expect(triggers).toHaveLength(2); // Zero Drive's "[Deathknell] — Banish me" + the Sentry's own "[Deathknell] — Draw 1"
    expect(game.state("zd")).toMatchObject({ attachedTo: undefined, zone: "base" });
    expect(game.zoneOf("zd")).not.toBe("trash");
  });

  test("step 4: mid-resolution the Hook still looks at the top 5 — killed unit's last known Might was 3 (1 + the Drive's 2) → ceiling 4: Four, Three, Two offered (not Five, not the spell); P1 may decline", async () => {
    const game = await hookTheSentry();
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1, semantics: "from-revealed" });
    expect((d as { options: { card?: string }[] }).options.map((o) => o.card).sort()).toEqual(["four", "three", "two"]);
  });

  test("steps 4–7: pick Four → it is played at once, ignoring cost; P1 is offered the ORDER of the two Sentry Deathknells; then they resolve — the Sentry is banished FROM THE TRASH and P1 draws 1 (DrawMe); the other looked-at cards were recycled", async () => {
    const game = await hookTheSentry();
    await game.p1.pick("four");
    expect(game.zoneOf("four")).toBe("base"); // finalized and resolved immediately (played for free: pool was empty)
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    // Two simultaneous triggers of one controller → P1 orders them (383.3.d).
    expect(game.decision()).toMatchObject({ kind: "order", seat: P1 });
    expect(game.zoneOf("sentry")).toBe("trash"); // still in the trash while its Deathknells wait
    await game.acceptTriggerOrder();
    expect(game.chain().map((c) => c.cardId)).toEqual(["sentry", "sentry"]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("sentry")).toBe("banishment"); // Zero Drive's Deathknell: banished from the trash
    expect(game.p1.banishment()).toEqual(["sentry"]);
    expect(game.p1.hand()).toEqual(["drawme"]); // the Sentry's own Deathknell drew the 6th card …
    // … because the rest were recycled to the bottom. rule 416.5 — cards recycled to the Main Deck
    // simultaneously land in an unspecified order, so assert the membership, not the sequence.
    expect(game.p1.deck().slice(-4).toSorted()).toEqual(["five", "junk", "three", "two"]);
    expect(game.state("zd")).toMatchObject({ attachedTo: undefined, zone: "base" });
    expect(game.state("hook").isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: the same Sentry WITHOUT the Drive — killed at last-known Might 1 (ceiling 2: only Two offered), one Deathknell (draw), and it stays in the trash", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { order: 1 } })
      .gear(P1, BAITED_HOOK, "hook")
      .unit(P1, "base", WATCHFUL_SENTRY, "sentry")
      .deck(
        P1,
        [
          { cardType: "unit", energyCost: 5, might: 5, name: "Five" },
          { cardType: "unit", energyCost: 4, might: 4, name: "Four" },
          { cardType: "unit", energyCost: 3, might: 3, name: "Three" },
          { cardType: "spell", energyCost: 1, name: "Junk" },
          { cardType: "unit", energyCost: 2, might: 2, name: "Two" },
          { cardType: "unit", energyCost: 2, might: 2, name: "DrawMe" },
        ],
        ["five", "four", "three", "junk", "two", "drawme"],
      )
      .build();
    await game.p1.activate("hook", 0, { targets: "sentry" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain().filter((c) => c.cardId === "sentry" && c.triggered)).toHaveLength(1);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect((d as { options: { card?: string }[] }).options.map((o) => o.card)).toEqual(["two"]);
    await game.p1.decline();
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.p1.hand()).toEqual(["drawme"]);
  });
});
