"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { upsertApiKey } from "@/lib/api";
import { LLM_SERVER_URL_PLACEHOLDERS, type LocalLlmProvider } from "@/lib/llmConfig";
import { BTN_PRIMARY_SM_CLASS, FIELD_INPUT_SM_CLASS, STATUS_CONFIGURED_CLASS, STATUS_ERROR_CLASS } from "@/lib/uiClasses";

interface ServerUrlRowProps {
  provider: LocalLlmProvider;
  label: string;
  isValid: boolean;
  onSaved: () => void;
}

export function ServerUrlRow({ provider, label, isValid, onSaved }: ServerUrlRowProps) {
  const [value, setValue] = useState("");

  const mutation = useMutation({
    mutationFn: () => upsertApiKey(provider, value),
    onSuccess: () => {
      setValue("");
      onSaved();
    },
  });

  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <div className="w-36 shrink-0">
        <div className="text-fg text-sm">{label}</div>
      </div>
      <span className={`w-28 shrink-0 ${isValid ? STATUS_CONFIGURED_CLASS : "text-xs text-muted"}`}>
        {isValid ? "Connected" : "Not configured"}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={LLM_SERVER_URL_PLACEHOLDERS[provider]}
        className={`${FIELD_INPUT_SM_CLASS} w-full sm:max-w-xs`}
      />
      <button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending || !value}
        className={BTN_PRIMARY_SM_CLASS}
      >
        {mutation.isPending ? "Saving…" : "Save URL"}
      </button>
      {mutation.isError && (
        <span className={STATUS_ERROR_CLASS}>{(mutation.error as Error).message}</span>
      )}
    </div>
  );
}
