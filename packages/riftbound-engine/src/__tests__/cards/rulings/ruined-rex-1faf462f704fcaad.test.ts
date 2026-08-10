/**
 * Ruling 1faf462f704fcaad — Ruined Rex (UNL-067 → unl-067-219) · Unit · Mind · 6 Might
 *     "[Deathknell] — Deal 4 to an enemy unit."
 *   × Guardian Angel (SFD-051 → sfd-051-221) · Equipment · +1 · "If I would die, kill Guardian Angel instead. Heal me,
 *     exhaust me, and recall me."   worn by Irelia, Fervent (sfd-057-221) · 4 Might · [Deflect]
 *
 * Q: Rex and a Guardian-Angel'd Irelia trade lethal combat damage. Is Rex's Deathknell damage assigned before or
 *    after Guardian Angel? (Second question about dodging Deflect was not answered.)
 * A: Guardian Angel first. The Deathknell is queued as Rex dies, but it only resolves after combat cleanup; GA is a
 *    replacement effect applied at the moment Irelia would die — GA is killed, Irelia healed, exhausted and recalled
 *    to base — all before the Deathknell resolves. A Deathknell scoped to "here" would then miss her.
 * Rules: 808.1.d.2 (Deathknell queued on death), 466–467 (combat damage, deaths, cleanup, then chain), 372–373
 *        (replacement effects apply as the event happens), 812 (Deflect taxes choosing).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RUINED_REX = "unl-067-219";
const IRELIA_FERVENT = "sfd-057-221";
const GUARDIAN_ANGEL = "sfd-051-221";

type Pick = Extract<Decision, { kind: "pick" }>;

/**
 * P1's turn, one [rainbow] spare (for Deflect). P2 holds bf1 with a buffed Irelia wearing Guardian Angel
 * (4 + 1 GA + 1 buff = 6 — exactly lethal to Rex); P2 also has a Bystander (5) in base. Rex (6) in P1's base.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 0, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", IRELIA_FERVENT, "irelia", { buffed: true, equippedWith: ["ga"] })
    .card("ga", { def: GUARDIAN_ANGEL, meta: { attachedTo: "irelia" }, owner: P2, zone: "bf1" })
    .unit(P2, "base", { might: 5, name: "Bystander" }, "by")
    .unit(P1, "base", RUINED_REX, "rex");
}

/** Rex attacks Irelia; both pass focus; combat deals 6 each way. Stops at the first prompt after combat. */
async function tradeLethal(): Promise<Game> {
  const game = await board().build();
  expect(game.state("irelia")).toMatchObject({ attachments: ["ga"], might: 6 });
  expect(game.state("rex").might).toBe(6);
  await game.p1.move("rex", "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
  const d = game.decision();
  if (d?.kind === "distribute") {
    await game.seat(d.seat).distribute({ ...(d.defaultAllocation ?? {}) });
  }
  return game;
}

describe("Ruling 1faf462f704fcaad — Guardian Angel saves Irelia before Ruined Rex's Deathknell ever resolves", () => {
  test("after the lethal trade: Rex is dead with its Deathknell waiting on the chain, and Guardian Angel has ALREADY replaced Irelia's death — GA in trash, Irelia healed, exhausted and recalled to P2's base — before P1 even names the Deathknell's target", async () => {
    const game = await tradeLethal();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect((d as Pick).source?.cardId).toBe("rex");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rex", controller: P1, triggered: true })]);
    expect(game.zoneOf("rex")).toBe("trash");
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.zoneOf("irelia")).toBe("base");
    expect(game.state("irelia")).toMatchObject({ attachments: [], controller: P2, damage: 0, isExhausted: true, location: "base" });
    expect(game.state("irelia").might).toBe(5); // GA's +1 gone, buff kept
    expect(game.p2.trash()).not.toContain("irelia");
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1); // no attacker survived
  });

  test("so a Deathknell aimed 'here' would find nothing: Irelia is no longer at bf1 (nobody is); Rex's unscoped 'an enemy unit' still offers her — in BASE — alongside the Bystander, and P1 may simply pick the Bystander (4 damage, no Deflect paid)", async () => {
    const game = await tradeLethal();
    const d = game.decision() as Pick;
    expect(d.options.map((o) => o.card ?? o.key).sort()).toEqual(["by", "irelia"]);
    expect(game.cardsAt("bf1")).toEqual([]); // nothing is "here" any more
    expect(game.locationOf("irelia")).toBe("base");
    await game.p1.pick("by");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("by")).toMatchObject({ damage: 4, zone: "base" });
    expect(game.state("irelia").damage).toBe(0);
    expect(game.p1.power("rainbow")).toBe(1); // Deflect never came up
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("choosing the recalled Irelia instead costs the Deflect [rainbow] and hits her in base for 4 (5 Might — she survives): the Deathknell damage lands strictly AFTER Guardian Angel did its work", async () => {
    const game = await tradeLethal();
    await game.p1.pick("irelia");
    for (let i = 0; i < 3; i++) {
      const d = game.decision();
      if (d?.kind === "yes-no" && d.seat === P1) {
        await game.p1.yes(); // pay Deflect
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.power("rainbow")).toBe(0);
    expect(game.zoneOf("ga")).toBe("trash"); // GA was already spent on the combat death — it can't save her twice
    expect(game.state("irelia")).toMatchObject({ damage: 4, location: "base", zone: "base" });
  });
});
