/**
 * Riftbound set metadata
 */

export interface SetInfo {
  readonly id: string;
  readonly name: string;
  readonly cardCount: number;
}

export const SETS: Record<string, SetInfo> = {
  OGN: { cardCount: 298, id: "OGN", name: "Origins" },
  OGS: { cardCount: 24, id: "OGS", name: "Origins Showcase" },
  SFD: { cardCount: 222, id: "SFD", name: "Spiritforged" },
  UNL: { cardCount: 225, id: "UNL", name: "Unleashed" },
};
