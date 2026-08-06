import { getAllCards } from "./src/data/all-cards";
for (const id of process.argv.slice(2)) {
  const c = getAllCards().find((c: any) => c.id === id);
  console.log(id, JSON.stringify(c?.abilities, null, 1), (c as any)?.timing);
}
