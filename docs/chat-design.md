# Nemo run-linked chats

Nemo uses one active chat per run. The chat is created idempotently from the Chat button on a run card and uses the same
OpenClaw agent session and Instabox node as that run.

## User flow

1. Select **Chat** on a run card.
2. Nemo creates or reopens the chat for that `run_id`.
3. The chat page shows the conversation, repository/ref, node, commit, tests, previews, and recent activity.
4. Follow-up messages are sent through the protected Worker to the existing OpenClaw session.
5. When the Instabox machine is explicitly deleted, cancelled, or cleaned up, Nemo deletes the chat and its messages.

Suspending a machine does not delete its chat. A failed cleanup leaves the chat available for diagnosis until the machine is
actually removed.

## Template integration boundary

The former Nemo chat component tree was removed. The active `/chat` route now uses the Vercel Chatbot template's frontend
conversation structure directly in `src/components/vercel-chatbot/`: the history-first shell, message thread, scroll-to-latest
behavior, prompt composer, and contextual chat layout are edited template components rather than a second bespoke chat shell.
The source snapshot is the public [Vercel Chatbot](https://github.com/vercel/chatbot) repository at commit
`c2f8235e1f3ea903ad8b7f61447c4f74164b5c58`.

Nemo-specific edits replace the template's provider/auth/database/artifact runtime with the run-linked Worker API, preserve
Nemo's existing shadcn tokens and dashboard shell, add the run context rail, and keep the OpenClaw/Instabox execution boundary.

## API boundary

- `POST /api/runs/{runId}/chat` creates or reopens the run chat.
- `GET /api/chats` lists active chats.
- `GET /api/chats/{chatId}` returns chat context and messages.
- `POST /api/chats/{chatId}/messages` sends a follow-up agent turn.

All operations require the Nemo bearer session. Provider credentials remain in Worker secrets and are never sent to the
browser.

