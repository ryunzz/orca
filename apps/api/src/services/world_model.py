from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class EnvironmentPayload:
    name: str
    environment_type: str
    world_model_config: dict


class WorldModelService(ABC):
    @abstractmethod
    async def generate_environment(self, simulation_id: uuid.UUID, payload: EnvironmentPayload) -> dict:
        raise NotImplementedError

    @abstractmethod
    async def step(self, simulation_id: uuid.UUID, action: str | None = None) -> dict:
        raise NotImplementedError

    @abstractmethod
    async def get_frame(self, simulation_id: uuid.UUID) -> dict:
        raise NotImplementedError


class MockWorldModelService(WorldModelService):
    async def generate_environment(self, simulation_id: uuid.UUID, payload: EnvironmentPayload) -> dict:
        return {
            "simulation_id": str(simulation_id),
            "status": "active",
            "environment_type": payload.environment_type,
            "config": payload.world_model_config,
            "name": payload.name,
        }

    async def step(self, simulation_id: uuid.UUID, action: str | None = None) -> dict:
        return {"simulation_id": str(simulation_id), "action": action, "updated": True}

    async def get_frame(self, simulation_id: uuid.UUID) -> dict:
        return {"simulation_id": str(simulation_id), "frame": "placeholder"}


# Default service used by the API
world_model_service = MockWorldModelService()
