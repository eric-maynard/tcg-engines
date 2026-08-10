/**
 * Ruling 96d4c2a2581fb83d — Helm of Suppression (VEN-045 → ven-045-166) · Gear [4][calm] "Opponents' spells cost [1] more. If this is
 *     [Empowered], they cost [1][rainbow] more instead."
 *   × Fizz, Trickster (SFD-140 → sfd-140-221) · [3][chaos] 3 Might "When you play me, you may play a spell from your trash with Energy cost
 *     no more than [3], ignoring its Energy cost. Recycle that spell after you play it. (You must still pay its Power cost.)"
 *   (+ Cleave ogn-004-298, [1] "Give a unit [Assault 3] this turn." as the trash spell.)
 *
 * Q: Does the Helm still tax a spell played through Fizz ("ignoring its Energy cost")?
 * A: Yes. Cost determination: Fizz sets the base Energy cost to 0 (356.1.b.2), THEN increases apply (356.3) — the Helm adds [1]
 *    (or [1][rainbow] if Empowered), and 356.1.b.3 says later increases can lift the total above zero. So the "free" spell costs
 *    1 Energy (+1 power of any domain if Empowered), plus its own Power cost.
 * Rules: 356.1.b.2, 356.1.b.3, 356.3.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HELM_OF_SUPPRESSION = "ven-045-166";
const FIZZ = "sfd-140-221";
const CLEAVE = "ogn-004-298";

/** P1's turn. P2's Helm (empowered or not) in P2's base. P1: Fizz in hand, Cleave in trash, Grunt (2) in base to Cleave; resources as given. */
function board(res: { energy: number; power?: Record<string, number> }, empowered: boolean) {
  return scenario()
    .turn(3)
    .resources(P1, { energy: res.energy, power: { chaos: 1, ...(res.power ?? {}) } })
    .battlefield("bf1", { controller: P2 })
    .gear(P2, HELM_OF_SUPPRESSION, "helm", empowered ? ({ empowered: true } as Record<string, unknown>) : undefined)
    .unit(P1, "base", { might: 2, name: "Grunt" }, "grunt")
    .trash(P1, CLEAVE, "cleave")
    .hand(P1, FIZZ, "fizz");
}

/** Play Fizz ([3][chaos]), accept his trigger, try to play Cleave from the trash on the Grunt; drive to P1's open main phase. */
async function fizzReplaysCleave(game: Game): Promise<void> {
  await game.p1.play("fizz");
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "yes-no" && d.seat === P1) {
      await (d.canAccept === false ? game.p1.no() : game.p1.yes());
    } else if (d.kind === "pick" && d.seat === P1 && d.options.some((o) => (o.card ?? o.key) === "cleave")) {
      await game.p1.pick("cleave");
    } else if (d.kind === "pick" && d.seat === P1 && d.options.some((o) => (o.card ?? o.key) === "grunt")) {
      await game.p1.pick("grunt");
    } else if (d.kind === "pick" && d.seat === P1 && d.allowDecline) {
      await game.p1.decline();
    } else if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else if (d.kind === "order" && d.defaultable) {
      await game.acceptTriggerOrder();
    } else {
      break;
    }
  }
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  expect(game.zoneOf("fizz")).toBe("base");
}

const cleaveResolved = (game: Game): boolean => game.state("grunt").grantedKeywords.some((k) => k.keyword === "Assault");

describe("Ruling 96d4c2a2581fb83d — Helm of Suppression still taxes the spell Fizz plays 'ignoring its Energy cost'", () => {
  test("premise: the (non-Empowered) Helm makes P1's spells cost [1] more — a hand Cleave ([1]) is unplayable with 1 energy and costs 2", async () => {
    const poor = await scenario().resources(P1, { energy: 1 }).battlefield("bf1", { controller: P2 }).gear(P2, HELM_OF_SUPPRESSION, "helm").unit(P1, "base", { might: 2 }, "grunt").hand(P1, CLEAVE, "c").build();
    expect(poor.state("helm").isEmpowered).toBe(false);
    expect(poor.p1.can("cast", "c")).toBe(false);
    const rich = await scenario().resources(P1, { energy: 2 }).battlefield("bf1", { controller: P2 }).gear(P2, HELM_OF_SUPPRESSION, "helm").unit(P1, "base", { might: 2 }, "grunt").hand(P1, CLEAVE, "c").build();
    await rich.p1.cast("c", { targets: "grunt" });
    expect(rich.p1.energy()).toBe(0);
  });

  // After Fizz ([3][chaos]) P1 has exactly 1 energy left; the trash Cleave costs 0 (Fizz) + 1 (Helm) = 1 → it is played, the
  // last energy is SPENT (0 left), Cleave resolves and is recycled.
  test("ruling 96d4c2a2581fb83d — Fizz's trash spell still pays the Helm's +[1]: it costs 1 (356.1.b.3)", async () => {
    const game = await board({ energy: 4 }, false).build();
    await fizzReplaysCleave(game);
    expect(cleaveResolved(game)).toBe(true);
    expect(game.zoneOf("cleave")).toBe("mainDeck"); // recycled after being played
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  });

  // Expected: with exactly [3][chaos] everything goes into Fizz; the trash Cleave now costs 1 that P1 cannot pay → it cannot be played
  // (stays in the trash, Grunt gets nothing).
  test("ruling 96d4c2a2581fb83d — with 0 energy left the Helm-taxed trash spell is unplayable via Fizz", async () => {
    const game = await board({ energy: 3 }, false).build();
    await fizzReplaysCleave(game);
    expect(game.p1.energy()).toBe(0);
    expect(cleaveResolved(game)).toBe(false);
    expect(game.zoneOf("cleave")).toBe("trash");
  });

  // Expected: Empowered Helm ⇒ [1][rainbow] more: after Fizz P1 has 1 energy + 1 fury; playing Cleave from the trash spends BOTH.
  test("ruling 96d4c2a2581fb83d — Empowered Helm: Fizz's trash spell pays the extra [1][rainbow] — 1 energy + 1 power spent", async () => {
    const game = await board({ energy: 4, power: { fury: 1 } }, true).build();
    expect(game.state("helm").isEmpowered).toBe(true);
    await fizzReplaysCleave(game);
    expect(cleaveResolved(game)).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, fury: 0 } });
  });

  test("Empowered Helm, and P1 has NO spare power after Fizz: the [rainbow] surcharge cannot be met, so the trash Cleave is not played (stays in the trash, no Assault)", async () => {
    const game = await board({ energy: 4 }, true).build();
    await fizzReplaysCleave(game);
    expect(cleaveResolved(game)).toBe(false);
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.p1.power("chaos")).toBe(0); // only Fizz's own pip was spent
  });
});
