/**
 * Ruling f7687c1fe9eabfb6 — Last Rites (SFD-150 → sfd-150-221) · Equipment · Chaos · +2 Might
 *     "[Equip] — [chaos], Recycle 2 cards from your trash (Pay the cost: Attach this to a unit you control.)
 *      When I conquer or hold, you may play a unit from your trash. (You still pay its costs.)"
 *
 * Q: How does Last Rites work?
 * A: Two halves. The [Equip] cost is [chaos] PLUS recycling two cards out of your trash — with fewer than two
 *    cards there you cannot start the ability at all. Once attached, the wearer's Conquer or Hold offers you a
 *    unit from your trash to PLAY, and you still pay that unit's own cost.
 * Rules: 404.2 (a cost you cannot pay in full makes the ability unavailable), 429 (activated ability costs),
 *        718.3 (Effect Text is appended to the equipped unit), 419 (playing from a non-hand zone by permission).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LAST_RITES = "sfd-150-221";

/** P1's turn with [3][chaos]. A Bearer (3) waits in base; `trash` is how many spare cards sit in P1's trash. */
function equipBoard(trash: number) {
  const s = scenario()
    .resources(P1, { energy: 3, power: { chaos: 1 } })
    .unit(P1, "base", { might: 3, name: "Bearer" }, "bearer")
    .hand(P1, LAST_RITES, "rites");
  for (let i = 0; i < trash; i++) {
    s.trash(P1, { cardType: "unit", energyCost: 1, might: 1, name: `Fodder ${i + 1}` }, `fodder${i + 1}`);
  }
  return s;
}

/** A Bearer already wearing Last Rites, with a 2-cost Recruit waiting in the trash; bf1 is open. */
function wearingBoard() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 2, name: "Watch" }, "watch")
    .unit(P1, "base", { might: 3, name: "Bearer" }, "bearer", { equippedWith: ["rites"] })
    .card("rites", { def: LAST_RITES, meta: { attachedTo: "bearer" }, owner: P1, zone: "base" })
    .trash(P1, { cardType: "unit", energyCost: 2, might: 4, name: "Recruit" }, "recruit");
}

/** Walk the wearer onto the empty bf1 and stop at Last Rites' "you may play a unit from your trash". */
async function conquerWithBearer(game: Game): Promise<void> {
  await game.p1.move("bearer", "bf1");
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind === "action" && d.context !== "main") {
      await game.seat(d.seat).pass();
      continue;
    }
    break;
  }
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
}

describe("Ruling f7687c1fe9eabfb6 — Last Rites: equipping needs two cards in the trash; the wearer's conquer replays one", () => {
  // Expected (404.2): the [Equip] cost is "[chaos], Recycle 2 cards from your trash", so with one card there
  // the ability cannot be started. Actual: the engine offers Last Rites as an ordinary gear play for its
  // printed [3] Energy — the Equip cost is not modelled at all, so the play is accepted with an empty trash.
  test.failing("BUG: ruling f7687c1fe9eabfb6 — the engine lets Last Rites be played without its Recycle-2 [Equip] cost", async () => {
    const game = await equipBoard(1).build();
    expect(game.p1.can("equip", "rites")).toBe(false);
    const attempt = await game.p1.try((p) => p.playGear("rites"));
    expect(attempt.ok).toBe(false);
    expect(game.zoneOf("rites")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { chaos: 1 } }); // nothing paid
  });

  // Expected: paying [chaos] + recycling two trash cards ATTACHES Last Rites to a unit you control (+2 Might).
  // Actual: [3] Energy is charged instead, the two cards stay in the trash and nothing is attached.
  test.failing("BUG: ruling f7687c1fe9eabfb6 — equipping Last Rites neither recycles the two cards nor attaches it", async () => {
    const game = await equipBoard(2).build();
    expect(game.p1.can("equip", "rites")).toBe(true);
    await game.p1.playGear("rites");
    await game.settle();
    expect(game.p1.power("chaos")).toBe(0);
    expect(game.p1.trash()).toEqual([]); // both fodder cards were recycled
    expect(game.zoneOf("fodder1")).toBe("mainDeck");
    expect(game.zoneOf("fodder2")).toBe("mainDeck");
    expect(game.state("rites").attachedTo).toBe("bearer");
    expect(game.state("bearer").might).toBe(5); // 3 + the equipment's +2
    expect(game.violations()).toEqual([]);
  });

  test("ruling: the wearer conquering offers 'you may play a unit from your trash' — a declinable yes/no for P1", async () => {
    const game = await wearingBoard().build();
    await conquerWithBearer(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    expect(game.p1.points()).toBe(1);
  });

  test("accepting plays the Recruit out of the trash and P1 still pays its [2]", async () => {
    const game = await wearingBoard().build();
    await conquerWithBearer(game);
    await game.p1.yes();
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P1) {
        const recruit = d.options.find((o) => (o.card ?? o.key) === "recruit");
        await game.p1.pick(recruit ? "recruit" : "base");
        continue;
      }
      if (d?.kind === "action" && d.context !== "main") {
        await game.seat(d.seat).pass();
        continue;
      }
      break;
    }
    expect(game.p1.units()).toContain("recruit");
    expect(game.p1.trash()).not.toContain("recruit");
    expect(game.p1.energy()).toBe(0); // the Recruit's own [2] was paid
    expect(game.violations()).toEqual([]);
  });

  test("declining leaves the Recruit in the trash and the energy unspent", async () => {
    const game = await wearingBoard().build();
    await conquerWithBearer(game);
    await game.p1.no();
    await game.settle();
    expect(game.p1.trash()).toContain("recruit");
    expect(game.p1.energy()).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
