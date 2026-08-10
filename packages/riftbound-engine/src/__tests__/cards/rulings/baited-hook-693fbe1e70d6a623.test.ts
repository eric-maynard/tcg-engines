/**
 * Ruling 693fbe1e70d6a623 — Baited Hook (OGN-242 → ogn-242-298, Gear) "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 cards of your
 *     Main Deck. You may banish a unit from among them that has Might up to 1 more than the killed unit and play it, ignoring its cost. Then
 *     recycle the rest."
 *   × Ruined Rex (UNL-067 → unl-067-219, 6 Might) "[Deathknell] — Deal 4 to an enemy unit."
 *   × Karthus, Eternal (OGN-236 → ogn-236-298, 3 Might) "Your [Deathknell] effects trigger an additional time."
 *
 * Q: Baited Hook kills my Ruined Rex and the look finds Karthus, whom I play. Does Rex's Deathknell happen twice?
 * A: No — once. Karthus must already be on the board when the Deathknell trigger is CREATED. Rex dies (trigger created) while the Hook is
 *    still resolving; Karthus only enters afterwards, too late to double it.
 * Rules: 808.1.d (Deathknell), 383 / 346 (triggers created mid-resolution wait, then finalize in order), 365 (a passive applies only while
 *        its source is on the board), 359.3 (play from the look, ignoring cost).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BAITED_HOOK = "ogn-242-298";
const RUINED_REX = "unl-067-219";
const KARTHUS = "ogn-236-298";

const junk = (n: number) => ({ cardType: "spell", energyCost: 1, name: `Junk ${n}` });

/**
 * P1's turn with exactly [1][order]. P1: Baited Hook (ready) and Ruined Rex (6) in base. P2: two 9-Might Giants in base (big enough to show
 * 4 vs 8 damage). Deck top → Karthus, then four spells. With `karthusOnBoard`, Karthus instead starts in P1's base and the deck top is 5 spells.
 */
function board(karthusOnBoard = false) {
  const s = scenario()
    .resources(P1, { energy: 1, power: { order: 1 } })
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P1, "base", RUINED_REX, "rex")
    .unit(P2, "base", { might: 9, name: "Giant A" }, "giantA")
    .unit(P2, "base", { might: 9, name: "Giant B" }, "giantB");
  return karthusOnBoard
    ? s.unit(P1, "base", KARTHUS, "karthus").deck(P1, [junk(0), junk(1), junk(2), junk(3), junk(4)], ["j0", "j1", "j2", "j3", "j4"])
    : s.deck(P1, [KARTHUS, junk(1), junk(2), junk(3), junk(4)], ["karthus", "j1", "j2", "j3", "j4"]);
}

/** Activate the Hook killing Rex; both pass so it resolves up to the look-at-5 offer. */
async function hookRex(game: Game): Promise<void> {
  await game.p1.activate("hook", 0, { targets: "rex" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("rex")).toBe("trash");
}

/** Drain to P1's open main phase, sending every Deathknell "deal 4" at Giant A; returns how many times that target was asked. */
async function drainAimingAtGiantA(game: Game): Promise<number> {
  let asks = 0;
  for (let i = 0; i < 20; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "pick" && d.seat === P1 && d.options.some((o) => o.key === "giantA")) {
      asks += 1;
      await game.p1.pick("giantA");
    } else if (d.kind === "pick" && d.seat === P1 && d.options.some((o) => o.key === "karthus")) {
      await game.p1.pick("karthus");
    } else if (d.kind === "pick" && d.seat === P1 && d.allowDecline) {
      await game.p1.decline();
    } else if (d.kind === "action") {
      await game.seat(d.seat).pass();
    } else if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  await game.settle();
  return asks;
}

describe("Ruling 693fbe1e70d6a623 — Karthus found by the same Baited Hook that killed Rex does not double Rex's Deathknell", () => {
  test("Hook resolves: Rex is killed and its Deathknell trigger is created (ONE Rex item) while Karthus is still just a card being offered from the look — not on the board", async () => {
    const game = await board().build();
    await hookRex(game);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.key) : []).toContain("karthus"); // 3 Might ≤ 6 + 1
    expect(game.chain().filter((c) => c.cardId === "rex" && c.triggered)).toHaveLength(1);
    expect(["mainDeck", "banishment"]).toContain(game.zoneOf("karthus")); // not in play when the trigger was created
  });

  test("P1 plays Karthus off the Hook (free); he reaches the board, yet Rex's Deathknell still resolves exactly ONCE: Giant A takes 4, is asked for once, and no second Rex item ever appears", async () => {
    const game = await board().build();
    await hookRex(game);
    let maxRexItems = 0;
    let asks = 0;
    for (let i = 0; i < 20; i++) {
      maxRexItems = Math.max(maxRexItems, game.chain().filter((c) => c.cardId === "rex" && c.triggered).length);
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "pick" && d.seat === P1 && d.options.some((o) => o.key === "karthus")) {
        await game.p1.pick("karthus");
      } else if (d.kind === "pick" && d.seat === P1 && d.options.some((o) => o.key === "giantA")) {
        asks += 1;
        await game.p1.pick("giantA");
      } else if (d.kind === "action") {
        await game.seat(d.seat).pass();
      } else if (d.kind === "order" && d.defaultable) {
        await game.acceptTriggerOrder();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.zoneOf("karthus")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } }); // Karthus ignored his cost
    expect(maxRexItems).toBe(1);
    expect(asks).toBe(1);
    expect(game.state("giantA").damage).toBe(4); // once, not 8
    expect(game.state("giantB").damage).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.p1.deck().slice(-4).sort()).toEqual(["j1", "j2", "j3", "j4"]); // the rest recycled
    expect(game.violations()).toEqual([]);
  });

  test("contrast — Karthus ALREADY on the board when the Hook kills Rex: the Deathknell triggers an additional time → Giant A is hit twice for 8", async () => {
    const game = await board(true).build();
    await hookRex(game);
    const asks = await drainAimingAtGiantA(game);
    expect(game.zoneOf("karthus")).toBe("base");
    expect(asks).toBe(2);
    expect(game.state("giantA").damage).toBe(8);
    expect(game.state("giantB").damage).toBe(0);
  });
});
