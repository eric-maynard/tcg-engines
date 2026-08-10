/**
 * Ruling 452bc50912c84803 — The Boss (OGN-269 → ogn-269-298) · Legend · Sett
 *     "If a buffed unit you control would die, you may pay [rainbow], exhaust me, and spend its buff to heal it,
 *      exhaust it, and recall it instead. …"
 *   × Charm (OGN-043 → ogn-043-298) · Spell · [1][calm] · "Move an enemy unit."
 *   × Hidden Blade (OGN-213 → ogn-213-298) · [Hidden] Action · "Kill a unit at a battlefield. Its controller draws 2."
 *
 * Q: A buffed unit under The Boss is targeted by Charm, then dies to Hidden Blade in response and is saved by Sett
 *    (recalled to base). Does Charm still resolve and pull the unit?
 * A: Yes. The unit never entered a non-board zone (battlefield → base via the replacement), so it is the same
 *    object and still a legal target: Charm resolves and moves it from base to a battlefield.
 * Rules: 371–373 (replacement effects), 190/106 (base is a board zone; zone-change identity), 355.15/359.3.e.5
 *        (target legality re-checked on resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const THE_BOSS = "ogn-269-298";
const CHARM = "ogn-043-298";
const HIDDEN_BLADE = "ogn-213-298";

/**
 * P2's turn. P1: The Boss (ready), one [body] for its [rainbow]; buffed Cithria (2+1) standing at bf1, which P2
 * controls and where P2's Hidden Blade lies facedown (811.1.d.2: from Hidden it must kill a unit THERE). P2: Charm
 * in hand and exactly [1][calm]. bf2 is P1's (a legal Charm destination).
 */
function board() {
  return scenario()
    .active(P2)
    .legend(P1, THE_BOSS, "boss")
    .resources(P1, { power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 4, name: "Holder" }, "holder")
    .unit(P1, "bf1", { might: 2, name: "Cithria" }, "cithria", { buffed: true })
    .facedown(P2, "bf1", HIDDEN_BLADE, "blade")
    .hand(P2, CHARM, "charm")
    .resources(P2, { energy: 1, power: { calm: 1 } });
}

/** P2 Charms Cithria, then reveals Hidden Blade at her in response; both pass so the Blade resolves up to the Boss's question. */
async function charmThenBlade(): Promise<Game> {
  const game = await board().build();
  expect(game.state("cithria")).toMatchObject({ isBuffed: true, might: 3 });
  await game.p2.cast("charm", { targets: "cithria" });
  // The engine asks Charm's destination as it is played (P2's choice): send her to the other battlefield, bf2.
  const dest = game.decision();
  expect(dest).toMatchObject({ kind: "pick", seat: P2, semantics: "destination" });
  const bf2 = dest?.kind === "pick" ? dest.options.find((o) => /bf2/.test(`${o.key} ${o.zone ?? ""}`)) : undefined;
  expect(bf2).toBeDefined();
  await game.p2.answer({ keys: [bf2!.key], kind: "pick" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "charm", controller: P2, targets: ["cithria"] })]);
  expect(game.p2.can("reveal", "blade")).toBe(true);
  await game.p2.reveal("blade", { answers: ["cithria"] });
  expect(game.chain().map((c) => c.cardId)).toEqual(["charm", "blade"]);
  // LIFO: everyone passes → Hidden Blade resolves first and tries to kill Cithria.
  for (let i = 0; i < 4; i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "chain" || !d.passKey) {
      break;
    }
    await game.seat(d.seat).passPriority();
  }
  return game;
}

describe("Ruling 452bc50912c84803 — a unit saved by The Boss (recalled, never left the board) is still Charm's legal target", () => {
  test("Hidden Blade's kill is a 'would die' event for the buffed Cithria: P1 is asked whether to apply The Boss; YES → Cithria healed, exhausted, un-buffed and RECALLED to base (not trash) while Charm still waits on the chain", async () => {
    const game = await charmThenBlade();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "boss" } });
    await game.p1.yes();
    expect(game.zoneOf("cithria")).toBe("base");
    expect(game.p1.trash()).not.toContain("cithria");
    expect(game.state("cithria")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true, might: 2 });
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.p1.power("body")).toBe(0);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["charm"]);
    expect(game.chain()[0]?.targets).toEqual(["cithria"]); // same object, still referenced
  });

  test("Charm then resolves and DOES move her: Cithria is pulled from base onto the chosen battlefield (bf2)", async () => {
    const game = await charmThenBlade();
    await game.p1.yes();
    expect(game.locationOf("cithria")).toBe("base");
    // Pass priority until Charm resolves; re-affirm the destination if the engine asks again on resolution.
    for (let i = 0; i < 6 && (game.chain().length > 0 || game.decision()?.kind === "pick"); i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P2) {
        const o = d.options.find((x) => /bf2/.test(`${x.key} ${x.zone ?? ""}`));
        expect(o).toBeDefined();
        await game.p2.answer({ keys: [o!.key], kind: "pick" });
      } else if (d?.kind === "action" && d.passKey) {
        await game.seat(d.seat).passPriority();
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.locationOf("cithria")).toBe("bf2"); // pulled out of base again — the move happened
    expect(game.zoneOf("cithria")).toBe("battlefield-bf2");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — declining The Boss: Cithria really dies (trash = a non-board zone), so Charm finds no legal target and fizzles", async () => {
    const game = await charmThenBlade();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("cithria")).toBe("trash");
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });
});
