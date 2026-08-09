/**
 * Grandmaster at Arms — sfd-193-221 · Legend (Jax) · Calm/Body
 *
 *   [1], [Exhaust]: Attach a detached Equipment you control to a unit you control.
 *   [Exhaust]: Attach an attached Equipment you control to a unit you control.
 *
 * Rules: 174.8 / 377.3 (legend activated abilities use the chain: pay costs on activation, effect
 * on resolution), 381 (only on your turn in an Open State), 402.2 (targets are chosen as the ability
 * is activated) + 402.3 (no legal options → not legal to activate), 434 (Attach: the instruction
 * itself attaches — this is NOT the Equipment's [Equip] ability, so no Equip cost is paid), 434.1.d
 * / 718.4 (Might Bonus follows the attachment), 434.1.f (attaching to a new unit detaches from the
 * old one), 434.4 (an attached card's location becomes the holder's), 435.1.e (the old holder loses
 * the bonus).
 *
 * Head-judge notes — the tricky situations for THIS card:
 *  1. Ability #0 is a cost dodge: B.F. Sword ([Equip] [order]) goes onto a unit for [1] generic
 *     energy and zero order power.
 *  2. Both abilities share the single [Exhaust] — one use per turn total; the legend readies at
 *     your next Awaken.
 *  3. Choices: with two detached Equipment or two friendly units the controller must CHOOSE which
 *     (402.2) — the engine may not silently pick the first.
 *  4. Legality: no detached (resp. attached) Equipment you control → the ability cannot even be
 *     activated (402.3); enemy Equipment / enemy units never qualify.
 *  5. Ability #1 hot-swaps a worn sword from a unit at a battlefield to a unit in base: the +3 moves
 *     with it and so does the card's location (434.4) — the old holder drops back to base Might.
 *  6. Timing: nothing on the opponent's turn; nothing while a chain is open.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-193-221";
const BF_SWORD = "sfd-161-221"; // Equipment, +3, [Equip] [order]
const DIRK = "sfd-009-221"; // Serrated Dirk — Equipment, [Equip] [fury]
const FALLING_COMET = "ogn-085-298"; // [Action] 5: deal 6 to a unit at a battlefield (opens a chain)

/** Activate ability `idx`, answering any target prompts with the ids in `wanted` (in order), then settle. */
async function activateChoosing(game: Game, idx: number, wanted: string[]): Promise<void> {
  const field = game.p1.option(`activateAbility:jax#${idx}`)?.fields.some((f) => f.arg === "targets");
  await game.p1.activate("jax", idx, field ? { targets: wanted } : { answers: wanted });
  for (let i = 0; i < 4; i++) {
    const r = await game.settle();
    const d = game.decision();
    if (r.reason !== "unanswered" || d?.kind !== "pick") {
      return;
    }
    const hit = d.options.find((o) => wanted.includes(o.card ?? o.key));
    await game.seat(d.seat).pick(hit ? hit.key : (d.options[0]?.key as string));
  }
}

function swordInBase(energy = 1) {
  return scenario()
    .resources(P1, { energy })
    .legend(P1, CARD, "jax")
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Duelist" }, "duelist")
    .unit(P2, "base", { might: 3, name: "Enemy" }, "enemy")
    .gear(P1, BF_SWORD, "sword");
}

/** Sword already worn by `holder` at bf1; a second friendly unit `page` in base. */
function swordWorn() {
  return scenario()
    .legend(P1, CARD, "jax")
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder", { equippedWith: ["sword"] })
    .unit(P1, "base", { might: 2, name: "Page" }, "page")
    .card("sword", { def: BF_SWORD, meta: { attachedTo: "holder" }, owner: P1, zone: "bf1" });
}

describe("Grandmaster at Arms (sfd-193-221)", () => {
  test("registry payload: two activated abilities — ([1]+Exhaust: attach DETACHED friendly Equipment) and (Exhaust: attach ATTACHED friendly Equipment), both to a friendly unit", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", championTag: "Jax", name: "Grandmaster at Arms" });
    expect(def?.abilities).toEqual([
      {
        cost: { energy: 1, exhaust: true },
        effect: { equipment: { controller: "friendly", filter: "detached", type: "equipment" }, to: { controller: "friendly", type: "unit" }, type: "attach" },
        type: "activated",
      },
      {
        cost: { exhaust: true },
        effect: { equipment: { controller: "friendly", filter: "attached", type: "equipment" }, to: { controller: "friendly", type: "unit" }, type: "attach" },
        type: "activated",
      },
    ]);
  });

  test("#0: pays [1] + exhausts, goes on the chain, and on resolution attaches B.F. Sword WITHOUT its [order] Equip cost (+3 Might, sword now at the unit's battlefield)", async () => {
    const game = await swordInBase(1).build();
    expect(game.p1.power("order")).toBe(0);
    await game.p1.activate("jax", 0);
    expect(game.p1.energy()).toBe(0);
    expect(game.state("jax").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "jax", controller: P1, triggered: false })]);
    expect(game.state("sword").attachedTo).toBeUndefined(); // not before resolution
    await game.settle();
    expect(game.state("sword").attachedTo).toBe("duelist");
    expect(game.state("duelist")).toMatchObject({ attachments: ["sword"], baseMight: 2, might: 5 });
    expect(game.locationOf("sword")).toBe("bf1"); // 434.4
    expect(game.state("enemy").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });

  test("#0 cost negative space: with 0 energy ability #0 is not offered (the [1] is mandatory)", async () => {
    const game = await swordInBase(0).build();
    expect(game.p1.can("activateAbility:jax#0")).toBe(false);
    const r = await game.p1.try((p) => p.activate("jax", 0));
    expect(r.ok).toBe(false);
    expect(game.state("jax").isReady).toBe(true);
  });

  test("#1: [Exhaust] only (no energy) hot-swaps the worn sword from Holder@bf1 to Page@base — bonus and location follow (434.1.f / 434.4 / 435.1.e)", async () => {
    const game = await swordWorn().build();
    expect(game.state("holder").might).toBe(6);
    expect(game.locationOf("sword")).toBe("bf1");
    await activateChoosing(game, 1, ["sword", "page"]);
    expect(game.p1.energy()).toBe(0);
    expect(game.state("jax").isExhausted).toBe(true);
    expect(game.state("sword").attachedTo).toBe("page");
    expect(game.state("page")).toMatchObject({ attachments: ["sword"], might: 5 });
    expect(game.state("holder")).toMatchObject({ attachments: [], might: 3 });
    expect(game.locationOf("sword")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("one [Exhaust] shared by both abilities: after #0 resolves, neither #0 nor #1 is legal this turn; the legend readies at your next Awaken", async () => {
    const game = await swordInBase(3).unit(P1, "base", { might: 1, name: "Squire" }, "squire").build();
    await activateChoosing(game, 0, ["sword", "duelist"]);
    expect(game.state("sword").attachedTo).toBeDefined();
    expect(game.p1.can("activateAbility:jax#0")).toBe(false);
    expect(game.p1.can("activateAbility:jax#1")).toBe(false); // an attached Equipment now exists, but the legend is spent
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("jax").isReady).toBe(true);
    expect(game.p1.can("activateAbility:jax#1")).toBe(true);
  });

  test("timing (381): nothing is offered on the opponent's turn, nor while a chain is open", async () => {
    const opp = await swordInBase(2).active(P2).build();
    expect(opp.p1.legal().some((o) => o.key.startsWith("activateAbility:jax"))).toBe(false);

    const closed = await swordInBase(7).battlefield("bf2", { controller: P2 }).unit(P2, "bf2", { might: 9 }, "wall").hand(P1, FALLING_COMET, "comet").build();
    await closed.p1.cast("comet", { targets: "wall" });
    expect(closed.chain()).toHaveLength(1);
    expect(closed.p1.can("activateAbility:jax#0")).toBe(false);
    await closed.settle();
    expect(closed.p1.can("activateAbility:jax#0")).toBe(true);
  });

  test("'you control': an opponent's detached Equipment is never attached to your unit by #0", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .legend(P1, CARD, "jax")
      .unit(P1, "base", { might: 2 }, "mine")
      .gear(P2, BF_SWORD, "theirSword")
      .build();
    if (game.p1.can("activateAbility:jax#0")) {
      await activateChoosing(game, 0, ["theirSword", "mine"]);
    }
    expect(game.state("theirSword").attachedTo).toBeUndefined();
    expect(game.state("mine").might).toBe(2);
  });

  test("#0 with two friendly units must let the controller choose the holder (402.2) — the engine auto-attaches to the first unit", async () => {
    // Expected: a target choice (at activation or resolution) between squire and duelist; choosing
    // duelist puts the sword on duelist. Actual: no prompt, sword lands on the base unit.
    const game = await swordInBase(1).unit(P1, "base", { might: 1, name: "Squire" }, "squire").build();
    await activateChoosing(game, 0, ["sword", "duelist"]);
    expect(game.state("sword").attachedTo).toBe("duelist");
    expect(game.state("duelist").might).toBe(5);
    expect(game.state("squire").might).toBe(1);
  });

  test("#0 with two detached Equipment must let the controller choose which one (402.2) — the engine picks the first", async () => {
    // Expected: choosing Serrated Dirk attaches the dirk and leaves B.F. Sword in base. Actual: no
    // choice is offered and the sword is attached.
    const game = await swordInBase(1).gear(P1, DIRK, "dirk").build();
    await activateChoosing(game, 0, ["dirk", "duelist"]);
    expect(game.state("dirk").attachedTo).toBe("duelist");
    expect(game.state("sword").attachedTo).toBeUndefined();
  });

  test("#1 must let the controller choose the destination among several friendly units (402.2) — the engine moves it to the first other unit", async () => {
    // Expected: with Page (base) and Sentinel (bf1) available, choosing Sentinel re-hangs the sword
    // on Sentinel at bf1. Actual: no prompt; the sword goes to Page.
    const game = await swordWorn().unit(P1, "bf1", { might: 1, name: "Sentinel" }, "sentinel").build();
    await activateChoosing(game, 1, ["sword", "sentinel"]);
    expect(game.state("sword").attachedTo).toBe("sentinel");
    expect(game.state("sentinel").might).toBe(4);
    expect(game.state("page").might).toBe(2);
  });

  test("#0 is not legal to activate when you control no detached Equipment (402.3) — the engine still offers it (and would eat [1] + the exhaust)", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).legend(P1, CARD, "jax").unit(P1, "base", { might: 2 }, "mine").build();
    expect(game.p1.can("activateAbility:jax#0")).toBe(false);
  });

  test("#1 is not legal to activate when you control no ATTACHED Equipment (402.3) — the engine still offers it", async () => {
    const game = await swordInBase(0).build(); // sword is detached, nothing is attached
    expect(game.p1.can("activateAbility:jax#1")).toBe(false);
  });
});
