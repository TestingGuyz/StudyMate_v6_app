// Groq API client
// Model: meta-llama/llama-4-scout-17b-16e-instruct

import { Platform } from 'react-native';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
/** Vision-capable model — required for image inputs (focus timer, grader, etc.) */
const VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

// Token limits per use case
export const TOKEN_LIMITS = {
  doubt_solver: 1800,
  vision_question: 1500,
  answer_grader: 1200,
  quiz_generator: 2200,
  notes_generator: 1800,
  ai_nudge: 200,
  concept_explainer: 800,
  baseline_analysis: 900,
  diagnostic_generator: 4000,
  schedule_planner: 2000,
  report_generation: 1200,
  mood_quote: 400,
  voice_mode: 800,
  slot_extractor: 2500,
  wellness_insight: 600,
  focus_check: 60, // minimal — just needs "FOCUSED" or "DISTRACTED"
} as const;

// Temperature per use case
export const TEMPERATURES = {
  quiz: 0.2,
  grading: 0.2,
  notes: 0.2,
  doubt_solver: 0.4,
  nudge: 0.7,
  motivation: 0.7,
} as const;

export type GroqUseCase = keyof typeof TOKEN_LIMITS;

export type ApiConfig = { key: string; url: string; model: string };

async function loadApiKeys(): Promise<{ groqKey?: string; orKey?: string; customModel?: string }> {
  let groqKey: string | undefined;
  let orKey: string | undefined;
  let customModel: string | undefined;

  if (Platform.OS === 'web') {
    groqKey = localStorage.getItem('groq_api_key') || undefined;
    orKey = localStorage.getItem('openrouter_api_key') || undefined;
    customModel = localStorage.getItem('custom_model') || undefined;
  } else {
    try {
      const SecureStore = require('expo-secure-store');
      groqKey = (await SecureStore.getItemAsync('groq_api_key')) || undefined;
      orKey = (await SecureStore.getItemAsync('openrouter_api_key')) || undefined;
      customModel = (await SecureStore.getItemAsync('custom_model')) || undefined;
    } catch {
      // Fallback
    }
  }

  if (!groqKey) groqKey = process.env.EXPO_PUBLIC_GROQ_API_KEY;
  if (!orKey) orKey = process.env.EXPO_PUBLIC_OPENROUTER_API_KEY;

  return { groqKey, orKey, customModel };
}

/** Returns true if any AI API key is available (Groq or OpenRouter). */
export async function hasAiApiKey(): Promise<boolean> {
  const { groqKey, orKey } = await loadApiKeys();
  return !!(groqKey || orKey);
}

async function getApiConfig(): Promise<ApiConfig> {
  const { groqKey, orKey, customModel } = await loadApiKeys();

  if (orKey) {
    return {
      key: orKey,
      url: OPENROUTER_API_URL,
      model: customModel || 'meta-llama/llama-3.1-8b-instruct:free',
    };
  }
  if (groqKey) {
    return {
      key: groqKey,
      url: GROQ_API_URL,
      model: customModel || MODEL,
    };
  }

  throw new Error('API key not configured. Add Groq or OpenRouter key in Settings.');
}

/**
 * Vision requests must use a multimodal model. Prefer Groq scout even when OpenRouter is set for text.
 */
async function getVisionApiConfig(): Promise<ApiConfig> {
  const { groqKey, orKey, customModel } = await loadApiKeys();

  if (groqKey) {
    return { key: groqKey, url: GROQ_API_URL, model: VISION_MODEL };
  }
  if (orKey) {
    return {
      key: orKey,
      url: OPENROUTER_API_URL,
      model: customModel?.includes('scout') || customModel?.includes('vision')
        ? customModel
        : VISION_MODEL,
    };
  }

  throw new Error('API key not configured. Add Groq API key in Settings for focus detection.');
}

export interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

export interface GroqResponse {
  choices: Array<{
    message: {
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Call Groq API with retry logic.
 * Never shows raw API errors — returns user-friendly messages.
 */
export async function callGroq(
  messages: GroqMessage[],
  useCase: GroqUseCase,
  temperature?: number,
  configOverride?: ApiConfig
): Promise<string> {
  const config = configOverride ?? await getApiConfig();
  const maxTokens = TOKEN_LIMITS[useCase];
  const temp = temperature ?? getTemperatureForUseCase(useCase);

  let lang = 'English';
  if (Platform.OS === 'web') {
    lang = localStorage.getItem('app_language') || 'English';
  } else {
    try {
      const SecureStore = require('expo-secure-store');
      lang = await SecureStore.getItemAsync('app_language') || 'English';
    } catch {}
  }

  const modifiedMessages = [...messages];
  if (lang !== 'English') {
    const sysIdx = modifiedMessages.findIndex(m => m.role === 'system');
    const langInstruction = `\n\nCRITICAL INSTRUCTION: You MUST communicate entirely in ${lang}. All explanations, questions, and responses MUST be in ${lang}.`;
    if (sysIdx >= 0) {
      if (typeof modifiedMessages[sysIdx].content === 'string') {
        modifiedMessages[sysIdx] = { ...modifiedMessages[sysIdx], content: modifiedMessages[sysIdx].content + langInstruction };
      }
    } else {
      modifiedMessages.unshift({ role: 'system', content: langInstruction });
    }
  }

  let lastError = '';

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(config.url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://studymate.ai',
          'X-Title': 'StudyMate AI',
        },
        body: JSON.stringify({
          model: config.model,
          messages: modifiedMessages,
          max_tokens: maxTokens,
          temperature: temp,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`AI API error (${response.status}):`, errorBody);
        if (response.status === 429) {
          // Rate limited — wait and retry
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        if (response.status === 401) {
          throw new Error('Invalid API key. Please check your Groq API key in Settings.');
        }
        lastError = `API error ${response.status}`;
        continue;
      }

      const data: GroqResponse = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        lastError = 'Empty response from AI';
        continue;
      }

      return content;
    } catch (error: any) {
      if (error.message?.includes('API key') || error.message?.includes('not configured')) {
        throw error;
      }
      lastError = error.message || 'Unknown error';
      if (attempt === 0) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  throw new Error('AI is taking too long — tap to retry');
}

/**
 * Call Groq with vision (image) support
 */
/** Strip data-URI prefix if present */
export function normalizeImageBase64(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^data:image\/[a-z+]+;base64,(.+)$/i);
  return match ? match[1] : trimmed;
}

export async function callGroqVision(
  systemPrompt: string,
  imageBase64: string,
  textPrompt: string,
  useCase: GroqUseCase
): Promise<string> {
  const config = await getVisionApiConfig();
  const cleanB64 = normalizeImageBase64(imageBase64);
  const messages: GroqMessage[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: {
            url: `data:image/jpeg;base64,${cleanB64}`,
          },
        },
        {
          type: 'text',
          text: textPrompt,
        },
      ],
    },
  ];

  return callGroq(messages, useCase, getTemperatureForUseCase(useCase), config);
}

/**
 * Parse JSON from Groq response with cleanup and retry
 */
export function parseGroqJSON<T>(response: string): T {
  // Try direct parse first
  try {
    return JSON.parse(response);
  } catch {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch {
        // continue to next attempt
      }
    }

    // Try to find JSON array or object
    const arrayMatch = response.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0]);
      } catch {
        // continue
      }
    }

    const objMatch = response.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]);
      } catch {
        // continue
      }
    }

    throw new Error('Failed to parse AI response as JSON');
  }
}

function getTemperatureForUseCase(useCase: GroqUseCase): number {
  switch (useCase) {
    case 'quiz_generator':
    case 'answer_grader':
    case 'notes_generator':
    case 'schedule_planner':
    case 'voice_mode':
    case 'slot_extractor':
      return TEMPERATURES.quiz;
    case 'doubt_solver':
    case 'concept_explainer':
      return TEMPERATURES.doubt_solver;
    case 'ai_nudge':
      return TEMPERATURES.nudge;
    case 'vision_question':
      return TEMPERATURES.doubt_solver;
    case 'focus_check':
      return 0.1;
    default:
      return 0.4;
  }
}
