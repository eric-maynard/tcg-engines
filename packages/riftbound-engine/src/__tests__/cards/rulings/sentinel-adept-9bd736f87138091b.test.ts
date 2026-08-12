/**
 * Ruling 9bd736f87138091b — [Weaponmaster] and Equipment already worn by another friendly unit.
 *   Cards: Sentinel Adept (SFD-008 → sfd-008-221) · 3 · 3 [Might] "[Weaponmaster] (When you play me,
 *     you may [Equip] one of your Equipment to me for [rainbow] less, even if it's already attached.)"
 *   × Serrated Dirk (SFD-009 → sfd-009-221) Equipment "[Equip] [fury] … [Assault 2]".
 *
 * Q: Can a [Weaponmaster] unit take an Equipment off a friendly unit that is already wearing it?
 * A: Yes. [Weaponmaster] chooses an Equipment you control — including one attached elsewhere — and
 *    attaches it to itself. The whole thing is voluntary: you may decline and leave it where it is.
 * Rules: 821 / 821.1.b-c ([Weaponmaster]: on play, you may Equip one of your Equipment to me for
 *    [rainbow] less, even if attached), 150.4 (attached Equipment is a gear object you control),
 *    383.3.a ("you may" is decided at finalization).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const SENTINEL_ADEPT = "sfd-008-221";
const SERRATED_DIRK = "sfd-009-221";

/** P1's turn: a Squire already wearing the Dirk, and the Adept in hand with 3 energy + [fury]. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { fury: 1 } })
    .unit(P1, "base", { might: 2, name: "Squire" }, "squire", { equippedWith: ["dirk"] })
    .gear(P1, SERRATED_DIRK, "dirk", { attachedTo: "squire" })
    .hand(P1, SENTINEL_ADEPT, "adept");
}

async function played(): Promise<Game> {
  const game = await board().build();
  expect(game.state("dirk").attachedTo).toBe("squire");
  expect(game.state("squire").attachments).toEqual(["dirk"]);
  await game.p1.play("adept");
  return game;
}

describe("Ruling 9bd736f87138091b — [Weaponmaster] may take a friendly unit's Equipment", () => {
  test("the already-attached Dirk IS offered to the incoming Weaponmaster", async () => {
    const game = await played();
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    if (d?.kind === "pick") {
      expect(d.options.map((o) => o.card ?? o.key)).toContain("dirk");
    }
  });

  test("choosing it detaches it from the Squire and attaches it to the Adept", async () => {
    const game = await played();
    await game.p1.pick("dirk");
    await game.settle();
    expect(game.state("dirk").attachedTo).toBe("adept");
    expect(game.state("adept").attachments).toContain("dirk");
    expect(game.state("squire").attachments).toEqual([]);
  });

  test("the Equipment's own text goes with it — the Adept now has [Assault 2], the Squire does not", async () => {
    const game = await played();
    await game.p1.pick("dirk");
    await game.settle();
    expect(game.state("adept").keywords).toContain("Assault");
    expect(game.state("squire").keywords ?? []).not.toContain("Assault");
  });

  test("it is voluntary: declining leaves the Dirk on the Squire and costs nothing", async () => {
    const game = await played();
    await game.p1.decline();
    await game.settle();
    expect(game.state("dirk").attachedTo).toBe("squire");
    expect(game.state("adept").attachments).toEqual([]);
    expect(game.p1.power("fury")).toBe(1); // the reduced Equip cost was never paid
  });

  test("the re-equip is paid at the reduced [Equip] cost — [fury] less [rainbow] is free", async () => {
    const game = await played();
    const before = game.p1.resources();
    await game.p1.pick("dirk");
    await game.settle();
    expect(game.p1.resources()).toEqual(before); // [fury] − [rainbow] = nothing left to pay
    expect(game.violations()).toEqual([]);
  });
});
