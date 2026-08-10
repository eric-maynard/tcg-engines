/**
 * Ruling 458ef8af0331f288 — Soaring Scout (OGN-216 → ogn-216-298, 1 Might, Deathknell: channel 1 rune exhausted)
 *   × Sett, Brawler (OGN-164 → ogn-164-298, 4 Might) × Vanguard Helm (OGN-228 → ogn-228-298: "When a buffed
 *   friendly unit dies, buff another friendly unit.") × The Boss (OGN-269 → ogn-269-298, Sett legend: "If a buffed
 *   unit you control would die, you may pay [rainbow], exhaust me, and spend its buff to heal it, exhaust it, and
 *   recall it instead.")
 *
 * Q: A buffed Scout and an unbuffed Sett Brawler attack and both take lethal combat damage. Can Vanguard Helm move
 *    the Scout's buff onto Sett so The Boss can then save Sett?
 * A: No. Both die simultaneously in Combat Cleanup. The Boss's replacement needs Sett to be buffed at the moment he
 *    would die — he isn't. Helm only triggers AFTER the deaths; by then Sett is in the trash and can't be buffed.
 * Rules: 323.5 (simultaneous combat deaths), 366/372 (replacement applies at the would-die event), 383 (triggers
 *        go pending after the event), 106 (can't retroactively change a completed event).
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SCOUT = "ogn-216-298";
const SETT_BRAWLER = "ogn-164-298";
const VANGUARD_HELM = "ogn-228-298";
const THE_BOSS = "ogn-269-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1 (the Sett player) is the attacker on its own turn: legend The Boss (ready), Vanguard Helm in base, 1 rainbow
 * power (so The Boss COULD be paid), a buffed Soaring Scout (1+1) and an unbuffed Sett Brawler (4) in base, plus two
 * vanilla bystanders in base (legal "another friendly unit" for Helm). P2 holds bf1 with a 10-might Titan: its 10
 * combat damage is lethal to both attackers (2 + 4).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 0, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .legend(P1, THE_BOSS, "boss")
    .gear(P1, VANGUARD_HELM, "helm")
    .unit(P1, "base", SCOUT, "scout", { buffed: true })
    .unit(P1, "base", SETT_BRAWLER, "sett")
    .unit(P1, "base", { might: 2, name: "Bystander A" }, "byA")
    .unit(P1, "base", { might: 2, name: "Bystander B" }, "byB")
    .unit(P2, "bf1", { might: 10, name: "Titan" }, "titan");
}

/** Attack with both, pass focus both ways → combat damage is dealt; stop at the first real prompt. */
async function attackAndTakeLethal(game: Game): Promise<Decision | null> {
  expect(game.state("scout")).toMatchObject({ isBuffed: true, might: 2 });
  expect(game.state("sett")).toMatchObject({ isBuffed: false, might: 4 });
  await game.p1.move(["scout", "sett"], "bf1");
  const s = await game.settle();
  expect(s.reason).toBe("unanswered");
  return game.decision();
}

describe("Ruling 458ef8af0331f288 — Helm can't hand the Scout's buff to Sett in time for The Boss to save him", () => {
  test("at the would-die moment The Boss's optional replacement is offered exactly once — Sett has no buff to spend, so only the Scout qualifies", async () => {
    const game = await board().build();
    const d = await attackAndTakeLethal(game);
    expect(d).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "boss" } });
    // Nothing has died yet and no Helm trigger exists yet: the replacement window precedes the deaths.
    expect(game.zoneOf("scout")).toBe("battlefield-bf1");
    expect(game.zoneOf("sett")).toBe("battlefield-bf1");
    expect(game.state("sett").isBuffed).toBe(false);
    expect(game.chain().some((c) => c.cardId === "helm")).toBe(false);
    await game.p1.no();
    // Declined for the Scout → there is no second offer for Sett; both die together.
    expect(game.decision()?.kind).not.toBe("yes-no");
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.zoneOf("sett")).toBe("trash");
    expect(game.state("boss").isExhausted).toBe(false);
    expect(game.p1.power("rainbow")).toBe(1);
  });

  test("Vanguard Helm's trigger only goes on the chain AFTER the simultaneous deaths — Sett is already in the trash and is not a legal unit to buff", async () => {
    const game = await board().build();
    await attackAndTakeLethal(game);
    await game.p1.no();
    // Both are dead BEFORE Helm's trigger asks for its target.
    expect(game.zoneOf("sett")).toBe("trash");
    expect(game.zoneOf("scout")).toBe("trash");
    const pick = game.decision();
    expect(pick).toMatchObject({ kind: "pick", seat: P1, semantics: "target", source: { cardId: "helm" } });
    const offered = (pick as Extract<Decision, { kind: "pick" }>).options.map((o) => o.card ?? o.key).sort();
    expect(offered).toEqual(["byA", "byB"]); // living friendly units only — never the dead Sett (or Scout)
    expect(offered).not.toContain("sett");
    await game.p1.pick("byA");
    // P1 controls two simultaneous triggers (Helm + Scout's Deathknell); accept the listed order if offered.
    await game.acceptTriggerOrder();
    expect(game.chain().map((c) => c.cardId).sort()).toEqual(["helm", "scout"]);
    await game.settle();
    expect(game.state("byA").isBuffed).toBe(true);
    expect(game.zoneOf("sett")).toBe("trash"); // never saved
    expect(game.state("boss").isExhausted).toBe(false); // The Boss never got to act for Sett
  });

  test("contrast — accepting The Boss saves the SCOUT (the buffed one): it is healed, exhausted, recalled with its buff spent; Sett still dies and Helm does not trigger at all", async () => {
    const game = await board().build();
    await attackAndTakeLethal(game);
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("scout")).toBe("base");
    expect(game.state("scout")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true });
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.p1.power("rainbow")).toBe(0);
    expect(game.zoneOf("sett")).toBe("trash");
    // No buffed unit died → Helm never triggered → nobody got a buff.
    expect(game.state("byA").isBuffed).toBe(false);
    expect(game.state("byB").isBuffed).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
