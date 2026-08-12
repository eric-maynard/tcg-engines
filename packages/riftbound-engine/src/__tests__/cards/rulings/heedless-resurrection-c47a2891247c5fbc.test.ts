/**
 * Ruling c47a2891247c5fbc — Heedless Resurrection (UNL-142 → unl-142-219)
 *   "[Reaction] As an additional cost to play this, kill a friendly unit.
 *    Play a unit from your trash that costs no more Energy and no more Power than the killed unit,
 *    ignoring its cost."
 *   × Zhonya's Hourglass (ogn-077-298) / Unlicensed Armory (ogn-023-298) — die replacements.
 *
 * Q: If a replacement effect saves the unit I am killing to pay Heedless Resurrection's cost, does the
 *    spell still work?
 * A: No. The cost IS paid (357.2.a — a replaced cost payment still counts), so the spell is played and
 *    goes on the chain. But nothing was killed, so "the killed unit" is NULL information: the Energy and
 *    Power comparisons can never be satisfied and no card in the trash may be played — not even a
 *    zero-cost one. The spell resolves and does nothing.
 * Rules: 357.2.a, 359.3.e.12 (null information ⇒ comparisons fail), 370.1.a.1 (a replaced death never
 *        happened).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const HEEDLESS = "unl-142-219";
const ZHONYAS = "ogn-077-298";
const ARMORY = "ogn-023-298";

const VICTIM = { cardType: "unit", energyCost: 3, might: 3, name: "Victim", powerCost: ["chaos"] } as const;
const PORO = { cardType: "unit", energyCost: 0, might: 1, name: "Daring Poro" } as const;

/**
 * P1: Zhonya's Hourglass in play, one Victim on the board, a FREE Poro in the trash (the ruling calls
 * out that not even a zero-cost unit may be played), HR in hand.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .gear(P1, ZHONYAS, "zh")
    .unit(P1, "base", VICTIM, "victim")
    .trash(P1, PORO, "poro")
    .hand(P1, HEEDLESS, "hr");
}

describe("Ruling c47a2891247c5fbc — Heedless Resurrection whose cost-kill is replaced", () => {
  test("the cost is still paid: the spell is played, Zhonya's is trashed and the Victim is recalled alive (357.2.a / 370.1.a.1)", async () => {
    const game = await board().build();
    await game.p1.play("hr", { sacrifice: "victim", targets: "poro" });
    await game.settle({ policy: "first" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.zoneOf("hr")).toBe("trash");
  });

  test("ruling c47a2891247c5fbc — nothing was killed, so no unit may be played from the trash: the Poro stays there (359.3.e.12)", async () => {
    const game = await board().build();
    await game.p1.play("hr", { sacrifice: "victim", targets: "poro" });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.p1.units()).toEqual(["victim"]);
  });
});

/** P1: Unlicensed Armory (its shield is OPTIONAL — "you may pay [fury]"), Victim, free Poro in the trash. */
function armoryBoard() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1, fury: 1 } })
    .gear(P1, ARMORY, "armory")
    .unit(P1, "base", VICTIM, "victim")
    .trash(P1, PORO, "poro")
    .hand(P1, HEEDLESS, "hr")
    .hand(P1, { might: 4, name: "Fodder" }, "fodder");
}

/** Arm the Armory's single-fire die replacement on the Victim, then play HR killing it for the cost. */
async function armThenHeedless(game: Game): Promise<void> {
  await game.p1.activate("armory", 0, { answers: ["victim"], discard: "fodder" });
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1 && d.options.some((o) => (o.card ?? o.key) === "victim")) {
      await game.p1.pick("victim");
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  await game.settle();
  await game.p1.play("hr", { sacrifice: "victim", targets: "poro" });
}

describe("Ruling c47a2891247c5fbc — the same with Unlicensed Armory, whose shield is OPTIONAL", () => {
  test("shield PAID: the Victim is saved, so the resurrection finds no killed unit and the Poro stays in the trash", async () => {
    const game = await armoryBoard().build();
    await armThenHeedless(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes(); // pay [fury]: heal, exhaust and recall it instead of dying
    await game.settle({ policy: "first" });
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.zoneOf("poro")).toBe("trash");
  });

  test("shield DECLINED: the Victim really dies, so the cost-kill is a real kill and the free Poro IS resurrected", async () => {
    const game = await armoryBoard().build();
    await armThenHeedless(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no(); // let it die
    await game.settle({ policy: "first" });
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("base");
  });
});
