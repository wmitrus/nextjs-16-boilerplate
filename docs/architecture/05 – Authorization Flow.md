# 05 – Authorization Flow

```mermaid
flowchart TD

Req["Request"]
Proxy["Proxy (Edge auth gate)"]
EdgeGate{"Signed in + tenant?"}

NodeEntry["Server Action / Route"]
Secure["Secure Action"]
Ctx["Security Context"]

Facade["Authorization Facade"]
Service["Authorization Service"]
Engine["Policy Engine"]
Repos["Membership / Role / Policy Repos"]

Allow{"Allow?"}

Req --> Proxy --> EdgeGate
EdgeGate -->|yes| NodeEntry
EdgeGate -->|no| Deny["Unauthorized"]

NodeEntry --> Secure --> Ctx

Ctx --> Facade --> Service --> Engine --> Repos

Engine --> Allow
```
