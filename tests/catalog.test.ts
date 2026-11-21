import { describe, expect, it } from "vitest";
import { filterPets, type PetSummary } from "../web/src/catalog.js";

const local = (name: string): PetSummary => ({ id: `local:${name}`, name, spriteUrl: `/local/${name}` });
const remote = (index: number): PetSummary => ({ id: `petdex:gallery-${index}`, slug: `gallery-${index}`, name: `Gallery Pet ${index}`, spriteUrl: `/gallery/${index}` });

describe("filterPets", () => {
  it("keeps local pets first and caps remote results", () => {
    const pets = [local("boba"), ...Array.from({ length: 60 }, (_, index) => remote(index + 1))];
    const result = filterPets(pets, "");
    expect(result).toHaveLength(51);
    expect(result[0]?.id).toBe("local:boba");
  });

  it("filters remote pets by name or slug without hiding locals", () => {
    const pets = [local("boba"), remote(42), remote(43)];
    expect(filterPets(pets, "gallery pet 42").map((pet) => pet.id)).toEqual(["local:boba", "petdex:gallery-42"]);
    expect(filterPets(pets, "GALLERY-43").map((pet) => pet.id)).toEqual(["local:boba", "petdex:gallery-43"]);
    expect(filterPets(pets, "nope").map((pet) => pet.id)).toEqual(["local:boba"]);
  });
});
