# ORCA Modal Deployment

Deploy ORCA vision agents to Modal for global, serverless inference.

Uses **Gemini 2.0 Flash** - super cheap (~$0.10/1M tokens), fast, great vision.

## Prerequisites

1. Create a Modal account: https://modal.com
2. Install Modal CLI: `pip install modal`
3. Authenticate: `modal token new`
4. Get a Google AI API key: https://aistudio.google.com/apikey

## Setup

1. Create the Google API secret in Modal:
```bash
modal secret create google-secret GOOGLE_API_KEY=<your-key>
```

2. Deploy everything:
```bash
cd packages/modal-deploy
modal deploy src/vision_endpoint.py
modal deploy src/agent_registry.py
```

3. Get your endpoint URLs (shown after deployment):
```
Vision:  https://orca-vision--analyze-endpoint.modal.run
Registry: https://orca-vision--register.modal.run
```

## Connect External Agents

Any agent can join the network with one command:

```bash
curl -X POST https://orca-vision--register.modal.run \
  -H "Content-Type: application/json" \
  -d '{"name": "my-agent", "team": "fire_severity"}'
```

See [AGENT_CONNECT.md](../../AGENT_CONNECT.md) for full onboarding docs.

## Configure the API

Set these environment variables in `apps/api/.env`:

```bash
ORCA_INFERENCE_MODE=cloud
WORLD_MODEL_ENDPOINT=https://orca-vision--analyze-endpoint.modal.run
```

## Endpoints

### Vision Analysis
```bash
curl -X POST https://orca-vision--analyze-endpoint.modal.run \
  -H "Content-Type: application/json" \
  -d '{"frame_base64": "...", "team_type": "fire_severity"}'
```

### Agent Registry
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/register` | POST | Register an agent |
| `/poll-task` | GET | Get next task |
| `/submit-result` | POST | Submit analysis |
| `/agents` | GET | List all agents |

## Teams

| Team | Input | Output |
|------|-------|--------|
| `fire_severity` | Image | Fire locations, severity |
| `structural` | Image + fire | Collapse risk, passages |
| `evacuation` | Fire + structural | Safe routes |
| `personnel` | All data | Unit recommendations |

## Cost

Gemini 2.0 Flash pricing:
- Input: $0.10 / 1M tokens
- Output: $0.40 / 1M tokens
- Images: ~260 tokens per image

**Estimated cost per frame analysis: ~$0.001**

## Monitoring

Dashboard: https://modal.com/apps/orca-vision
