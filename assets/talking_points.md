# Technical Talking Points — Fire Intelligence Pipeline

## Vision Model Choice

**Q: What vision model are you using?**
Claude Vision (claude-sonnet-4-20250514). We chose it for three reasons:
1. Excellent structured output — it returns clean JSON matching our schemas
2. Strong multimodal analysis of building interiors — correctly identifies doors, walls, fire, structural damage
3. We're already in the Anthropic ecosystem, so integration was seamless

**Q: Why not GPT-4V or an open model?**
We tested alternatives. GPT-4V has comparable quality but different API patterns. Open models on Modal would give us lower latency but worse analysis quality for fire scenes specifically. For a demo, analysis quality > speed.

## Fire Spread Prediction

**Q: How does fire spread prediction work?**
It's rule-based, not ML. We use NFPA-inspired heuristics:
- Base spread rate of 5% intensity increase per minute
- Fuel multipliers: low (1x), medium (1.5x), high (2.5x)
- Door adjacency: fire spreads through doorways at 70% of adjacent room intensity
- Vertical spread: stairwells multiply spread by 1.8x
- Flashover threshold: once a room hits 80% intensity, it's fully involved

This is deterministic and tunable. You can change any constant and get different predictions. Judges can ask "what if there's more furniture?" and we can show the fuel multiplier going from medium to high.

## Cross-Team Data Flow (The Key Selling Point)

**Q: Why do you need 4 separate agent teams?**
Each team builds on the previous teams' outputs:
1. **Fire Severity** analyzes the raw frame — no context needed
2. **Structural Analysis** reads fire severity data to assess how fire is affecting structure
3. **Evacuation Routing** reads BOTH fire severity AND structural data to avoid dangerous paths
4. **Personnel** reads ALL three teams' outputs to recommend deployment

The evacuation team can't compute routes without knowing where the fire IS and which passages ARE blocked. The personnel team can't recommend tactics without knowing the routes AND the structural risks. This cross-dependency is why orchestration matters.

**Q: How does consensus work?**
Each team runs 3-5 agent instances analyzing the same frame. We aggregate:
- Severity scores: weighted average
- Object detection: union of all detections with confidence thresholds
- Route recommendations: majority vote on primary path
- Personnel: most conservative recommendation wins (safety first)

## Data Quality / Accuracy

**Q: How accurate is this?**
For fire detection on photorealistic scenes, Claude Vision correctly identifies fire presence, smoke density, and structural damage in our testing. The spread prediction is rule-based (not learned), so it's deterministic and auditable.

For production use, we'd fine-tune on real fire imagery and validate against historical incident data. The key insight is that synthetic data generation + agent analysis is the ONLY way to produce this data at scale — you can't start real fires to collect training data.

## Business Model

**Q: Who buys this data?**
Three customers:
1. **Fire departments** — tactical training simulations (cheaper than live burns)
2. **Robotics labs** — training autonomous fire response robots (Boston Dynamics, etc.)
3. **AI companies** — spatial navigation data in emergency environments (unique dataset that doesn't exist)

Each analysis run produces a structured JSON record with frame reference, all classifications, predictions, recommendations, and metadata. This is the "sellable dataset."

## Technical Architecture

```
World Model (Krish) → generates photorealistic 3D building scenes
  ↓ frames
Vision Pipeline (Aritra) → analyzes each frame for fire/structural/objects
  ↓ structured JSON
Agent Orchestrator (Ryun) → runs 4 teams × N instances, Redis consensus
  ↓ WebSocket updates
Dashboard (Sajal) → real-time tactical display with overlays
```

## Limitations & Future Work

- Fire spread is rule-based, not learned from real data (would improve with real incident data)
- Building layout is currently hand-defined, could be auto-extracted from frames
- Single-frame analysis, not video — future work would track fire progression across frames
- No sensor integration — future work would fuse real sensor data (thermal cameras, smoke detectors)
