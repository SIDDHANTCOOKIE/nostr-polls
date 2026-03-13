/**
 * AIService - Direct Ollama API client
 *
 * Calls Ollama HTTP API directly (no NRPC / relay overhead).
 * On native (Android/iOS): uses CapacitorHttp which makes requests at the
 *   native layer — bypasses WebView CORS and mixed-content restrictions entirely.
 * On web: requests to localhost:11434 will be blocked by CORS — users
 *   should install the native app from Zapstore.
 *
 * Config stored in localStorage under "ollama-ai-config":
 *   { url: "http://localhost:11434", model: "llama3" }
 */
import { CapacitorHttp } from "@capacitor/core";
import { isNative } from "../utils/platform";

export interface OllamaResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

interface AIServiceConfig {
  url: string;
  timeout?: number;
}

const CONFIG_KEY = "ollama-ai-config";
const DEFAULT_URL = "http://localhost:11434";

class AIService {
  private loadConfig(): AIServiceConfig {
    try {
      const stored = localStorage.getItem(CONFIG_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.url) {
          console.log("[AIService] loadConfig: using saved URL:", parsed.url);
          return { url: parsed.url, timeout: parsed.timeout };
        }
      }
    } catch (e) {
      console.warn("[AIService] loadConfig: failed to parse config:", e);
    }
    console.log("[AIService] loadConfig: using default URL:", DEFAULT_URL);
    return { url: DEFAULT_URL };
  }

  private getBaseUrl(): string {
    return this.loadConfig().url.replace(/\/$/, "");
  }

  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs = 60000
  ): Promise<Response> {
    if (isNative) {
      // CapacitorHttp bypasses WebView CORS and mixed-content restrictions
      const method = (options.method || "GET").toUpperCase();
      const headers = (options.headers as Record<string, string>) || {};
      const body = options.body as string | undefined;
      const res = await CapacitorHttp.request({
        url,
        method,
        headers,
        data: body ? JSON.parse(body) : undefined,
        connectTimeout: timeoutMs,
        readTimeout: timeoutMs,
      });
      // Wrap in a Response-like object
      const resBody = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
      return new Response(resBody, {
        status: res.status,
        headers: res.headers as any,
      });
    }
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(id);
    }
  }

  /**
   * Get list of available Ollama models.
   * GET /api/tags
   */
  async getModels(): Promise<OllamaResponse<{ models: { name: string }[] }>> {
    const url = `${this.getBaseUrl()}/api/tags`;
    console.log("[AIService] getModels: fetching", url);
    try {
      const res = await this.fetchWithTimeout(url, { method: "GET" }, 15000);
      console.log("[AIService] getModels: response status", res.status, res.statusText);
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.warn("[AIService] getModels: non-OK response body:", body);
        return { success: false, error: `Ollama returned ${res.status}: ${body}` };
      }
      const json = await res.json();
      console.log("[AIService] getModels: raw json:", JSON.stringify(json));
      const models: { name: string }[] = (json.models || []).map((m: any) => ({
        name: m.name,
      }));
      console.log("[AIService] getModels: parsed models:", models.map((m) => m.name));
      return { success: true, data: { models } };
    } catch (error: any) {
      console.error("[AIService] getModels: error:", error.name, error.message, error);
      if (error.name === "AbortError") {
        return { success: false, error: "Request timed out (15s). Is Ollama running and reachable?" };
      }
      return {
        success: false,
        error: error.message || "Failed to connect to Ollama",
      };
    }
  }

  /**
   * Generate text from a prompt.
   * POST /api/generate
   */
  async generate(params: {
    model: string;
    prompt: string;
    stream?: boolean;
  }): Promise<OllamaResponse<{ response: string }>> {
    try {
      if (!params.model || !params.prompt) {
        return { success: false, error: "model and prompt are required" };
      }

      const res = await this.fetchWithTimeout(
        `${this.getBaseUrl()}/api/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: params.model,
            prompt: params.prompt,
            stream: false,
          }),
        },
        60000
      );

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return { success: false, error: `Ollama error ${res.status}: ${text}` };
      }

      const json = await res.json();
      return { success: true, data: { response: json.response || "" } };
    } catch (error: any) {
      if (error.name === "AbortError") {
        return { success: false, error: "AI service timeout. The request took too long." };
      }
      return { success: false, error: error.message || "Failed to generate response" };
    }
  }

  /**
   * Translate text via Ollama.
   */
  async translateText(params: {
    model: string;
    text: string;
    targetLang: string;
  }): Promise<
    OllamaResponse<{
      detectedLang: string;
      needsTranslation: boolean;
      translation: string;
    }>
  > {
    const prompt = `Detect the language of the following text and translate it to "${params.targetLang}".
Return ONLY a JSON object with no markdown:
{"detectedLang":"<iso-639-1>","needsTranslation":<true|false>,"translation":"<translated text>"}
If the text is already in ${params.targetLang}, set needsTranslation to false and translation to the original text.

Text:
${params.text}

JSON:`;

    const result = await this.generate({ model: params.model, prompt });
    if (!result.success || !result.data?.response) {
      return { success: false, error: result.error || "Translation failed" };
    }

    try {
      const jsonMatch = result.data.response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          success: true,
          data: {
            detectedLang: parsed.detectedLang || "en",
            needsTranslation: parsed.needsTranslation === true || parsed.needsTranslation === "true",
            translation: parsed.translation || params.text,
          },
        };
      }
    } catch {
      // fall through
    }

    // Fallback: return raw response as translation
    return {
      success: true,
      data: {
        detectedLang: "unknown",
        needsTranslation: true,
        translation: result.data.response.trim(),
      },
    };
  }

  /**
   * Batch detect languages for multiple texts.
   */
  async batchDetectLanguages(params: {
    model: string;
    texts: string[];
  }): Promise<OllamaResponse<string[]>> {
    if (!params.texts || params.texts.length === 0) {
      return { success: true, data: [] };
    }

    const prompt = `Detect the language of each text below. Return ONLY a JSON array of ISO 639-1 language codes in the same order, no markdown.

Texts:
${params.texts.map((t, i) => `${i + 1}. ${t}`).join("\n")}

JSON array:`;

    const result = await this.generate({ model: params.model, prompt });
    if (!result.success || !result.data?.response) {
      return { success: false, error: result.error || "Language detection failed" };
    }

    try {
      const jsonMatch = result.data.response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const langs = JSON.parse(jsonMatch[0]);
        if (Array.isArray(langs)) return { success: true, data: langs };
      }
    } catch {
      // ignore
    }

    return { success: false, error: "Unexpected response format" };
  }

  /**
   * Enhance post with typo corrections and hashtag suggestions.
   */
  async enhancePost(params: {
    model: string;
    text: string;
  }): Promise<
    OllamaResponse<{
      typos: Array<{ original: string; correction: string; position: number }>;
      hashtags: string[];
      correctedText: string;
    }>
  > {
    const prompt = `You are a social media assistant. Analyze this post and suggest improvements.

IMPORTANT: Read the post carefully and suggest hashtags that are DIRECTLY related to the actual content and topics discussed in the post. DO NOT suggest generic or random hashtags.

Return ONLY a JSON object with this exact structure (no markdown, no extra text):

{
  "typos": [
    {"original": "wrong_word", "correction": "correct_word", "position": 0}
  ],
  "hashtags": ["specific", "relevant", "contextual"],
  "correctedText": "The corrected text"
}

Rules:
1. typos: Include spelling mistakes AND grammar errors (e.g., "your" vs "you're", "their" vs "there", subject-verb agreement, tense consistency, missing articles)
   - List each individual correction found
   - Include the exact wrong word/phrase and the correction
2. hashtags: Suggest 3-5 hashtags that are SPECIFICALLY about the topics mentioned in this post
   - Analyze what the post is actually about
   - Suggest hashtags that match those specific topics
   - DO NOT suggest generic hashtags like "life", "thoughts", "social"
   - If the post is about Bitcoin, suggest Bitcoin-related tags
   - If the post is about coding, suggest coding-related tags
   - Match the hashtags to the post's actual subject matter
3. correctedText: The text with ALL spelling and grammar corrections applied
   - Fix spelling mistakes
   - Fix grammar errors
   - Preserve the original meaning, tone, and style
   - Keep informal language if intentional (e.g., "gonna", "wanna" are okay)
4. Don't suggest hashtags already in the text

Post to analyze:
${params.text}

JSON:`;

    const result = await this.generate({ model: params.model, prompt });
    if (!result.success || !result.data?.response) {
      return { success: false, error: result.error || "Failed to generate suggestions" };
    }

    try {
      const jsonMatch = result.data.response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        return {
          success: true,
          data: {
            typos: data.typos || [],
            hashtags: data.hashtags || [],
            correctedText: data.correctedText || params.text,
          },
        };
      }
    } catch {
      // ignore
    }

    return {
      success: true,
      data: { typos: [], hashtags: [], correctedText: params.text },
    };
  }

  /**
   * Summarize long post content.
   */
  async summarizePost(params: {
    model: string;
    text: string;
  }): Promise<OllamaResponse<{ summary: string }>> {
    if (!params.model || !params.text) {
      return { success: false, error: "model and text are required" };
    }

    const prompt = `Summarize the following post in 2-3 concise sentences. Capture the main points and key ideas. Be clear and factual.

Post:
${params.text}

Summary:`;

    const result = await this.generate({ model: params.model, prompt });
    if (!result.success || !result.data?.response) {
      return { success: false, error: result.error || "Failed to generate summary" };
    }

    return { success: true, data: { summary: result.data.response.trim() } };
  }

  /**
   * Update Ollama URL configuration.
   */
  updateConfig(config: Partial<AIServiceConfig>): void {
    try {
      const current = this.loadConfig();
      localStorage.setItem(CONFIG_KEY, JSON.stringify({ ...current, ...config }));
    } catch (error) {
      console.error("Failed to update AI config:", error);
    }
  }
}

export const aiService = new AIService();
