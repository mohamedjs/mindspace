from enum import StrEnum


class NoteType(StrEnum):
    idea = "idea"
    task = "task"
    question = "question"
    decision = "decision"
    reference = "reference"
    thought = "thought"
    summary = "summary"


class RelType(StrEnum):
    related = "related"
    depends_on = "depends_on"
    supports = "supports"
    contradicts = "contradicts"
    derived_from = "derived_from"
    child_of = "child_of"


class SourceType(StrEnum):
    voice = "voice"
    manual = "manual"
    ai = "ai"
