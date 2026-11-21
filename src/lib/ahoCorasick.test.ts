import { describe, it, expect } from "vitest";
import { AhoCorasick } from "./ahoCorasick";

describe("AhoCorasick", () => {
  it('can return every candidate tied at an ambiguous name without changing default matching', () => {
    const ac = new AhoCorasick([
      { word: 'Kapten Raka', data: 1 },
      { word: 'Kapten Raka', data: 2 },
      { word: 'Raka', data: 1 },
    ]);
    expect(ac.search('Kapten Raka').map(match => match.data)).toEqual([1]);
    expect(ac.search('Kapten Raka', true).map(match => match.data)).toEqual([1, 2]);
  });

  it("should match basic keywords with simple boundaries", () => {
    const ac = new AhoCorasick([
      { word: "Budi", data: { id: 1 } },
      { word: "Cinta", data: { id: 2 } },
      { word: "Ayah", data: { id: 3 } },
    ]);

    const result = ac.search("Budi Cinta Ayah");
    expect(result.length).toBe(3);
    
    expect(result[0].keyword).toBe("Budi");
    expect(result[0].start).toBe(0);
    expect(result[0].end).toBe(4);
    
    expect(result[1].keyword).toBe("Cinta");
    expect(result[1].start).toBe(5);
    expect(result[1].end).toBe(10);
    
    expect(result[2].keyword).toBe("Ayah");
    expect(result[2].start).toBe(11);
    expect(result[2].end).toBe(15);
  });

  it("should ignore substrings that are not strictly bounded by word boundaries", () => {
    const ac = new AhoCorasick([
      { word: "Budi", data: { id: 1 } },
      { word: "Anto", data: { id: 2 } },
    ]);

    // "An" is not a word boundary for Anto. Wait, let's look at the boundary check in ahoCorasick.ts.
    // const isPrevBoundary = !/[a-zA-Z0-9]/.test(prevChar);
    // So "xBudiy" won't match "Budi".
    const result = ac.search("xBudi y Antox");
    expect(result.length).toBe(0);
  });

  it("should handle overlapping keywords and pick the longest match", () => {
    const ac = new AhoCorasick([
      { word: "Budi", data: { id: 1 } },
      { word: "Budianto", data: { id: 2 } },
      { word: "Anto", data: { id: 3} }
    ]);

    const result = ac.search("Budianto");
    expect(result.length).toBe(1);
    expect(result[0].keyword).toBe("Budianto");
    expect(result[0].start).toBe(0);
    expect(result[0].end).toBe(8);
  });

  it("should match names with Indonesian suffix particles and include them in range", () => {
    const ac = new AhoCorasick([{ word: "Kael", data: { id: 1 } }]);

    const result = ac.search("Kaelnya pergi, lalu Kaelpun datang. Bukan Kaelx.");
    // "Kaelnya" & "Kaelpun" cocok (akhiran), "Kaelx" tidak.
    expect(result.length).toBe(2);

    expect(result[0].keyword).toBe("Kael");
    expect(result[0].start).toBe(0);
    expect(result[0].end).toBe(7); // mencakup "Kaelnya"

    expect(result[1].start).toBe(20);
    expect(result[1].end).toBe(27); // mencakup "Kaelpun"
  });

  it("should accurately capture multiple overlapping but separated keywords", () => {
     const ac = new AhoCorasick([
       { word: "Bapak", data: { id: 1 } },
       { word: "Ibu", data: { id: 2 } }
     ]);

     const result = ac.search("Bapak Ibu Bapak");
     expect(result.length).toBe(3);
     expect(result[0].keyword).toBe("Bapak");
     expect(result[1].keyword).toBe("Ibu");
     expect(result[2].keyword).toBe("Bapak");
  });
});
