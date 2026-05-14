import { getAllCards } from "@tcg/riftbound-cards";

const cards = getAllCards();
const ids = ["ogn-250-298", "sfd-080-221", "ogn-280-298"];
for (const id of ids) {
  const c = cards.find((x) => x.id === id);
  if (!c) {continue;}
  console.log(`\n=== ${id} ${c.name} ===`);
  console.log("rulesText:", c.rulesText);
  console.log("abilities:", JSON.stringify((c as any).abilities, null, 2));
}

// Find Bullet Time
const bt = cards.find((c) => c.name === "Bullet Time");
console.log(`\n=== ${bt?.id} ${bt?.name} ===`);
console.log("rulesText:", bt?.rulesText);
console.log("abilities:", JSON.stringify((bt as any)?.abilities, null, 2));
