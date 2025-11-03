import natural from "natural";

// Tokenizador de palabras (separa en unidades alfanuméricas)
const separador = new natural.WordTokenizer();

/**
 * Calcula una métrica tipo ROUGE-L (subsecuencia común más larga normalizada).
 * @param {string} referencia - Respuesta humana o de referencia.
 * @param {string} generada - Respuesta del modelo LLM.
 * @returns {number} Valor de similitud entre 0 y 1.
 */
function calcularRougeL(referencia, generada) {
  const refTokens = separador.tokenize(referencia.toLowerCase());
  const genTokens = separador.tokenize(generada.toLowerCase());

  const subsecuencia = obtenerSubsecuenciaComun(refTokens, genTokens);
  if (refTokens.length === 0) return 0;
  return subsecuencia.length / refTokens.length;
}

/**
 * Encuentra la subsecuencia común más larga (LCS) entre dos listas de tokens.
 * Devuelve el arreglo con la subsecuencia, no solo la longitud.
 * @param {string[]} a - Primera secuencia.
 * @param {string[]} b - Segunda secuencia.
 * @returns {string[]} Subsecuencia común más larga.
 */
function obtenerSubsecuenciaComun(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  // Llenar matriz dinámica
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Reconstrucción de la subsecuencia
  const secuencia = [];
  let i = m,
    j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      secuencia.unshift(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return secuencia;
}

/**
 * Calcula la puntuación de calidad entre dos textos (ref vs. LLM).
 * Wrapper asíncrono para uso uniforme en pipelines.
 */
export async function evaluarCalidad(respuestaRef, respuestaLLM) {
  return calcularRougeL(respuestaRef, respuestaLLM);
}
