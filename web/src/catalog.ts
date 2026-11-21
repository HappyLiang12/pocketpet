export interface PetSummary {
  id: string;
  source?: "local" | "petdex";
  slug?: string;
  name: string;
  spriteUrl: string;
}

export const PET_WINDOW = 50;

export function filterPets(pets: PetSummary[], query: string, limit = PET_WINDOW): PetSummary[] {
  const local = pets.filter((pet) => pet.id.startsWith("local:"));
  const remote = pets.filter((pet) => !pet.id.startsWith("local:"));
  const needle = query.trim().toLowerCase();
  const matched = needle === ""
    ? remote
    : remote.filter((pet) => pet.name.toLowerCase().includes(needle) || (pet.slug ?? "").toLowerCase().includes(needle));
  return [...local, ...matched.slice(0, limit)];
}
