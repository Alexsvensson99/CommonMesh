# CommonMesh

CommonMesh is a new open-source project being built for the **2026 WebMCP Challenge**.

It is an agent-native community coordination workspace where people and AI agents can match real needs with available volunteers, skills, equipment, transport, and spaces. A coordinator remains in control while an agent can inspect constraints, assemble and validate a multi-resource plan, and stage it for explicit human approval.

## Technology stack

- React
- TypeScript
- Vite
- Browser-local deterministic demo data
- WebMCP via `document.modelContext.registerTool(...)`

WebMCP is the core agent interaction mechanism, not an optional automation layer. The human interface and WebMCP tools operate on the same application state and domain actions so that people and agents can collaborate visibly and reliably.

## Development

```bash
npm install
npm run dev
```

Create a production build with:

```bash
npm run build
```

The detailed architecture, tool catalogue, trust boundaries, judge instructions, and demo script will be documented as the Challenge implementation develops.

## License

CommonMesh is available under the [MIT License](LICENSE).
