export type ToolZone = 'mode' | 'create' | 'selection' | 'view';

export type CanvasMode = 'select' | 'hand' | 'connect' | 'write';

export interface SelectionState {
  selectedNoteIds: string[];
  selectedGroupIds?: string[];
  notes?: Array<{ id: string; parentId?: string | null }>;
  groups?: Array<{ id: string }>;
}

export interface ToolDefinition {
  id: string;
  zone: ToolZone;
  labelEn: string;
  labelAr: string;
  key?: string;
  iconName?: string;
  hintEn?: string;
  hintAr?: string;
  isAvailable: (selection: SelectionState) => boolean;
}

export const CANVAS_TOOLS: ToolDefinition[] = [
  // ── Mode Tools (Zone 1) ──────────────────────────────────────────────────
  {
    id: 'select',
    zone: 'mode',
    labelEn: 'Select',
    labelAr: 'تحديد',
    key: 'V',
    iconName: 'MousePointer2',
    hintEn: 'Click, shift-click, marquee. Drag moves.',
    hintAr: 'المس الملاحظات لتحديدها',
    isAvailable: () => true,
  },
  {
    id: 'hand',
    zone: 'mode',
    labelEn: 'Hand',
    labelAr: 'تحريك اللوحة',
    key: 'H',
    iconName: 'Hand',
    hintEn: 'Drag moves the board',
    hintAr: 'السحب يحرك اللوحة',
    isAvailable: () => true,
  },
  {
    id: 'connect',
    zone: 'mode',
    labelEn: 'Connect',
    labelAr: 'ربط',
    key: 'C',
    iconName: 'Waypoints',
    hintEn: 'Drag from one note to another',
    hintAr: 'اسحب من ملاحظة لأخرى',
    isAvailable: () => true,
  },
  {
    id: 'write',
    zone: 'mode',
    labelEn: 'Write',
    labelAr: 'كتابة',
    key: 'W',
    iconName: 'Pencil',
    hintEn: 'Tap a note to write in it',
    hintAr: 'المس ملاحظة للكتابة فيها',
    isAvailable: () => true,
  },

  // ── Create Tools (Zone 2) ────────────────────────────────────────────────
  {
    id: 'create_voice',
    zone: 'create',
    labelEn: 'Voice note',
    labelAr: 'ملاحظة صوتية',
    key: 'R',
    iconName: 'Mic',
    isAvailable: () => true,
  },
  {
    id: 'create_note',
    zone: 'create',
    labelEn: 'Sticky note',
    labelAr: 'ملاحظة جديدة',
    key: 'N',
    iconName: 'StickyNote',
    isAvailable: () => true,
  },
  {
    id: 'create_subnote',
    zone: 'create',
    labelEn: 'Sub-note',
    labelAr: 'ملاحظة فرعية',
    key: 'Shift+N',
    iconName: 'CornerDownRight',
    isAvailable: (sel) => (sel?.selectedNoteIds?.length ?? 0) === 1,
  },
  {
    id: 'create_group',
    zone: 'create',
    labelEn: 'Group',
    labelAr: 'مجموعة',
    key: 'G',
    iconName: 'Frame',
    isAvailable: () => true,
  },

  // ── Selection Bar Tools (Zone 3) ─────────────────────────────────────────
  {
    id: 'sel_group',
    zone: 'selection',
    labelEn: 'Group',
    labelAr: 'تجميع',
    key: 'G',
    iconName: 'Frame',
    isAvailable: (sel) => (sel?.selectedNoteIds?.length ?? 0) >= 1,
  },
  {
    id: 'sel_ungroup',
    zone: 'selection',
    labelEn: 'Ungroup',
    labelAr: 'فك التجميع',
    key: 'Shift+G',
    iconName: 'Ungroup',
    isAvailable: (sel) => Boolean(sel?.selectedGroupIds && sel.selectedGroupIds.length > 0),
  },
  {
    id: 'sel_link',
    zone: 'selection',
    labelEn: 'Link',
    labelAr: 'ربط',
    key: 'L',
    iconName: 'Link',
    isAvailable: (sel) => (sel?.selectedNoteIds?.length ?? 0) === 2,
  },
  {
    id: 'sel_unlink',
    zone: 'selection',
    labelEn: 'Unlink',
    labelAr: 'إلغاء الربط',
    key: 'Shift+L',
    iconName: 'Unlink',
    isAvailable: (sel) =>
      Boolean(
        sel?.selectedNoteIds?.some((id) =>
          Boolean(sel.notes?.find((n) => n.id === id)?.parentId)
        )
      ),
  },
  {
    id: 'sel_color',
    zone: 'selection',
    labelEn: 'Color',
    labelAr: 'لون',
    iconName: 'Palette',
    isAvailable: (sel) => (sel?.selectedNoteIds?.length ?? 0) >= 1,
  },
  {
    id: 'sel_type',
    zone: 'selection',
    labelEn: 'Type',
    labelAr: 'نوع',
    iconName: 'Tag',
    isAvailable: (sel) => (sel?.selectedNoteIds?.length ?? 0) >= 1,
  },
  {
    id: 'sel_tidy',
    zone: 'selection',
    labelEn: 'Tidy',
    labelAr: 'ترتيب',
    key: 'T',
    iconName: 'LayoutGrid',
    isAvailable: (sel) => (sel?.selectedNoteIds?.length ?? 0) >= 2,
  },
  {
    id: 'sel_duplicate',
    zone: 'selection',
    labelEn: 'Duplicate',
    labelAr: 'نسخ',
    key: 'Ctrl+D',
    iconName: 'Copy',
    isAvailable: (sel) => (sel?.selectedNoteIds?.length ?? 0) >= 1,
  },
  {
    id: 'sel_delete',
    zone: 'selection',
    labelEn: 'Delete',
    labelAr: 'حذف',
    key: 'Delete',
    iconName: 'Trash2',
    isAvailable: (sel) =>
      (sel?.selectedNoteIds?.length ?? 0) >= 1 || (sel?.selectedGroupIds?.length ?? 0) >= 1,
  },
  {
    id: 'sel_clear',
    zone: 'selection',
    labelEn: 'Clear',
    labelAr: 'إلغاء التحديد',
    key: 'Esc',
    iconName: 'X',
    isAvailable: (sel) =>
      (sel?.selectedNoteIds?.length ?? 0) >= 1 || (sel?.selectedGroupIds?.length ?? 0) >= 1,
  },

  // ── View Tools (Zone 4) ──────────────────────────────────────────────────
  {
    id: 'view_undo',
    zone: 'view',
    labelEn: 'Undo',
    labelAr: 'تراجع',
    key: 'Ctrl+Z',
    iconName: 'Undo2',
    isAvailable: () => true,
  },
  {
    id: 'view_redo',
    zone: 'view',
    labelEn: 'Redo',
    labelAr: 'إعادة',
    key: 'Ctrl+Shift+Z',
    iconName: 'Redo2',
    isAvailable: () => true,
  },
  {
    id: 'view_zoom_in',
    zone: 'view',
    labelEn: 'Zoom in',
    labelAr: 'تكبير',
    key: '+',
    iconName: 'ZoomIn',
    isAvailable: () => true,
  },
  {
    id: 'view_zoom_out',
    zone: 'view',
    labelEn: 'Zoom out',
    labelAr: 'تصغير',
    key: '-',
    iconName: 'ZoomOut',
    isAvailable: () => true,
  },
  {
    id: 'view_zoom_reset',
    zone: 'view',
    labelEn: 'Reset zoom',
    labelAr: 'إعادة ضبط الحجم',
    key: '0',
    iconName: 'Maximize2',
    isAvailable: () => true,
  },
  {
    id: 'view_fit',
    zone: 'view',
    labelEn: 'Fit to view',
    labelAr: 'ملاءمة الشاشة',
    key: 'F',
    iconName: 'Scan',
    isAvailable: () => true,
  },
  {
    id: 'view_tidy_all',
    zone: 'view',
    labelEn: 'Tidy all',
    labelAr: 'ترتيب الكل',
    key: 'Shift+T',
    iconName: 'Grid',
    isAvailable: () => true,
  },
  {
    id: 'view_subnotes',
    zone: 'view',
    labelEn: 'Toggle sub-notes',
    labelAr: 'الملاحظات الفرعية',
    key: 'S',
    iconName: 'Eye',
    isAvailable: () => true,
  },
  {
    id: 'view_recordings',
    zone: 'view',
    labelEn: 'Recordings',
    labelAr: 'التسجيلات',
    iconName: 'Mic',
    isAvailable: () => true,
  },
];

export function getTool(id: string): ToolDefinition | undefined {
  return CANVAS_TOOLS.find((t) => t.id === id);
}

export function getToolsByZone(zone: ToolZone): ToolDefinition[] {
  return CANVAS_TOOLS.filter((t) => t.zone === zone);
}
