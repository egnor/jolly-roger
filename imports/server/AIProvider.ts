import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import Logger from "../Logger";

/**
 * Abstract interface for AI providers that can generate hunt summaries.
 */
export interface AIProvider {
  name: string;
  generateSummary(prompt: string): Promise<string>;
  isAvailable(): boolean;
}

/**
 * OpenAI implementation using GPT-4.
 */
class OpenAIProvider implements AIProvider {
  name = "openai";
  private client: OpenAI | null;

  constructor() {
    this.client = process.env.OPENAI_API_KEY
      ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      : null;
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  async generateSummary(prompt: string): Promise<string> {
    if (!this.client) {
      throw new Error("OpenAI not configured - OPENAI_API_KEY environment variable not set");
    }

    const completion = await this.client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant analyzing puzzle hunt activity. Provide concise, well-organized summaries that highlight key achievements and suggest priorities.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 1500,
    });

    // Log token usage and estimated cost
    // GPT-4o pricing (as of 2024): $2.50 per 1M input tokens, $10.00 per 1M output tokens
    const usage = completion.usage;
    if (usage) {
      const inputCost = (usage.prompt_tokens / 1_000_000) * 2.50;
      const outputCost = (usage.completion_tokens / 1_000_000) * 10.00;
      const totalCost = inputCost + outputCost;

      Logger.info("OpenAI API call completed", {
        model: "gpt-4o",
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
        estimatedCost: `$${totalCost.toFixed(4)}`,
      });
    }

    return (
      completion.choices[0]?.message?.content || "Unable to generate summary"
    );
  }
}

/**
 * Anthropic Claude implementation using Claude 3.5 Sonnet.
 */
class ClaudeProvider implements AIProvider {
  name = "anthropic";
  private client: Anthropic | null;

  constructor() {
    this.client = process.env.ANTHROPIC_API_KEY
      ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      : null;
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  async generateSummary(prompt: string): Promise<string> {
    if (!this.client) {
      throw new Error("Anthropic not configured - ANTHROPIC_API_KEY environment variable not set");
    }

    const message = await this.client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });

    // Log token usage and estimated cost
    // Claude 3.5 Sonnet pricing (as of 2024): $3.00 per 1M input tokens, $15.00 per 1M output tokens
    const usage = message.usage;
    if (usage) {
      const inputCost = (usage.input_tokens / 1_000_000) * 3.00;
      const outputCost = (usage.output_tokens / 1_000_000) * 15.00;
      const totalCost = inputCost + outputCost;

      Logger.info("Anthropic API call completed", {
        model: "claude-3-5-sonnet-20241022",
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        estimatedCost: `$${totalCost.toFixed(4)}`,
      });
    }

    const firstBlock = message.content[0];
    if (firstBlock && firstBlock.type === "text") {
      return firstBlock.text;
    }
    return "Unable to generate summary";
  }
}

/**
 * Factory function to get the configured AI provider.
 * Defaults to OpenAI if no provider is specified or if the specified provider is unavailable.
 *
 * @throws {Error} If no AI provider is available (no API keys configured)
 */
export function getAIProvider(): AIProvider {
  const providerName = process.env.AI_PROVIDER || "openai";

  const provider =
    providerName === "anthropic"
      ? new ClaudeProvider()
      : new OpenAIProvider();

  if (!provider.isAvailable()) {
    throw new Error(
      `AI provider "${provider.name}" not configured. Please set ${provider.name === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY"} environment variable.`
    );
  }

  return provider;
}
