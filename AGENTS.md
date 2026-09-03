# Workspace Agent Instructions

## Compatibility

- Keep projects backward compatible whenever feasible. Before introducing a breaking change, prefer a compatible migration path and clearly document any unavoidable incompatibility.

## MemPalace

MemPalace is the local memory system for this workspace. Use it to preserve and retrieve project context across sessions.

- Before answering questions about prior decisions, project history, architecture choices, unresolved issues, or earlier work, search MemPalace first when its MCP tools are available.
- Use `mempalace_search` as the primary lookup. Add `wing: opendaw` when the repository has been mined under that wing; add a room only when the room is known.
- If MCP tools are unavailable, use the CLI fallback: `mempalace search "<query>" --wing opendaw`.
- Treat repository files and current git state as authoritative for present behavior. Treat MemPalace as historical/contextual evidence and reconcile conflicts explicitly.
- When reporting retrieved memories, include their wing, room, drawer/source, and relevance score when available.
- After a meaningful decision, milestone, bug root cause, or durable project convention is established, record it in MemPalace when a write tool is available. Do not store secrets, credentials, tokens, or sensitive personal data.
- Do not mine the repository, conversation logs, or other directories automatically. Ask the user first, state the source path and mode, and report the number of items and warnings after mining.
- Check `mempalace_status` when diagnosing whether project memory is available or when the user asks about the palace.
- Keep MemPalace local-first. Never send project content to an external service unless the user explicitly requests it.
