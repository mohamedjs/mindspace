from collections.abc import Sequence
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.ai.enums import AiActionStatus, ModelKind, ProviderId
from app.modules.ai.models import AiAction, AiActionItem, AiModel


class AiModelRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list_models(
        self,
        kind: ModelKind | None = None,
        enabled_only: bool = True,
    ) -> Sequence[AiModel]:
        stmt = select(AiModel)
        if kind is not None:
            stmt = stmt.where(AiModel.kind == kind)
        if enabled_only:
            stmt = stmt.where(AiModel.enabled.is_(True))
        stmt = stmt.order_by(AiModel.sort_order.asc(), AiModel.display_name.asc())
        return (await self._s.scalars(stmt)).all()

    async def get_by_id(self, model_id: UUID) -> AiModel | None:
        return await self._s.get(AiModel, model_id)

    async def get_default(self, kind: ModelKind) -> AiModel | None:
        stmt = select(AiModel).where(
            AiModel.kind == kind,
            AiModel.is_default.is_(True),
            AiModel.enabled.is_(True),
        )
        return await self._s.scalar(stmt)

    async def get_by_provider_and_id(
        self,
        provider: ProviderId,
        model_id: str,
        kind: ModelKind,
    ) -> AiModel | None:
        stmt = select(AiModel).where(
            AiModel.provider == provider,
            AiModel.model_id == model_id,
            AiModel.kind == kind,
        )
        return await self._s.scalar(stmt)


class AiActionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def get_owned(
        self,
        action_id: UUID,
        *,
        user_id: UUID,
    ) -> tuple[AiAction, list[AiActionItem]] | None:
        stmt = select(AiAction).where(
            AiAction.id == action_id,
            AiAction.user_id == user_id,
        )
        action = await self._s.scalar(stmt)
        if action is None:
            return None

        items_stmt = (
            select(AiActionItem)
            .where(AiActionItem.ai_action_id == action_id)
            .order_by(AiActionItem.sort_order.asc())
        )
        items = list((await self._s.scalars(items_stmt)).all())
        return action, items

    async def create_action(
        self,
        action: AiAction,
        items: list[AiActionItem],
    ) -> AiAction:
        self._s.add(action)
        await self._s.flush()
        for item in items:
            item.ai_action_id = action.id
            self._s.add(item)
        await self._s.flush()
        return action

    async def update_action_status(
        self,
        action_id: UUID,
        status: AiActionStatus,
        resolved_at: datetime | None = None,
    ) -> None:
        stmt = (
            update(AiAction)
            .where(AiAction.id == action_id)
            .values(status=status, resolved_at=resolved_at or datetime.now(UTC))
        )
        await self._s.execute(stmt)

    async def mark_items_applied(self, item_ids: list[UUID]) -> None:
        now = datetime.now(UTC)
        stmt = (
            update(AiActionItem)
            .where(AiActionItem.id.in_(item_ids))
            .values(accepted=True, applied_at=now)
        )
        await self._s.execute(stmt)
