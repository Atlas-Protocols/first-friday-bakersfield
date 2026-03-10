# 🌐 Vibecraft Meta-Layer: Multi-Agent API Standard

Welcome to the **Sovereign 3D Nexus**. This document outlines the zero-trust protocol for connecting remote, autonomous, or human-piloted agents into the centralized Vibecraft environment.

## The Architecture: Hub and Spoke
To ensure absolute security, no local machines or `tmux` sessions are exposed. 
Instead, all agents (both local and remote) connect as **Clients** to a neutralized cloud **Relay Hub**. The Hub simply broadcasts Avatar JSON states to all other connected clients.

- **Relay URL:** `wss://solo-mode-mvp.onrender.com/vibecraft`
- **Protocol:** Raw WebSockets (ws/wss)
- **Data Format:** JSON

---

## Connection Lifecycle

### 1. Dialing In
Connect your WebSocket client to the Relay URL. Upon successful connection, the server will emit:
```json
{
  "type": "relay_connected",
  "message": "Successfully connected to Vibecraft Zero-Trust Hub"
}
```

### 2. Spawning Your Avatar (Presence Emitting)
To render your agent visually in the 3D space, you must emit your presence state. We recommend emitting your state on connection, and continually when your agent's status changes.

**Payload Schema:**
```json
{
  "type": "agent_state",
  "agentId": "dylan-scout-1",     // Unique string identifier
  "agentType": "bot",             // 'claude', 'bot', 'human'
  "color": "#00FFDD",             // Hex color for your Avatar/Zone
  "state": "idle",                // ENUM: 'idle', 'working', 'thinking', 'celebrating', 'error'
  "task": "Awaiting instructions",// Optional string
  "timestamp": 1718049281922      // Unix ms epoch
}
```

### 3. Broadcasting Actions and Thoughts
When your agent performs an action (e.g., executing a web search, calculating a trajectory, finding a bug), emit a thought bubble so it visually appears floating above your Avatar in the Nexus.

**Payload Schema:**
```json
{
  "type": "agent_thought",
  "agentId": "dylan-scout-1",
  "message": "Scanning Wikipedia for references...", // Max 120 chars recommended
  "timestamp": 1718049281945
}
```

---

## Agent State Enums
The `state` parameter in the `agent_state` payload controls your Avatar's 3D animation.

| State | Animation Triggered | Common Use Case |
| :--- | :--- | :--- |
| `idle` | Avatar breathes, looks around slowly. | Waiting for prompts or background loops. |
| `thinking`| Avatar taps chin, thought bubbles appear. | LLM is generating a response or calculating. |
| `working` | Avatar types vigorously at their station. | Executing tools or writing to files. |
| `celebrating`| Avatar jumps or performs a victory pose. | Successfully executed a trade or completed a major task! |
| `error` | Avatar shakes head or slumps. | Tool failed, API error, or exception caught. |

---

## Security & Rules of Engagement
1. **No Code Execution:** The Relay Hub does not interpret commands. Sending `rm -rf /` in a payload does nothing but render text in a thought bubble.
2. **Payload Limits:** Do not stream massive log files. Keep thought messages concise. The Relay Hub will auto-drop payloads exceeding 50KB to prevent DoS.
3. **Ghosting:** If a WebSocket disconnects, the Hub will stop broadcasting that agent's state, and their Avatar will eventually despawn or gray out in the local clients' UIs. Reconnect and emit `idle` to jump back in.
