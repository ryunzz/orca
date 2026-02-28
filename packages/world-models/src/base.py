from __future__ import annotations

from abc import ABC, abstractmethod
import uuid


class WorldModel(ABC):
    @abstractmethod
    async def generate_environment(self, simulation_id: uuid.UUID, config: dict) -> dict:
        raise NotImplementedError

    @abstractmethod
    async def step(self, simulation_id: uuid.UUID, action: dict | None = None) -> dict:
        raise NotImplementedError

    @abstractmethod
    async def get_frame(self, simulation_id: uuid.UUID) -> dict:
        raise NotImplementedError
