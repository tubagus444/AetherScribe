
export interface MatchResult {
  start: number;
  end: number;
  keyword: string;
  data: any;
}

class TrieNode {
  children: Map<string, TrieNode> = new Map();
  fail: TrieNode | null = null;
  output: { keyword: string; data: any }[] = [];
}

// Akhiran/partikel Indonesia yang boleh menempel pada nama (selaras dengan
// getCodexRegex di utils.ts). Mis. "Kaelnya", "Kaelpun", "Kaellah". (C4)
const INDONESIAN_SUFFIX = /^(nya|ku|mu|lah|kah|pun|toh)(?![a-zA-Z0-9])/i;

export class AhoCorasick {
  private root: TrieNode = new TrieNode();

  constructor(keywords: { word: string; data: any }[]) {
    this.buildTrie(keywords);
    this.buildFailureLinks();
  }

  private buildTrie(keywords: { word: string; data: any }[]) {
    for (const { word, data } of keywords) {
      if (!word) continue;
      let node = this.root;
      const lowerWord = word.toLowerCase();
      for (const char of lowerWord) {
        if (!node.children.has(char)) {
          node.children.set(char, new TrieNode());
        }
        node = node.children.get(char)!;
      }
      node.output.push({ keyword: word, data });
    }
  }

  private buildFailureLinks() {
    const queue: TrieNode[] = [];
    for (const child of this.root.children.values()) {
      child.fail = this.root;
      queue.push(child);
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const [char, child] of current.children) {
        let f = current.fail;
        while (f !== null && !f.children.has(char)) {
          f = f.fail;
        }
        child.fail = f ? f.children.get(char)! : this.root;
        // Merge output from failure link to handle substrings
        child.output.push(...child.fail.output);
        queue.push(child);
      }
    }
  }

  public search(text: string, includeTiedMatches = false): MatchResult[] {
    const results: MatchResult[] = [];
    let node = this.root;
    const lowerText = text.toLowerCase();

    for (let i = 0; i < lowerText.length; i++) {
        const char = lowerText[i];
        while (node !== this.root && !node.children.has(char)) {
            node = node.fail!;
        }
        node = node.children.get(char) || this.root;

        for (const out of node.output) {
            const start = i - out.keyword.length + 1;
            let end = i + 1;

            // Boundary check: pastikan kecocokan satu kata utuh, dengan toleransi
            // akhiran/partikel Indonesia (mis. "Kaelnya", "Kaelpun").
            const prevChar = start > 0 ? text[start - 1] : ' ';
            const isPrevBoundary = !/[a-zA-Z0-9]/.test(prevChar);
            if (!isPrevBoundary) continue;

            const nextChar = end < text.length ? text[end] : ' ';
            let isNextBoundary = !/[a-zA-Z0-9]/.test(nextChar);

            if (!isNextBoundary) {
                // Akhiran Indonesia langsung setelah nama → tetap dianggap cocok;
                // sertakan akhiran ke dalam rentang agar highlight mencakup kata penuh.
                const suffix = text.slice(end).match(INDONESIAN_SUFFIX);
                if (suffix) {
                    end += suffix[0].length;
                    isNextBoundary = true;
                }
            }

            if (isNextBoundary) {
                results.push({ start, end, keyword: out.keyword, data: out.data });
            }
        }
    }

    // Resolve overlaps: Keep longest match
    results.sort((a, b) => {
        if (a.start !== b.start) return a.start - b.start;
        return (b.end - b.start) - (a.end - a.start);
    });

    const finalResults: MatchResult[] = [];
    let lastStart = -1;
    let lastEnd = -1;
    for (const res of results) {
        if (res.start >= lastEnd || (includeTiedMatches && res.start === lastStart && res.end === lastEnd)) {
            lastStart = res.start;
            finalResults.push(res);
            lastEnd = res.end;
        }
    }

    return finalResults;
  }
}
