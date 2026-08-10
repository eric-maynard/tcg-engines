/**
 * Ruling 41bb2f9696ce01cb — Akshan, Mischievous (SFD-109 → sfd-109-221) · Champion · Body · 4 · 4 Might
 *   "[Weaponmaster] You may pay [body][body] as an additional cost to play me. When you play me, if you paid the
 *    additional cost, move an enemy gear to your base. You control it until I leave the board. …"
 *   × Baited Hook (OGN-242 → ogn-242-298) · Gear "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 … play
 *     it, ignoring its cost. Then recycle the rest."
 *
 * Q: If Akshan is played off Baited Hook ("ignoring its cost"), can I still pay his optional [body][body]?
 * A: Yes. Ignoring cost only waives the base energy/power cost; the optional additional cost may still be paid, and if
 *    it is, his "if you paid the additional cost" trigger fires and steals an enemy gear. Paying is optional.
 * Rules: 356.1.b.1 (ignore cost = base cost only), 355.1 / 560 (additional costs are separate and optional here).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AKSHAN = "sfd-109-221";
const BAITED_HOOK = "ogn-242-298";
const GARBAGE_GRABBER = "ogn-099-298"; // a plain enemy gear to steal

type Pick = Extract<Decision, { kind: "pick" }>;

/**
 * P1's turn: Baited Hook ready, exactly [1][order] for it plus [body][body] spare (NOT enough energy to hard-cast
 * Akshan). Bait (3 Might → ceiling 4) in base; deck top: Akshan then four spells. P2 owns a Garbage Grabber.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { body: 2, order: 1 } })
    .gear(P1, BAITED_HOOK, "hook")
    .gear(P2, GARBAGE_GRABBER, "grabber")
    .unit(P1, "base", { might: 3, name: "Bait" }, "bait")
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .deck(
      P1,
      [
        AKSHAN,
        { cardType: "spell", energyCost: 1, name: "Junk 1" },
        { cardType: "spell", energyCost: 1, name: "Junk 2" },
        { cardType: "spell", energyCost: 1, name: "Junk 3" },
        { cardType: "spell", energyCost: 1, name: "Junk 4" },
      ],
      ["akshan", "j1", "j2", "j3", "j4"],
    )
    .script(P1, [(d) => (d.kind === "pick" && /target|kill/i.test(d.prompt) && d.options.some((o) => o.key === "bait") ? "bait" : undefined)]);
}

/** Activate the Hook on Bait, resolve it, and take Akshan from the look. Returns at the next P1 prompt. */
async function hookIntoAkshan(): Promise<Game> {
  const game = await board().build();
  const field = game.p1.option("activate", "hook")?.fields.find((f) => f.name === "targets");
  if (field) {
    await game.p1.activate("hook", 0, { targets: "bait" });
  } else {
    await game.p1.activate("hook");
  }
  expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 2, order: 0 } }); // Hook paid; [body][body] untouched
  await game.settle();
  const look = game.decision();
  expect(look).toMatchObject({ kind: "pick", seat: P1 });
  expect((look as Pick).options.map((o) => o.card ?? o.key)).toEqual(["akshan"]); // 4 Might ≤ 3+1; spells excluded
  expect(game.zoneOf("bait")).toBe("trash");
  await game.p1.pick("akshan");
  return game;
}

describe("Ruling 41bb2f9696ce01cb — Akshan played free off Baited Hook may still pay [body][body] and steal a gear", () => {
  test("after choosing Akshan from the Hook's look, P1 is OFFERED the optional [body][body] (base cost ignored, additional cost still payable)", async () => {
    const game = await hookIntoAkshan();
    const d = game.decision();
    expect(d).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "akshan" } });
    expect(d?.prompt ?? "").toMatch(/body.*body/i);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 2, order: 0 } }); // nothing charged for Akshan himself
  });

  test("paying it: [body][body] leaves the pool, Akshan lands in base for 0 energy, and his trigger steals the enemy Grabber", async () => {
    const game = await hookIntoAkshan();
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, order: 0 } });
    await game.settle();
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("grabber");
      await game.settle();
    }
    expect(game.zoneOf("akshan")).toBe("base");
    expect(game.state("akshan").controller).toBe(P1);
    expect(game.state("grabber")).toMatchObject({ controller: P1, owner: P2 });
    expect(game.p1.gear().sort()).toEqual(["grabber", "hook"]);
    expect(game.p2.gear()).toEqual([]);
    // "Then recycle the rest": the four spells went to the bottom, Akshan was the one played.
    expect(game.p1.deck().slice(-4).sort()).toEqual(["j1", "j2", "j3", "j4"]);
    expect(game.violations()).toEqual([]);
  });

  test("declining it (the additional cost is optional): Akshan still enters free, [body][body] stays, no gear moves", async () => {
    const game = await hookIntoAkshan();
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("akshan")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 2, order: 0 } });
    expect(game.state("grabber").controller).toBe(P2);
    expect(game.p1.gear()).toEqual(["hook"]);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
