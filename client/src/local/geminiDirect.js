// Talks to Google Gemini straight from the phone with the user's own API key.
// Mirrors server/routes/ai.js: same prompts and models (shared/aiPrompts.mjs), same fallback merge.
import {
  GEMINI_MODELS,
  ESTIMATE_TEMPERATURE,
  SURPRISE_TEMPERATURE,
  buildEstimatePrompt,
  normalizeEstimate,
  buildSurprisePrompt,
} from '../../../shared/aiPrompts.mjs';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { offlineEstimate } from './offlineEstimate';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

// One HTTP call -> { status, json }. On the phone it goes through native HTTP (no WebView CORS);
// in a browser it uses fetch with a timeout.
async function http(method, url, key, data, ms) {
  const headers = { 'x-goog-api-key': key };
  if (data) headers['Content-Type'] = 'application/json';
  if (Capacitor.isNativePlatform()) {
    const r = await CapacitorHttp.request({ method, url, headers, data, connectTimeout: ms, readTimeout: ms });
    let json = r.data;
    if (typeof json === 'string') {
      try { json = JSON.parse(json); } catch { /* keep the raw string */ }
    }
    return { status: r.status, json };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { method, headers, body: data ? JSON.stringify(data) : undefined, signal: ctrl.signal });
    const json = await r.json().catch(() => null);
    return { status: r.status, json };
  } finally {
    clearTimeout(timer);
  }
}

// Tries each model in turn; overload/quota/retired-model responses move on to the next one.
async function generate(key, parts, temperature) {
  let lastErr = new Error('Gemini request failed');
  for (const model of GEMINI_MODELS) {
    const { status, json } = await http(
      'POST',
      `${BASE}/models/${model}:generateContent`,
      key,
      { contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', temperature } },
      60000
    );
    if (status >= 200 && status < 300) {
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Empty response from Gemini');
      return JSON.parse(text);
    }
    lastErr = new Error(`Gemini ${status}`);
    if (![429, 503, 404].includes(status)) throw lastErr;
  }
  throw lastErr;
}

export async function estimateDish(key, body, lang) {
  const fallback = offlineEstimate({ ...body, lang });
  const parts = [];
  if (body.imageBase64) {
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: body.imageBase64.replace(/^data:image\/\w+;base64,/, '') } });
  }
  parts.push({
    text: buildEstimatePrompt({
      name: body.name,
      description: body.description,
      weightGram: body.weightGram,
      quantity: body.quantity,
      unit: body.unit,
      size: body.size,
      hasPhoto: !!body.imageBase64,
      lang,
    }),
  });
  const parsed = await generate(key, parts, ESTIMATE_TEMPERATURE);
  return normalizeEstimate(parsed, fallback);
}

export async function surprise(key, body, lang) {
  const remaining = Math.max(100, body.remainingCals || 500);
  const prompt = buildSurprisePrompt({ remaining, savedRecipes: body.savedRecipes, goalDirection: body.goalDirection, lang });
  const suggestions = await generate(key, [{ text: prompt }], SURPRISE_TEMPERATURE);
  if (!Array.isArray(suggestions)) throw new Error('Unexpected Gemini reply');
  return { suggestions };
}

// 'ok' | 'invalid' | 'network'
export async function testKey(key) {
  try {
    const { status } = await http('GET', `${BASE}/models?pageSize=1`, key, null, 15000);
    if (status >= 200 && status < 300) return 'ok';
    return status === 400 || status === 401 || status === 403 ? 'invalid' : 'network';
  } catch {
    return 'network';
  }
}
