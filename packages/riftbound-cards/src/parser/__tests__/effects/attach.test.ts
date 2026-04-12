/**
 * Parser tests for attach / detach effects (Equipment).
 *
 * Covers activated, triggered, and spell ability forms of the
 * "attach <equipment> to <unit>" and "detach <equipment>" patterns
 * used by Equipment gear cards and cards that manipulate them.
 */

import { describe, expect, it } from "bun:test";
import { parseAbilities } from "../../index";

describe("Effect: Attach / Detach", () => {
  describe("attach self to unit", () => {
    it("parses 'Attach this to a unit you control.' as a spell", () => {
      const result = parseAbilities("Attach this to a unit you control.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            equipment: "self",
            to: expect.objectContaining({
              controller: "friendly",
              type: "unit",
            }),
            type: "attach",
          }),
          type: "spell",
        }),
      );
    });

    it("parses triggered 'When you play this from face down, attach it to a unit you control (here).'", () => {
      const result = parseAbilities(
        "When you play this from face down, attach it to a unit you control (here).",
      );

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      const ability = result.abilities?.[0];
      expect(ability?.type).toBe("triggered");
      expect(ability).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            equipment: "self",
            to: expect.objectContaining({
              controller: "friendly",
              type: "unit",
            }),
            type: "attach",
          }),
        }),
      );
    });
  });

  describe("attach another equipment to a unit (activated)", () => {
    it("parses Grandmaster at Arms: '[1], [Exhaust]: Attach a detached Equipment you control to a unit you control.'", () => {
      const result = parseAbilities(
        "[1], [Exhaust]: Attach a detached Equipment you control to a unit you control.",
      );

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      const ability = result.abilities?.[0];
      expect(ability?.type).toBe("activated");
      expect(ability).toEqual(
        expect.objectContaining({
          cost: expect.objectContaining({
            energy: 1,
            exhaust: true,
          }),
          effect: expect.objectContaining({
            equipment: expect.objectContaining({
              controller: "friendly",
              filter: "detached",
              type: "equipment",
            }),
            to: expect.objectContaining({
              controller: "friendly",
              type: "unit",
            }),
            type: "attach",
          }),
        }),
      );
    });

    it("parses '[Exhaust]: Attach an attached Equipment you control to a unit you control.'", () => {
      const result = parseAbilities(
        "[Exhaust]: Attach an attached Equipment you control to a unit you control.",
      );

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      const ability = result.abilities?.[0];
      expect(ability?.type).toBe("activated");
      expect(ability).toEqual(
        expect.objectContaining({
          cost: expect.objectContaining({ exhaust: true }),
          effect: expect.objectContaining({
            equipment: expect.objectContaining({
              controller: "friendly",
              filter: "attached",
              type: "equipment",
            }),
            to: expect.objectContaining({
              controller: "friendly",
              type: "unit",
            }),
            type: "attach",
          }),
        }),
      );
    });

    it("parses generic '[Exhaust]: Attach an Equipment you control to a unit you control.'", () => {
      const result = parseAbilities(
        "[Exhaust]: Attach an Equipment you control to a unit you control.",
      );

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      const ability = result.abilities?.[0];
      expect(ability?.type).toBe("activated");
      expect(ability).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            equipment: expect.objectContaining({
              controller: "friendly",
              type: "equipment",
            }),
            to: expect.objectContaining({
              controller: "friendly",
              type: "unit",
            }),
            type: "attach",
          }),
        }),
      );
    });
  });

  describe("detach equipment", () => {
    it("parses 'Detach an Equipment.' as a spell", () => {
      const result = parseAbilities("Detach an Equipment.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            equipment: expect.objectContaining({
              type: "equipment",
            }),
            type: "detach",
          }),
          type: "spell",
        }),
      );
    });

    it("parses 'detach an Equipment from it.' standalone", () => {
      const result = parseAbilities("detach an Equipment from it.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            equipment: expect.objectContaining({
              type: "equipment",
            }),
            type: "detach",
          }),
        }),
      );
    });

    it("parses 'Then detach an Equipment from it.' standalone", () => {
      const result = parseAbilities("Then detach an Equipment from it.");

      expect(result.success).toBe(true);
      expect(result.abilities).toHaveLength(1);
      expect(result.abilities?.[0]).toEqual(
        expect.objectContaining({
          effect: expect.objectContaining({
            equipment: expect.objectContaining({
              type: "equipment",
            }),
            type: "detach",
          }),
        }),
      );
    });
  });
});
