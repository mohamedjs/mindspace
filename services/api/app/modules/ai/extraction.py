import json
import re
from datetime import datetime

from pydantic import BaseModel, Field

from app.modules.notes.enums import NoteType, RelType


def extract_json_block(raw: str) -> str:
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
    candidate = (fenced.group(1) if fenced else raw).strip()

    start = candidate.find("{")
    if start == -1:
        start_bracket = candidate.find("[")
        if start_bracket == -1:
            return candidate
        start = start_bracket

    depth = 0
    in_string = False
    escape = False

    for i in range(start, len(candidate)):
        ch = candidate[i]

        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue

        if ch == '"':
            in_string = True
            continue

        if ch in ("{", "["):
            depth += 1
        elif ch in ("}", "]"):
            depth -= 1
            if depth == 0:
                return candidate[start : i + 1]

    return candidate[start:]


class ExtractedNote(BaseModel):
    client_key: str = Field(alias="clientKey")
    title: str | None = None
    content: str
    type: NoteType = NoteType.idea
    color: str | None = None
    parent_client_key: str | None = Field(default=None, alias="parentClientKey")
    due_at: datetime | None = Field(default=None, alias="dueAt")
    span_start: int | None = Field(default=None, alias="spanStart")
    span_end: int | None = Field(default=None, alias="spanEnd")


class ExtractedRelation(BaseModel):
    from_key: str = Field(alias="from")
    to_key: str = Field(alias="to")
    type: RelType = RelType.related


class ExtractedResult(BaseModel):
    notes: list[ExtractedNote] = Field(default_factory=list)
    relations: list[ExtractedRelation] = Field(default_factory=list)


class ExtractedWriteNote(BaseModel):
    title: str | None = None
    content: str
    due_at: datetime | None = Field(default=None, alias="dueAt")


def parse_extraction_json(raw_text: str) -> ExtractedResult:
    json_block = extract_json_block(raw_text)
    data = json.loads(json_block)
    return ExtractedResult.model_validate(data)


def parse_write_note_json(raw_text: str) -> ExtractedWriteNote:
    json_block = extract_json_block(raw_text)
    data = json.loads(json_block)
    return ExtractedWriteNote.model_validate(data)
