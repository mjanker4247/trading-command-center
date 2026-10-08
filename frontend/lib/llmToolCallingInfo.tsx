/** Shared copy for the model-picker tool-calling info popover. */

export function LlmToolCallingInfoContent() {
  return (
    <div className="space-y-2.5">
      <p>
        Market and news analysts need models that return structured{" "}
        <span className="font-mono text-[11px] text-fg">tool_calls</span>
        — not JSON pasted into the reply. Social sentiment prefetches data and
        does not depend on tool calling.
      </p>
      <div>
        <p className="font-medium text-fg mb-0.5">Usually reliable</p>
        <ul className="list-disc pl-3.5 space-y-0.5">
          <li>OpenAI (gpt-4.1, gpt-4o, gpt-5.x)</li>
          <li>Anthropic Claude</li>
          <li>Google Gemini 2.5 / 3.x</li>
          <li>Groq (Llama tool APIs often work)</li>
        </ul>
      </div>
      <div>
        <p className="font-medium text-fg mb-0.5">IONOS</p>
        <p>
          Prefer <span className="font-mono text-[11px] text-fg">openai/gpt-oss-120b</span>.
          Llama 3.3 70B often dumps tool JSON as text — news reports look empty.
        </p>
      </div>
      <div>
        <p className="font-medium text-fg mb-0.5">Uneven</p>
        <p>Ollama / vLLM / LM Studio depend on the model; DeepSeek reasoner and MiniMax M2 have tool_choice quirks.</p>
      </div>
      <p className="text-muted">
        Full guide: <span className="font-mono text-[11px]">docs/llm-tool-calling.md</span>
      </p>
    </div>
  );
}
