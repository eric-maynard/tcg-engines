/**
 * Ruling a0bd4311080c62f3 — Gangplank, Naval (VEN-086; our def ven-181-166 — same card, alt numbering)
 *   6-cost / 6-Might Body unit: "[Empower] [body][body]
 *    [Empowered] If a spell or ability that chooses me would stun me, give me -[Might], or return me to
 *    hand, give me +3 [Might] instead."
 *   × Switcheroo (sfd-145-221) "[Action] Swap the Might of two units at the same battlefield this turn."
 *   × Determined Sentry (unl-111-219) — 1-Might unit.
 *
 * Q: What happens when Switcheroo would reduce an Empowered Gangplank's Might?
 * A: A swap computes one difference and creates two separate modifiers (a decrease on the higher unit, an
 *    increase on the lower). The decrease aimed at Gangplank is replaced by +3 Might; the other unit's
 *    increase is unchanged and nothing is recalculated. Example: Empowered Gangplank 6 ↔ Sentry 1 →
 *    Gangplank ends at 9 (6 + 3), Sentry ends at 6 (1 + 5).
 * Rules: 433.1.a, 433.1.b (swap = two modifiers from one difference); replacement effects (366–372).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GANGPLANK_NAVAL = "ven-181-166";
const SWITCHEROO = "sfd-145-221"; // 2 energy + [chaos][chaos]
const DETERMINED_SENTRY = "unl-111-219";

/**
 * P1's turn with exactly [2][chaos][chaos]. P2's Gangplank (Empowered unless stated) and P2's Determined
 * Sentry are the only two units at bf1, so they are Switcheroo's two units "at the same battlefield".
 */
function board(empowered: boolean) {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", GANGPLANK_NAVAL, "gp", empowered ? { empowered: true } : undefined)
    .unit(P2, "bf1", DETERMINED_SENTRY, "sentry")
    .hand(P1, SWITCHEROO, "swap");
}

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/** Cast Switcheroo on the two bf1 units and let it resolve (answering the unit picks if the engine asks). */
async function switcheroo(game: Game): Promise<void> {
  await game.p1.cast("swap", { answers: ["gp", "sentry"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["swap"]);
  let stop = await game.settle();
  for (const pick of ["gp", "sentry"]) {
    if (stop.reason !== "unanswered") {
      break;
    }
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick(pick);
    stop = await game.settle();
  }
  expect(stop.reason).toBe("open");
  expect(game.zoneOf("swap")).toBe("trash");
}

describe("Ruling a0bd4311080c62f3 — Switcheroo vs an Empowered Gangplank, Naval", () => {
  test("premise: Empowered Gangplank reads 6 Might, Determined Sentry 1 Might, both at bf1", async () => {
    const game = await board(true).build();
    expect(game.state("gp").isEmpowered).toBe(true);
    expect(game.state("gp").might).toBe(6);
    expect(game.state("sentry").might).toBe(1);
    expect(game.locationOf("gp")).toBe("bf1");
    expect(game.locationOf("sentry")).toBe("bf1");
  });

  test("control (NOT Empowered): the swap applies normally — Gangplank 6→1 (-5), Sentry 1→6 (+5) (433.1.b)", async () => {
    const game = await board(false).build();
    expect(game.state("gp").isEmpowered).toBe(false);
    await switcheroo(game);
    expect(game.state("gp").might).toBe(1);
    expect(game.state("gp").mightModifier).toBe(-5);
    expect(game.state("sentry").might).toBe(6);
    expect(game.state("sentry").mightModifier).toBe(5);
  });

  test("Empowered: the Sentry's half of the swap is an independent +5 modifier — Sentry ends at 6 whatever happens to Gangplank (433.1.a)", async () => {
    const game = await board(true).build();
    await switcheroo(game);
    expect(game.state("sentry").mightModifier).toBe(5);
    expect(game.state("sentry").might).toBe(6);
  });

  // Expected: the -5 modifier that Switcheroo (a spell that chose him) would apply to Empowered Gangplank is
  // REPLACED by +3 → Gangplank 9 (6 + 3); the difference is not recalculated, Sentry still 6.
  // Actual: the engine applies the raw -5 to Gangplank (ends at 1); his Empowered replacement is not modelled.
  test("ruling a0bd4311080c62f3 — engine gives Empowered Gangplank -5 (→1); expected the decrease to be replaced by +3 (→9) while Sentry still ends at 6", async () => {
    const game = await board(true).build();
    await switcheroo(game);
    expect(game.state("sentry").might).toBe(6);
    expect(game.state("gp").mightModifier).toBe(3);
    expect(game.state("gp").might).toBe(9);
  });

  test("both modifiers last only 'this turn': after the turn passes the printed Mights return (433.1.a)", async () => {
    const game = await board(true).build();
    await switcheroo(game);
    await game.advanceTurn();
    expect(game.state("sentry").might).toBe(1);
    expect(game.state("gp").might).toBe(6);
  });
});
