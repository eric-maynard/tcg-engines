/**
 * Ruling 5f8423a8a38eccf8 — Blitzcrank, Impassive (OGN-067 → ogn-067-298) · 5 Might [Tank]
 *     "When you play me to a battlefield, you may move an enemy unit to here. …"
 *   × Charm (OGN-043 → ogn-043-298) · Action [1] "Move an enemy unit."
 *
 * Q: Can Blitzcrank move enemies from one battlefield to another battlefield?
 * A: Yes. Only the Standard Move restricts battlefield→battlefield movement; moves performed by effects (Blitzcrank,
 *    Charm) have no restriction on the source of the target — Charm can likewise move a unit battlefield→battlefield.
 * Rules: 140.3 / 447 (moves by effects vs. the Standard Move), 108.4.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BLITZCRANK = "ogn-067-298";
const CHARM = "ogn-043-298";

/** P1's turn. P1 holds bf1 (Holder); P2 holds bf2 with a Raider AT A BATTLEFIELD and a Homebody in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .battlefield("bf3", { controller: null })
    .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 4, name: "Raider" }, "raider")
    .unit(P2, "base", { might: 1, name: "Homebody" }, "homebody")
    .hand(P1, BLITZCRANK, "blitz")
    .hand(P1, CHARM, "charm");
}

async function blitzToBf1(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("blitz", { to: "bf1" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blitz", controller: P1, triggered: true })]);
  await game.settle();
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 }); // "you may"
  await game.p1.yes();
  return game;
}

describe("Ruling 5f8423a8a38eccf8 — Blitzcrank (and Charm) may move an enemy unit battlefield → battlefield", () => {
  test("Blitzcrank's pull offers the Raider AT bf2 (a battlefield) as well as the Homebody in base — no source restriction", async () => {
    const game = await blitzToBf1();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["homebody", "raider"]);
  });

  test("picking the Raider moves it bf2 → bf1 ('here'): a battlefield-to-battlefield move by an effect", async () => {
    const game = await blitzToBf1();
    await game.p1.pick("raider");
    while (game.chain().some((c) => c.cardId === "blitz") && game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    expect(game.locationOf("raider")).toBe("bf1");
    expect(game.p2.units("bf2")).toEqual([]);
    expect(game.state("raider")).toMatchObject({ combatRole: "attacker", controller: P2 });
    await game.settle(); // the resulting combat: Raider 4 into Tank Blitz 5 + Holder → Raider dies
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("nuance — Charm ('Move an enemy unit') can also take the Raider from bf2 to ANOTHER battlefield (bf1 or open bf3), not just to base", async () => {
    const game = await board().build();
    const offered = (game.p1.option("cast", "charm")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toContain("raider");
    await game.p1.cast("charm", { targets: "raider" });
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const dests = d?.kind === "pick" ? d.options.map((o) => o.key) : [];
    expect(dests).toContain("battlefield-bf1");
    expect(dests).toContain("battlefield-bf3");
    expect(dests).not.toContain("battlefield-bf2"); // where it already is
    await game.p1.pick("battlefield-bf3");
    await game.settle();
    expect(game.locationOf("raider")).toBe("bf3");
    expect(game.zoneOf("charm")).toBe("trash");
  });

  test("contrast — the STANDARD move is the restricted one: P2's Raider at bf2 cannot simply walk to bf1 (no unit of P2's there / no Ganking)", async () => {
    const game = await board().active(P2).build();
    const r = await game.p2.try((p) => p.move("raider", "bf1"));
    expect(r.ok).toBe(false);
    expect(game.locationOf("raider")).toBe("bf2");
    // …but base is always fine.
    expect(game.p2.can("move")).toBe(true);
  });
});
