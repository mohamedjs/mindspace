from fastapi import Query
from pydantic import BaseModel


class PaginationParams(BaseModel):
    limit: int = 50
    offset: int = 0


def get_pagination(
    limit: int = Query(50, ge=1, le=100, description="Max items to return"),
    offset: int = Query(0, ge=0, description="Items to skip"),
) -> PaginationParams:
    return PaginationParams(limit=limit, offset=offset)
