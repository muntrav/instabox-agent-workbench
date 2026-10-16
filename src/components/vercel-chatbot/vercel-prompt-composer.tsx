"use client";

import { type FormEvent, useEffect, useRef } from "react";

import { CornerDownLeftIcon, LoaderCircle, PlusIcon, SquareIcon } from "lucide-react";

import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";

type VercelPromptComposerProps = {
  value: string;
  disabled: boolean;
  sending: boolean;
  placeholder: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

// Adapted directly from Vercel Chatbot's components/chat/multimodal-input.tsx
// at c2f8235e1f3ea903ad8b7f61447c4f74164b5c58. Attachments and model selection
// are intentionally omitted because Nemo's run context is supplied server-side.
export function VercelPromptComposer({
  value,
  disabled,
  sending,
  placeholder,
  onChange,
  onSubmit,
}: VercelPromptComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!disabled) textareaRef.current?.focus();
  }, [disabled]);

  return (
    <form className="mx-auto w-full max-w-4xl" onSubmit={onSubmit}>
      <InputGroup className="rounded-xl border bg-card shadow-sm">
        <InputGroupTextarea
          aria-label="Message the Nemo agent"
          className="min-h-14 px-4 py-3 text-sm"
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder={placeholder}
          ref={textareaRef}
          value={value}
        />
        <InputGroupAddon align="block-end" className="px-2 pb-2">
          <InputGroupButton aria-label="Run context is attached" disabled size="icon-sm" type="button" variant="ghost">
            <PlusIcon className="size-4" />
          </InputGroupButton>
          <span className="flex items-center gap-1 px-2 text-[11px] text-muted-foreground">
            <CornerDownLeftIcon className="size-3" /> Enter to send · Shift+Enter for a new line
          </span>
          <InputGroupButton
            aria-label={sending ? "Agent is working" : "Send message"}
            className="ml-auto"
            disabled={disabled || !value.trim()}
            size="icon-sm"
            type="submit"
          >
            {sending ? <LoaderCircle className="animate-spin" /> : <SquareIcon className="fill-current" />}
            <span className="sr-only">Send</span>
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}

