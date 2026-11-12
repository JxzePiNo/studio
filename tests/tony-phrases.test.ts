import assert from "node:assert/strict";
import test from "node:test";
import { takeTonyPhrase, tonyPhrases, type PhraseDeck, type TonyPhraseContext } from "../lib/tony-phrases";

test("Tony exhausts every context deck before repeating and never repeats at a cycle boundary", () => {
  for (const context of Object.keys(tonyPhrases) as TonyPhraseContext[]) {
    let deck: PhraseDeck | undefined;
    let last = "";
    for (let cycle = 0; cycle < 3; cycle++) {
      const seen = new Set<string>();
      for (let index = 0; index < tonyPhrases[context].length; index++) {
        const next = takeTonyPhrase(context, deck, () => 0.75);
        assert.notEqual(next.phrase, last);
        assert.ok(!seen.has(next.phrase));
        seen.add(next.phrase); last = next.phrase;
        deck = JSON.parse(JSON.stringify(next.deck));
      }
      assert.equal(seen.size, tonyPhrases[context].length);
    }
  }
});

test("restored phrase decks discard removed copy and duplicates", () => {
  const phrase = tonyPhrases.home[2];
  const result = takeTonyPhrase("home", { remaining: ["Testo rimosso", phrase, phrase] });
  assert.equal(result.phrase, phrase);
  assert.deepEqual(result.deck.remaining, []);
});
