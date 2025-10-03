import 'dotenv/config';
import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
const DEFAULT_MAX_TOKENS = Number(process.env.OPENAI_MAX_TOKENS || 200);

export async function getLLMResponse(prompt, opts = {}) {
  const { maxTokens = DEFAULT_MAX_TOKENS, system = null } = opts;
  try {
    const messages = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: String(prompt) });

    const resp = await client.chat.completions.create({
      model: DEFAULT_MODEL,
      messages,
      max_tokens: maxTokens
    });

    return resp?.choices?.[0]?.message?.content ?? '';
  } catch (err) {
    console.error('LLM error:', err?.message || err);
    return '';
  }
}
