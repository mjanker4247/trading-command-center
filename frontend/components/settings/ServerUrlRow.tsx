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
  const inputId = `server-url-${provider}`;

  const mutation = useMutation({
    mutationFn: () => upsertApiKey(provider, value),
    onSuccess: () => {
      setValue("");
      onSaved();
    },
  });

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4 px-4 py-3">
      <div className="sm:w-36 shrink-0">
        <label htmlFor={inputId} className="text-fg text-sm">{label}</label>
      </div>
      <span className={`sm:w-28 shrink-0 ${isValid ? STATUS_CONFIGURED_CLASS : "text-xs text-muted"}`}>
        {isValid ? "Connected" : "Not configured"}
      </span>
      <input
        id={inputId}
        type="url"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={LLM_SERVER_URL_PLACEHOLDERS[provider]}
        autoComplete="off"
        className={`${FIELD_INPUT_SM_CLASS} w-full sm:max-w-xs`}
      />
      <button
        type="button"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending || !value}
        className={`${BTN_PRIMARY_SM_CLASS} shrink-0 w-full sm:w-auto`}
      >
        {mutation.isPending ? "Saving…" : "Save URL"}
      </button>
      {mutation.isError && (
        <span className={STATUS_ERROR_CLASS}>{(mutation.error as Error).message}</span>
      )}
    </div>
  );
}
