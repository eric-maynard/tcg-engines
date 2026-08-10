/**
 * Ruling 128482a22352a39a — Here to Help (SFD-111 → sfd-111-221) · Spell · Body · 2 · Action · [Hidden]
 *   "You may play a unit from hand to a battlefield you control, reducing its cost by [3]."
 *
 * Q: Here to Help used as a Reaction from hidden — can I play my Chosen Champion (in the Champion Zone) with it?
 * A: No. It says "from hand"; the Champion Zone is a different zone, so the Chosen Champion is not an eligible card
 *    for the effect (and a hidden champion isn't in hand either).
 * Rules: 106/108 (hand vs Champion Zone are distinct zones), 811 (Hidden play), 419 (plays instructed by effects).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HERE_TO_HELP = "sfd-111-221";
const SETT_BRAWLER = "ogn-164-298"; // 5-cost Body champion unit, 4 Might — P1's Chosen Champion
const RECRUIT = { cardType: "unit", energyCost: 4, might: 3, name: "Recruit" } as const;

/**
 * P2's turn. P1 holds bfA with a Warden (3) and Here to Help facedown there; Sett, Brawler waits in P1's Champion Zone;
 * P1 has [2] + [body] — enough for either Sett (5−3) or the Recruit (4−3) through Here to Help. P2's Raider (5) attacks.
 */
function board(opts: { recruitInHand: boolean }) {
  const b = scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 2, power: { body: 1 } })
    .battlefield("bfA", { controller: P1 })
    .unit(P1, "bfA", { might: 3, name: "Warden" }, "warden")
    .facedown(P1, "bfA", HERE_TO_HELP, "help")
    .champion(P1, SETT_BRAWLER, "sett")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider");
  return opts.recruitInHand ? b.hand(P1, RECRUIT, "recruit") : b;
}

/** Raider attacks bfA, P2 passes Focus; P1 flips Here to Help and both pass so it resolves. */
async function flipHelpAndResolve(game: Game): Promise<void> {
  await game.p2.move("raider", "bfA");
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("reveal", "help")).toBe(true);
  await game.p1.reveal("help");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "help", controller: P1 })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
}

describe("Ruling 128482a22352a39a — Here to Help (from hidden) cannot play the Chosen Champion from the Champion Zone", () => {
  test("with a Recruit in hand: the 'play a unit from hand' offer lists the Recruit but NOT Sett in the Champion Zone", async () => {
    const game = await board({ recruitInHand: true }).build();
    await flipHelpAndResolve(game);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
    expect(offered).toContain("recruit");
    expect(offered).not.toContain("sett");
    const r = await game.p1.try((p) => p.pick("sett"));
    expect(r.ok).toBe(false);
    // Taking the legal option works: Recruit played to bfA for 4 − 3 = [1].
    await game.p1.pick("recruit");
    for (let i = 0; i < 4; i++) {
      const q = game.decision();
      if (q?.kind === "pick" && q.seat === P1) {
        await game.p1.pick(q.options.find((o) => o.key.includes("bfA"))?.key ?? q.options[0]!.key);
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.zoneOf("recruit")).toBe("battlefield-bfA");
    expect(game.p1.energy()).toBe(1);
    expect(game.zoneOf("sett")).toBe("championZone");
  });

  test("the offer is a 'may': P1 can decline the Recruit — and Sett is still never an option; nothing is played, nothing paid", async () => {
    const game = await board({ recruitInHand: true }).build();
    await flipHelpAndResolve(game);
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).not.toContain("sett");
    await game.p1.decline();
    await game.settle();
    expect(game.zoneOf("help")).toBe("trash");
    expect(game.zoneOf("recruit")).toBe("hand");
    expect(game.zoneOf("sett")).toBe("championZone");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { body: 1 } });
  });

  test("with NO unit in hand at all, Sett in the Champion Zone does not count as 'a unit from hand': he is never proposed and never leaves the Champion Zone", async () => {
    const game = await board({ recruitInHand: false }).build();
    expect(game.p1.hand().filter((c) => game.state(c).cardType === "unit")).toEqual([]);
    await game.p2.move("raider", "bfA");
    await game.p2.passFocus();
    // The engine may or may not let a do-nothing Here to Help be flipped; either way Sett must not be reachable.
    if (game.p1.can("reveal", "help")) {
      await game.p1.reveal("help");
      for (let i = 0; i < 6; i++) {
        const d = game.decision();
        if (d?.kind === "pick" && d.seat === P1) {
          expect(d.options.map((o) => o.card ?? o.key)).not.toContain("sett");
          await game.p1.decline();
        } else if (d?.kind === "yes-no" && d.seat === P1) {
          await game.p1.no();
        } else if (d?.kind === "action" && d.context === "chain") {
          await game.acting().passPriority();
        } else {
          break;
        }
      }
    }
    await game.settle();
    expect(game.zoneOf("sett")).toBe("championZone");
    expect(game.p1.champion()).toBe("sett");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { body: 1 } });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — the Champion Zone has its own play action: outside Here to Help, on P1's turn with full cost, Sett is played from there normally", async () => {
    const game = await scenario()
      .turn(3)
      .resources(P1, { energy: 5, power: { body: 1 } })
      .battlefield("bfA", { controller: P1 })
      .unit(P1, "bfA", { might: 3, name: "Warden" }, "warden")
      .champion(P1, SETT_BRAWLER, "sett")
      .build();
    expect(game.p1.can("playChampion")).toBe(true);
    await game.p1.playChampion("base");
    await game.settle();
    expect(game.zoneOf("sett")).toBe("base");
  });
});
