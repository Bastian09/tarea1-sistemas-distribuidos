import natural from 'natural';

const tokenizer = new natural.WordTokenizer();

function lcsLength(aTokens, bTokens) {
  const m = aTokens.length;
  const n = bTokens.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = (aTokens[i - 1] === bTokens[j - 1])
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

export function scorePair(referenceText, candidateText) {
  if (!referenceText || !candidateText) return 0;
  const ref = tokenizer.tokenize(String(referenceText).toLowerCase());
  const cand = tokenizer.tokenize(String(candidateText).toLowerCase());
  if (ref.length === 0) return 0;
  const lcs = lcsLength(ref, cand);
  return lcs / ref.length;
}

// Alias para compatibilidad con tu código original
export async function calculateQuality(ref, cand) {
  return scorePair(ref, cand);
}
