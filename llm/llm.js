import OpenAI from "openai";

// Inicializa cliente con la clave de API del entorno
const clienteAI = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Selección del modelo (por defecto: gpt-3.5-turbo)
const MODELO_LLM = process.env.OPENAI_MODEL || "gpt-3.5-turbo";

/**
 * Envía un mensaje al modelo LLM con control de reintentos y backoff exponencial.
 * @param {string} prompt - Texto o instrucción a enviar al modelo.
 * @param {number} maxIntentos - Número máximo de reintentos permitidos (por defecto 3).
 * @returns {Promise<{texto: string, reintentos: number}>}
 */
export async function solicitarRespuestaLLM(prompt, maxIntentos = 3) {
  let intento = 0;

  while (intento < maxIntentos) {
    try {
      const respuesta = await clienteAI.chat.completions.create({
        model: MODELO_LLM,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
      });

      const texto = respuesta.choices?.[0]?.message?.content?.trim() || "";
      return { texto, reintentos: intento };
    } catch (error) {
      intento++;
      const mensajeError = (error?.message || "").toLowerCase();

      // Caso: límite de uso o cuota
      if (mensajeError.includes("quota")) {
        console.warn("Límite de cuota alcanzado. Esperando 1 hora antes de reintentar...");
        await esperar(60 * 60 * 1000);
        continue;
      }

      // Backoff exponencial en otros errores
      if (intento < maxIntentos) {
        const espera = Math.min(1000 * 2 ** intento, 60_000);
        console.warn(`Intento ${intento} fallido. Reintentando en ${espera / 1000}s...`);
        await esperar(espera);
      } else {
        throw new Error(`El modelo falló tras ${intento} intentos: ${error.message}`);
      }
    }
  }
}

/** 
 * Promesa auxiliar para pausar ejecución.
 * @param {number} ms - Milisegundos a esperar.
 */
function esperar(ms) {
  return new Promise((res) => setTimeout(res, ms));
}
