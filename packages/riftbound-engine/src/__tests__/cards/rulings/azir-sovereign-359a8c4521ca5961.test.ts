/**
 * Ruling 359a8c4521ca5961 — Azir, Sovereign (SFD-177 → sfd-177-221) · [4] · 4 Might
 *   "[Accelerate] … When I attack, you may move any number of your token units to this battlefield."
 *
 * Q: Can Azir bring his tokens to an EMPTY battlefield — one with no defending units at all?
 * A: Yes. Nothing in the ability restricts where "this battlefield" may be; it is simply wherever
 *    Azir is when the trigger resolves. (If Azir has left that battlefield by then, the ability
 *    whiffs, because "this battlefield" is read from his location.)
 * Rules: 359.3.f.3 ("this battlefield" is read from the source's location), 383.4 ("when I attack"
 *        fires off the attacker designation), 465.1 (designations in a showdown).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AZIR = "sfd-177-221";
/** The "token-" id prefix marks a harness card as a token object. */
const SOLDIER = "token-sand-soldier";

/** P1's turn. bf1 belongs to P2; `defended` decides whether a Defender actually stands there. */
function board(defended: boolean) {
  const s = scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", AZIR, "azir")
    .unit(P1, "base", { might: 2, name: "Sand Soldier" }, SOLDIER)
    .unit(P2, "base", { might: 2, name: "Reserve" }, "reserve");
  return defended ? s.unit(P2, "bf1", { might: 2, name: "Defender" }, "def") : s;
}

/** [Reaction] "Deal 4 to a unit." — enough to kill the 4-Might Azir mid-chain. */
const BOLT = {
  abilities: [{ effect: { amount: 4, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Bolt",
  rulesText: "[Reaction] Deal 4 to a unit.",
  timing: "reaction",
} as const;

const keys = (d: Decision | null) => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []);

/** Answer Azir's finalization prompts, taking the Soldier, then drain the chain. */
async function takeSoldier(game: Game): Promise<{ askedYesNo: boolean; offered: string[] }> {
  const offered: string[] = [];
  let askedYesNo = false;
  for (let i = 0; i < 10; i++) {
    const d = game.decision();
    if (d?.kind === "yes-no" && d.seat === P1) {
      askedYesNo = true;
      await game.p1.yes();
      continue;
    }
    if (d?.kind === "pick" && d.seat === P1) {
      offered.push(...keys(d));
      if (keys(d).includes(SOLDIER)) {
        await game.p1.pick(SOLDIER);
        continue;
      }
      break;
    }
    break; // a priority window: the finalization prompts are done
  }
  return { askedYesNo, offered };
}

describe("Ruling 359a8c4521ca5961 — Azir's attack trigger moves tokens to 'this battlefield', empty or not", () => {
  test("premise: attacking an OCCUPIED enemy battlefield fires the trigger and drags the Sand Soldier along", async () => {
    const game = await board(true).build();
    await game.p1.move("azir", "bf1");
    expect(game.state("azir").combatRole).toBe("attacker");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "azir", controller: P1, triggered: true })]);
    const { askedYesNo, offered } = await takeSoldier(game);
    expect(askedYesNo).toBe(true);
    expect(offered).toContain(SOLDIER);
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      const d = game.decision();
      if (d?.kind !== "action" || !d.passKey) {
        break;
      }
      await game.seat(d.seat).pass();
    }
    expect(game.locationOf(SOLDIER)).toBe("bf1");
    expect(game.p1.units("bf1").toSorted()).toEqual([SOLDIER, "azir"].toSorted());
  });

  // RULING-CONFLICT: riftjudge 359a8c4521ca5961 says Azir's attack trigger still fires when he
  // moves to an EMPTY enemy battlefield; CR 190.4.c / 323.6 say a battlefield with no unit of its
  // controller standing there loses control at the first Open Cleanup, so an "empty enemy
  // battlefield" is really an UNCONTROLLED one by the time the arrival is processed. rule 344.1
  // then opens a plain (non-combat) Showdown — Control is not Contested BETWEEN TWO PLAYERS — and
  // rule 383.4.e only fires an Attack Trigger when a unit "gains the Attacker designation ...
  // during a combat". Engine follows CR (operations/battlefield-control.ts is the one model).
  // The ruling's actual content — "this battlefield" is unrestricted, and is read from Azir's
  // location — is covered by the premise facet above and the "leaves before resolution" facet below.
  test("an empty (hence UNCONTROLLED) battlefield: non-combat showdown, no attacker designation, no trigger, Soldier still in base", async () => {
    const game = await board(false).build();
    await game.p1.move("azir", "bf1");
    expect(game.locationOf("azir")).toBe("bf1");
    expect(game.state("azir").combatRole).toBeNull();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.locationOf(SOLDIER)).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  // The same board with DURABLE enemy control (a P2 token holds bf1) is a Combat: Azir gains the
  // Attacker designation, the trigger fires and "this battlefield" takes the Sand Soldier along —
  // which is what ruling 359a8c4521ca5961 is really asking about. rule 464.2.c.3 / 383.4.e.
  test("ruling 359a8c4521ca5961 — 'this battlefield' is unrestricted: the tokens follow Azir in", async () => {
    const game = await board(true).build();
    await game.p1.move("azir", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "azir", controller: P1, triggered: true })]);
    await takeSoldier(game);
    await game.settle();
    expect(game.locationOf(SOLDIER)).toBe("bf1");
  });

  test("nuance: if Azir leaves before the trigger resolves, 'this battlefield' has no source and nothing moves", async () => {
    const game = await scenario()
      .resources(P2, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Defender" }, "def")
      .unit(P1, "base", AZIR, "azir")
      .unit(P1, "base", { might: 2, name: "Sand Soldier" }, SOLDIER)
      .hand(P2, BOLT, "bolt")
      .build();
    await game.p1.move("azir", "bf1");
    await takeSoldier(game); // yes + name the Soldier at finalization
    expect(game.chain().map((c) => c.cardId)).toEqual(["azir"]);
    await game.p1.passPriority();
    await game.p2.cast("bolt", { targets: "azir" }); // 4 damage kills the 4-Might Azir
    await game.settle();
    expect(game.zoneOf("azir")).toBe("trash");
    expect(game.locationOf(SOLDIER)).toBe("base"); // the trigger found no "this battlefield"
    expect(game.violations()).toEqual([]);
  });
});
