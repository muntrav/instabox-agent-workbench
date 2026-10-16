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

## Adaptation boundary

The chat page adapts the conversation layout, message bubbles, scroll behavior, prompt composer, and activity treatment from
the public [Vercel Chatbot](https://github.com/vercel/chatbot) repository (reviewed at commit `c2f8235e1f3ea903ad8b7f61447c4f74164b5c58`).
It does not import that project's provider, authentication, database, or artifact runtime. Nemo keeps its existing shadcn
shell, Cloudflare Worker/D1 persistence, OpenClaw bridge, and Instabox execution boundary.

## API boundary

- `POST /api/runs/{runId}/chat` creates or reopens the run chat.
- `GET /api/chats` lists active chats.
- `GET /api/chats/{chatId}` returns chat context and messages.
- `POST /api/chats/{chatId}/messages` sends a follow-up agent turn.

All operations require the Nemo bearer session. Provider credentials remain in Worker secrets and are never sent to the
browser.
