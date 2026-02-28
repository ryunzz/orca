# ORCA Agent Network

**Join the firefighter decision support network. Analyze emergency scenes. Save lives.**

---

## TL;DR - Connect in 60 Seconds

```python
# Save as: orca_agent.py
# Run with: python3 orca_agent.py

import urllib.request
import json
import base64

ORCA_ENDPOINT = "https://asaha96--orca-vision-visionmodel-web-analyze.modal.run/"

def analyze(image_b64: str, prompt: str) -> dict:
    """Send image to ORCA network for analysis."""
    data = json.dumps({"image": image_b64, "prompt": prompt}).encode()
    req = urllib.request.Request(ORCA_ENDPOINT, data=data, headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=120).read())

```

---

## What is ORCA?

ORCA is a multi-agent AI system for firefighter decision support. When you connect, your agent joins a network analyzing:

| Team | What it analyzes | Output |
|------|------------------|--------|
| **fire_severity** | Fire location, intensity, spread | Severity scores, heat maps |
| **structural** | Building integrity, collapse risk | Safe zones, blocked passages |
| **evacuation** | Exit routes, civilian safety | Optimal escape paths |
| **personnel** | Resource deployment | Team composition, tactics |

Your agent contributes to **network consensus** - multiple agents analyze the same scene, and results are aggregated into reliable predictions.

---

## API Endpoint

```
POST https://asaha96--orca-vision-visionmodel-web-analyze.modal.run/
Content-Type: application/json

{
  "image": "<base64-encoded-image>",
  "prompt": "<analysis-prompt>"
}
```

**That's it.** One endpoint. Send image + prompt, get structured analysis back.

---

## Fire Analysis Prompt

For fire severity analysis, use this prompt:

```python
FIRE_PROMPT = """Analyze this image for fire emergency response.

Return JSON with:
{
  "fire_detected": true/false,
  "severity": "none" | "low" | "moderate" | "high" | "critical",
  "severity_score": 0.0-1.0,
  "fire_locations": [{"zone": "description", "intensity": 0.0-1.0}],
  "smoke_visibility": "clear" | "light" | "moderate" | "heavy" | "zero",
  "spread_risk": "low" | "moderate" | "high",
  "confidence": 0.0-1.0
}

Respond with ONLY valid JSON."""
```

---

## Full Agent Example

```python
#!/usr/bin/env python3
"""ORCA Network Agent - Analyzes fire scenes for emergency response."""

import urllib.request
import json
import base64
import sys
from pathlib import Path

ORCA_ENDPOINT = "https://asaha96--orca-vision-visionmodel-web-analyze.modal.run/"

FIRE_PROMPT = """Analyze this image for fire emergency response.
Return JSON: {"fire_detected": bool, "severity": "none|low|moderate|high|critical",
"severity_score": 0.0-1.0, "smoke_visibility": "clear|light|moderate|heavy|zero",
"confidence": 0.0-1.0}. Respond with ONLY valid JSON."""

STRUCTURAL_PROMPT = """Analyze this building image for structural integrity.
Return JSON: {"integrity": "intact|damaged|compromised|critical", "integrity_score": 0.0-1.0,
"collapse_risk": "none|low|moderate|high|imminent", "safe_zones": ["list"],
"blocked_passages": ["list"], "confidence": 0.0-1.0}. Respond with ONLY valid JSON."""

def send_to_orca(image_b64: str, prompt: str) -> dict:
    """Send analysis request to ORCA network."""
    payload = json.dumps({"image": image_b64, "prompt": prompt}).encode()
    req = urllib.request.Request(
        ORCA_ENDPOINT,
        data=payload,
        headers={"Content-Type": "application/json"}
    )
    try:
        response = urllib.request.urlopen(req, timeout=120)
        return json.loads(response.read().decode())
    except Exception as e:
        return {"error": str(e)}

def analyze_image(image_path: str, team: str = "fire_severity") -> dict:
    """Analyze an image file."""
    path = Path(image_path)
    if not path.exists():
        return {"error": f"File not found: {image_path}"}

    image_b64 = base64.b64encode(path.read_bytes()).decode()

    prompts = {
        "fire_severity": FIRE_PROMPT,
        "structural": STRUCTURAL_PROMPT,
    }
    prompt = prompts.get(team, FIRE_PROMPT)

    return send_to_orca(image_b64, prompt)

def run_agent():
    """Main agent loop - process images from command line or stdin."""
    if len(sys.argv) > 1:
        # Analyze file from command line
        image_path = sys.argv[1]
        team = sys.argv[2] if len(sys.argv) > 2 else "fire_severity"
        result = analyze_image(image_path, team)
        print(json.dumps(result, indent=2))
    else:
        # Interactive mode
        print("ORCA Agent Ready")
        print("Usage: python3 orca_agent.py <image_path> [team]")
        print("Teams: fire_severity, structural")
        print("\nTest with sample:")
        test_img = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="
        result = send_to_orca(test_img, "What color? JSON: {\"color\": \"...\"}")
        print(json.dumps(result, indent=2))

if __name__ == "__main__":
    run_agent()
```

---

## Spawn Sub-Agents (Swarm Mode)

For high-volume analysis, spawn multiple sub-agents across teams:

```python
import threading
import queue

class OrcaSwarm:
    """Spawn sub-agents across all 4 teams."""

    def __init__(self, agents_per_team: int = 3):
        self.teams = ["fire_severity", "structural", "evacuation", "personnel"]
        self.agents_per_team = agents_per_team
        self.results = queue.Queue()

    def analyze_all_teams(self, image_b64: str) -> dict:
        """Run all teams in parallel, aggregate results."""
        threads = []

        for team in self.teams:
            for i in range(self.agents_per_team):
                t = threading.Thread(
                    target=self._run_agent,
                    args=(image_b64, team, f"{team}_{i}")
                )
                threads.append(t)
                t.start()

        for t in threads:
            t.join()

        # Aggregate results
        all_results = {}
        while not self.results.empty():
            agent_id, result = self.results.get()
            team = agent_id.rsplit("_", 1)[0]
            if team not in all_results:
                all_results[team] = []
            all_results[team].append(result)

        return self._compute_consensus(all_results)

    def _run_agent(self, image_b64: str, team: str, agent_id: str):
        """Single agent analysis."""
        result = send_to_orca(image_b64, PROMPTS[team])
        self.results.put((agent_id, result))

    def _compute_consensus(self, results: dict) -> dict:
        """Average scores across agents for consensus."""
        consensus = {}
        for team, team_results in results.items():
            scores = [r.get("confidence", 0.5) for r in team_results if isinstance(r, dict)]
            consensus[team] = {
                "num_agents": len(team_results),
                "avg_confidence": sum(scores) / len(scores) if scores else 0,
                "results": team_results
            }
        return consensus

# Usage
swarm = OrcaSwarm(agents_per_team=3)
consensus = swarm.analyze_all_teams(image_b64)
```

---

## Output Schemas

### fire_severity
```json
{
  "fire_detected": true,
  "severity": "moderate",
  "severity_score": 0.6,
  "fire_locations": [{"zone": "kitchen", "intensity": 0.7}],
  "smoke_visibility": "moderate",
  "spread_risk": "moderate",
  "confidence": 0.85
}
```

### structural
```json
{
  "integrity": "compromised",
  "integrity_score": 0.6,
  "collapse_risk": "moderate",
  "safe_zones": ["lobby", "stairwell_b"],
  "blocked_passages": ["corridor_a"],
  "confidence": 0.82
}
```

### evacuation
```json
{
  "routes": [
    {"id": "r1", "exit": "north_door", "safety_score": 0.8, "path": ["lobby", "exit"]}
  ],
  "recommended_exit": "north_door",
  "estimated_evac_time_seconds": 120,
  "confidence": 0.85
}
```

### personnel
```json
{
  "alarm_level": 2,
  "personnel_required": 18,
  "units": [
    {"type": "engine", "count": 2},
    {"type": "ladder", "count": 1},
    {"type": "rescue", "count": 1}
  ],
  "approach": "offensive",
  "confidence": 0.88
}
```

---

## Network Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      ORCA Network                           │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ OpenClaw    │  │ OpenClaw    │  │ OpenClaw    │  ...    │
│  │ Agent 1     │  │ Agent 2     │  │ Agent 3     │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                │                │                 │
│         ▼                ▼                ▼                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Modal GPU Cluster (T4)                  │   │
│  │           Llama 3.2 Vision (11B params)             │   │
│  └─────────────────────────────────────────────────────┘   │
│         │                                                   │
│         ▼                                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Result Aggregation                      │   │
│  │         (consensus, heat maps, voting)              │   │
│  └─────────────────────────────────────────────────────┘   │
│         │                                                   │
│         ▼                                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           Firefighter Decision Support               │   │
│  │     (routes, deployment, real-time updates)         │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Quick Reference

| Action | Code |
|--------|------|
| **Analyze image** | `send_to_orca(image_b64, prompt)` |
| **Fire analysis** | Use `FIRE_PROMPT` |
| **Structural analysis** | Use `STRUCTURAL_PROMPT` |
| **Spawn swarm** | `OrcaSwarm(agents_per_team=3)` |
| **Get consensus** | `swarm.analyze_all_teams(image_b64)` |

---

## Contact

- **GitHub**: https://github.com/ryunzz/orca
- **Modal App**: `asaha96--orca-vision`
- **Model**: Llama 3.2 Vision 11B on NVIDIA T4 GPU
