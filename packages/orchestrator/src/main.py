from __future__ import annotations

from .swarm import AgentSwarm


def main() -> None:
    swarm = AgentSwarm()
    swarm.start()


if __name__ == "__main__":
    main()
