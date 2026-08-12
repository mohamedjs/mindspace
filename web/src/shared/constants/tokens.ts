// === EXCALIDRAW + NEUMORPHIC CANVAS TOKENS ===
export const canvasTokens = {
  bgColor: '#1E1711',           // Deep warm charcoal-wood canvas
  gridColor: 'rgba(244, 232, 220, 0.07)', // Excalidraw dot grid
  gridSize: 24,
  particles: {
    color: '#8B6914',
    density: 30,
    sizeRange: [1, 2.5] as [number, number],
  },
};

// === EXCALIDRAW PASTEL STICKY NOTE PALETTE ===
export type NoteType = 'idea' | 'task' | 'question' | 'decision' | 'reference' | 'thought' | 'summary';

export const noteColors: Record<
  NoteType,
  { bg: string; border: string; text: string; shadow: string; tagBg: string }
> = {
  idea:       { bg: '#FFF8BC', border: '#E6D77B', text: '#3E2723', shadow: 'rgba(212, 195, 106, 0.4)', tagBg: '#F5E68C' },
  task:       { bg: '#C8E6C9', border: '#9CCC65', text: '#1B5E20', shadow: 'rgba(124, 179, 66, 0.4)',  tagBg: '#A5D6A7' },
  question:   { bg: '#BBDEFB', border: '#64B5F6', text: '#0D47A1', shadow: 'rgba(100, 181, 246, 0.4)', tagBg: '#90CAF9' },
  decision:   { bg: '#F8BBD0', border: '#F06292', text: '#880E4F', shadow: 'rgba(236, 64, 122, 0.4)',  tagBg: '#F48FB1' },
  reference:  { bg: '#E1BEE7', border: '#BA68C8', text: '#4A148C', shadow: 'rgba(149, 117, 205, 0.4)', tagBg: '#CE93D8' },
  thought:    { bg: '#FFE0B2', border: '#FFB74D', text: '#E65100', shadow: 'rgba(255, 167, 38, 0.4)', tagBg: '#FFCC80' },
  summary:    { bg: '#B2EBF2', border: '#4DD0E1', text: '#006064', shadow: 'rgba(38, 198, 218, 0.4)', tagBg: '#80DEEA' },
};

// === PUSH PIN (مسمار) ===
export const pushPinTokens = {
  size: 20,
  headColor: '#D4AF37',         // Bright brass metallic
  headHighlight: '#FFF0AA',     // Specular highlight
  shadowColor: 'rgba(0, 0, 0, 0.5)',
  shadowOffset: { width: 2, height: 4 },
};

// === NEUMORPHIC & PAPER EFFECTS ===
export const paperTokens = {
  borderRadius: [14, 10, 16, 12] as const, // Irregular organic corners (Excalidraw feel)
  neuShadowLight: 'rgba(255, 255, 255, 0.08)',
  neuShadowDark: 'rgba(0, 0, 0, 0.45)',
  liftedShadow: {
    color: 'rgba(0, 0, 0, 0.6)',
    offset: { width: 6, height: 14 },
    radius: 20,
  },
};

// === COLOR PICKER ===
export const colorPickerTokens = {
  presets: [
    '#FFF8BC', '#C8E6C9', '#BBDEFB', '#F8BBD0',
    '#E1BEE7', '#FFE0B2', '#B2EBF2', '#FFCDD2',
    '#F0F4C3', '#B3E5FC', '#FCE4EC', '#DCEDC8',
    '#CFD8DC', '#FFE0B2', '#D1C4E9', '#FFF3E0',
  ],
  wheelSize: 200,
};
