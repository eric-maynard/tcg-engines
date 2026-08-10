/**
 * Ruling b998554815ec0774 — Unforgiven (OGN-259 → ogn-259-298, Yasuo legend) "[2], [Exhaust]: Move a friendly unit to or from its
 *   base." × Stealthy Pursuer (OGN-177 → ogn-177-298) "When a friendly unit moves from my location, I may be moved with it."
 *
 * Q: Can exhausted units enter combat if moved by a card effect?
 * A: Yes. Exhaustion only prevents the Standard Move; an effect may move an exhausted unit to an enemy battlefield and combat
 *    follows. Nuances: if the attacker can't kill the defenders and survives, it is recalled to base in the state it was in
 *    (still exhausted); Unforgiven moves only ONE unit (others may follow only via effects like Stealthy Pursuer).
 * Rules: 141.2 / 144 (Standard Move exhausts as a cost), 421 (move by effect keeps state), 465–467 (combat outcome / recall).
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const UNFORGIVEN = "ogn-259-298";
const STEALTHY_PURSUER = "ogn-177-298";

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** P1's turn. P2 holds bf1 with a Wall (6). P1: Unforgiven legend + [2]; an EXHAUSTED Brute (4) and an exhausted Other (2) in base. */
function board(wallMeta: { stunned?: boolean } = {}) {
  return scenario()
    .resources(P1, { energy: 2 })
    .legend(P1, UNFORGIVEN, "yasuo")
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 6, name: "Wall" }, "wall", wallMeta)
    .unit(P1, "base", { might: 4, name: "Brute" }, "brute", { exhausted: true })
    .unit(P1, "base", { might: 2, name: "Other" }, "other", { exhausted: true });
}

/** Activate Unforgiven on the Brute and send it to bf1; resolve the ability. */
async function yasuoSendsBrute(game: Game): Promise<void> {
  expect(game.state("brute").isExhausted).toBe(true);
  expect(game.p1.can("move", "brute")).toBe(false); // no Standard Move while exhausted
  await game.p1.activate("yasuo", 0, { targets: "brute" });
  expect(game.state("yasuo").isExhausted).toBe(true);
  expect(game.p1.energy()).toBe(0);
  game.script(P1, [
    (d) => (d.kind === "pick" && d.semantics === "destination" ? "battlefield-bf1" : undefined),
  ]);
  for (let i = 0; i < 8 && game.locationOf("brute") !== "bf1"; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      expect((d as PickDecision).options.map((o) => o.key)).toContain("battlefield-bf1");
      await game.p1.pick("battlefield-bf1");
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.acting().passPriority();
    } else {
      break;
    }
  }
  game.clearScript(P1);
  expect(game.locationOf("brute")).toBe("bf1");
}

describe("Ruling b998554815ec0774 — an exhausted unit moved by an effect enters combat", () => {
  test("Unforgiven moves the EXHAUSTED Brute from base to P2's bf1: it arrives still exhausted and a combat showdown opens with the Brute attacking", async () => {
    const game = await board().build();
    await yasuoSendsBrute(game);
    expect(game.state("brute").isExhausted).toBe(true);
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bf1", defendingPlayer: P2, isCombatShowdown: true });
    expect(game.state("brute").combatRole).toBe("attacker");
    expect(game.state("wall").combatRole).toBe("defender");
  });

  test("only ONE unit is moved by Unforgiven: the ability names a single friendly unit and the Other stays in base", async () => {
    const game = await board().build();
    const targets = game.p1.option("activate", "yasuo")?.fields.find((f) => f.name === "targets");
    expect(targets?.max ?? 1).toBe(1);
    expect(targets?.options).toEqual(expect.arrayContaining([["brute"], ["other"]]));
    await yasuoSendsBrute(game);
    expect(game.locationOf("other")).toBe("base");
    expect(game.p1.units("bf1")).toEqual(["brute"]);
  });

  test("combat happens for real: Brute (4) into Wall (6) — the exhausted attacker deals and takes combat damage (Brute dies, Wall took 4)", async () => {
    const game = await board().build();
    await yasuoSendsBrute(game);
    await game.settle();
    expect(showdown(game)).toBeUndefined();
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("nuance: if the attacker can't kill the defender but survives (Wall stunned → deals no damage), the Brute is recalled to base in the state it was in — still EXHAUSTED", async () => {
    const game = await board({ stunned: true }).build();
    await yasuoSendsBrute(game);
    await game.settle();
    expect(showdown(game)).toBeUndefined();
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.locationOf("brute")).toBe("base");
    expect(game.state("brute").isExhausted).toBe(true);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("nuance: Stealthy Pursuer (also exhausted, same location) MAY follow the effect-move — P1 is asked, says yes, and both exhausted units are attackers at bf1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .legend(P1, UNFORGIVEN, "yasuo")
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 6, name: "Wall" }, "wall")
      .unit(P1, "base", { might: 4, name: "Brute" }, "brute", { exhausted: true })
      .unit(P1, "base", STEALTHY_PURSUER, "pursuer", { exhausted: true })
      .build();
    await yasuoSendsBrute(game);
    // The Pursuer's "may be moved with it" trigger: P1 must be asked.
    let asked = false;
    for (let i = 0; i < 8 && game.locationOf("pursuer") !== "bf1"; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1) {
        asked = true;
        await game.p1.yes();
      } else if (d?.kind === "pick" && d.seat === P1) {
        asked = true;
        await game.p1.pick(d.options[0]?.key as string);
      } else if (d?.kind === "action" && d.context === "chain") {
        await game.acting().passPriority();
      } else {
        break;
      }
    }
    expect(asked).toBe(true);
    expect(game.locationOf("pursuer")).toBe("bf1");
    expect(game.state("pursuer").isExhausted).toBe(true);
    expect(game.state("brute").isExhausted).toBe(true);
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
    expect(new Set(game.p1.units("bf1"))).toEqual(new Set(["brute", "pursuer"]));
  });
});
