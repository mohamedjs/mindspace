import math
from typing import NamedTuple

from app.modules.notes.enums import NoteType


class Rect(NamedTuple):
    x: float
    y: float
    width: float
    height: float


DEFAULT_WIDTH = 190.0
DEFAULT_HEIGHT = 145.0
GAP = 22.0

CHILD_WIDTH = 150.0
CHILD_HEIGHT = 110.0
CHILD_DISTANCE = 210.0
CHILD_ANGLE_STEP = (2 * math.pi) / 6  # 60 degrees

COLUMNS = 4
STEP_X = DEFAULT_WIDTH + GAP
STEP_Y = DEFAULT_HEIGHT + GAP

NOTE_COLORS: dict[NoteType, str] = {
    NoteType.idea: "#FFF8BC",
    NoteType.task: "#C8E6C9",
    NoteType.question: "#BBDEFB",
    NoteType.decision: "#F8BBD0",
    NoteType.reference: "#E1BEE7",
    NoteType.thought: "#FFE0B2",
    NoteType.summary: "#B2EBF2",
}


def color_for_note(note_type: NoteType, proposed: str | None = None) -> str:
    if proposed and proposed.startswith("#") and len(proposed) == 7:
        return proposed
    return NOTE_COLORS.get(note_type, "#FFF8BC")


def overlaps(a: Rect, b: Rect) -> bool:
    return (
        a.x < b.x + b.width
        and a.x + a.width > b.x
        and a.y < b.y + b.height
        and a.y + a.height > b.y
    )


def slot_rect(index: int) -> Rect:
    return Rect(
        x=float((index % COLUMNS) * STEP_X),
        y=float(math.floor(index / COLUMNS) * STEP_Y),
        width=DEFAULT_WIDTH,
        height=DEFAULT_HEIGHT,
    )


def layout_new_notes(count: int, existing: list[Rect]) -> list[Rect]:
    placed: list[Rect] = []
    slot = 0
    for _ in range(count):
        candidate = slot_rect(slot)
        while slot < 4000 and any(overlaps(candidate, r) for r in (existing + placed)):
            slot += 1
            candidate = slot_rect(slot)
        placed.append(candidate)
        slot += 1
    return placed


def radial_child_rect(parent: Rect, angle_slot: int, ring: int = 0) -> Rect:
    distance = CHILD_DISTANCE + ring * CHILD_DISTANCE * 0.8
    angle = -math.pi / 2 + angle_slot * CHILD_ANGLE_STEP
    cx = parent.x + parent.width / 2 + math.cos(angle) * distance
    cy = parent.y + parent.height / 2 + math.sin(angle) * distance
    return Rect(
        x=cx - CHILD_WIDTH / 2,
        y=cy - CHILD_HEIGHT / 2,
        width=CHILD_WIDTH,
        height=CHILD_HEIGHT,
    )


def place_child(parent: Rect, sibling_index: int, occupied: list[Rect]) -> Rect:
    def clashes(rect: Rect) -> bool:
        return overlaps(rect, parent) or any(overlaps(rect, o) for o in occupied)

    for attempt in range(sibling_index, sibling_index + 60):
        candidate = radial_child_rect(parent, attempt % 6, attempt // 6)
        if not clashes(candidate):
            return candidate

    return radial_child_rect(parent, sibling_index, 10)
