/**
 * Ruling 4a045fd09f8da980 — Fiora, Peerless (SFD-110 → sfd-110-221) · Unit · [3][body] · 3 Might
 *   "When I attack or defend one on one, double my Might this combat."
 *   × Kha'Zix, Mutating Horror (UNL-143 → unl-143-219) · [Ambush] · [4][chaos] · 4 Might — played as a
 *     [Reaction] into the same battlefield after Fiora's trigger is already on the chain.
 *
 * Q: I am defending alone with Fiora; the attacker moves in and then Ambushes a Kha'Zix into the fight.
 *    Does Fiora still get her doubled Might?
 * A: Yes. "One on one" is checked when she is DESIGNATED the defender, not when the trigger resolves.
 *    She was alone against one attacker at that moment, so the trigger is on the chain; playing another
 *    unit in response cannot take it back off.
 * Rules: 383.4.f (defend triggers fire on gaining the designation; their condition is checked then),
 *        359.3 (a resolving item is not re-tested against its trigger condition), 822.1.b (Ambush).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIORA = "sfd-110-221";
const KHAZIX = "unl-143-219";

/** P2's turn. P1 holds bf1 with Fiora alone; P2's Raider (3) attacks and P2 also holds Kha'Zix with [4][chaos]. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 4, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", FIORA, "fiora")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P2, KHAZIX, "khazix");
}

/** The Raider attacks: Fiora is designated the lone defender and her trigger goes on the chain. */
async function fioraDefendsAlone(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(game.state("fiora").combatRole).toBe("defender");
  expect(game.p1.units("bf1")).toEqual(["fiora"]);
  expect(game.chain().some((c) => c.cardId === "fiora" && c.triggered)).toBe(true);
  expect(game.state("fiora").might).toBe(3); // not yet resolved
  return game;
}

describe("Ruling 4a045fd09f8da980 — Fiora's 'one on one' is judged when she is designated, not at resolution", () => {
  test("premise: one attacker, one defender — Fiora's trigger is already on the chain before anyone may respond", async () => {
    const game = await fioraDefendsAlone();
    expect(game.chain().filter((c) => c.cardId === "fiora")).toHaveLength(1);
  });

  test("ruling 4a045fd09f8da980 — P2 Ambushes Kha'Zix into the same battlefield in response; Fiora's Might still doubles to 6", async () => {
    const game = await fioraDefendsAlone();
    while (game.decision()?.kind === "action" && game.decision()?.seat !== P2) {
      await game.acting().pass();
    }
    expect(game.p2.can("play", "khazix")).toBe(true);
    await game.p2.play("khazix", { to: "bf1" });
    expect(game.zoneOf("khazix")).toBe("battlefield-bf1");
    expect(game.p2.units("bf1").toSorted()).toEqual(["khazix", "raider"]);
    // Drive the chain out: Fiora's trigger is still there and still resolves.
    for (let i = 0; i < 12; i++) {
      const d = game.decision();
      if (d?.kind === "action" && (d.context === "chain" || d.context === "showdown")) {
        await game.acting().pass();
      } else if (d?.kind === "pick" || d?.kind === "yes-no") {
        break;
      } else {
        break;
      }
      if (game.state("fiora").might === 6) {
        break;
      }
    }
    expect(game.state("fiora").might).toBe(6);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — if Kha'Zix is on the battlefield BEFORE the designation, Fiora is not one on one and never triggers", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", FIORA, "fiora")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .unit(P2, "base", { might: 4, name: "Second" }, "second")
      .build();
    await game.p2.move(["raider", "second"], "bf1");
    expect(game.state("fiora").combatRole).toBe("defender");
    expect(game.chain().some((c) => c.cardId === "fiora")).toBe(false);
    expect(game.state("fiora").might).toBe(3);
  });

  test("and the doubling is 'this combat' only — after the fight Fiora is a 3 again", async () => {
    const game = await fioraDefendsAlone();
    await game.settle();
    expect(game.state("fiora").might).toBe(3);
  });
});
