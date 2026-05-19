import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties, DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode, TouchEvent as ReactTouchEvent, WheelEvent as ReactWheelEvent } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { PDFFont, PDFPage } from 'pdf-lib';
import type {
  BlankPageTemplate,
  DocumentRecord,
  ImageBox,
  LabelId,
  Library,
  MathPlaneBox,
  NotebookPage,
  NoteThemeId,
  PageAnnotations,
  PageSpacer,
  Point,
  ShapeBox,
  ShapeKind,
  Stroke,
  TextBox,
  Tool
} from './types';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const DEFAULT_BLANK_WIDTH = 780;
const DEFAULT_BLANK_HEIGHT = 1040;
const DEFAULT_TEXT_WIDTH = 300;
const DEFAULT_TEXT_HEIGHT = 76;
const MIN_PAGE_ZOOM = 0.65;
const MAX_PAGE_ZOOM = 3;
const MAX_CANVAS_BACKING_SCALE = 4;
const AUTO_SAVE_DELAY_MS = 550;
const DEFAULT_THEME_ID: NoteThemeId = 'ecru';
const PEN_COLOUR_STORAGE_KEY = 'dux-notes-pen-colour';
const HIGHLIGHTER_COLOUR_STORAGE_KEY = 'dux-notes-highlighter-colour';
const SHAPE_STROKE_COLOUR_STORAGE_KEY = 'dux-notes-shape-stroke-colour';
const SHAPE_FILL_COLOUR_STORAGE_KEY = 'dux-notes-shape-fill-colour';
const ERASER_MODE_STORAGE_KEY = 'dux-notes-eraser-mode';
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'dux-notes-sidebar-collapsed';
const HIGHLIGHTER_OPACITY = 0.34;
const HIGHLIGHTER_PRESETS = [
  { name: 'Yellow', value: '#FFE45C' },
  { name: 'Green', value: '#8BE878' },
  { name: 'Pink', value: '#FF7BC8' },
  { name: 'Orange', value: '#FFB347' },
  { name: 'Cyan', value: '#67E8F9' },
  { name: 'Purple', value: '#C99BFF' }
];

const PEN_PRESETS = [
  { name: 'Black', value: '#111827' },
  { name: 'Slate', value: '#334155' },
  { name: 'Red', value: '#DC2626' },
  { name: 'Orange', value: '#EA580C' },
  { name: 'Yellow', value: '#CA8A04' },
  { name: 'Green', value: '#16A34A' },
  { name: 'Blue', value: '#2563EB' },
  { name: 'Purple', value: '#7C3AED' }
];

const SHAPE_PRESETS = [
  { name: 'Transparent', value: 'transparent' },
  { name: 'White', value: '#FFFFFF' },
  { name: 'Black', value: '#111827' },
  { name: 'Red', value: '#DC2626' },
  { name: 'Orange', value: '#EA580C' },
  { name: 'Yellow', value: '#FACC15' },
  { name: 'Green', value: '#22C55E' },
  { name: 'Blue', value: '#3B82F6' },
  { name: 'Purple', value: '#8B5CF6' }
];

const ONBOARDING_STORAGE_KEY = 'duxnotes_onboarding_complete';
const ONBOARDING_STEP_DELAY_MS = 800;
const IMAGE_ROTATION_STEP_DEGREES = 90;

type ToolIconName = 'select' | 'lasso' | 'pen' | 'highlighter' | 'eraser' | 'text' | 'image' | 'shape' | 'maths' | 'space' | 'hand';
type UtilityIconName = 'undo' | 'redo' | 'clear' | 'scratch' | 'ai';

function ToolIcon({ name }: { name: ToolIconName }) {
  const common = { viewBox: '0 0 24 24', className: 'tool-icon', 'aria-hidden': true } as const;
  if (name === 'select') return <svg {...common}><path d="M5 3l14 9-7 1.2L8.4 20 5 3z" /><path d="M12.1 13.2l3.8 6.1" /></svg>;
  if (name === 'lasso') return <svg {...common}><path d="M5.4 8.5c1.8-3.6 9.8-4.2 12.5-.8 2.4 3-.4 7.3-5.9 7.3-5.7 0-8.5-2.9-6.6-6.5z" /><path d="M12 15c.8 2.2 2.4 3.4 5.1 3.6" /></svg>;
  if (name === 'pen') return <svg {...common}><path d="M4 20l4.5-1 9.8-9.8a2.1 2.1 0 0 0 0-3L17.8 5a2.1 2.1 0 0 0-3 0L5 14.8 4 20z" /><path d="M13.6 6.2l4.2 4.2" /><path d="M5 19l3.3-.8" /></svg>;
  if (name === 'highlighter') return <svg {...common}><path d="M5 14l8.8-8.8a2.2 2.2 0 0 1 3.1 0l1.9 1.9a2.2 2.2 0 0 1 0 3.1L10 19H5v-5z" /><path d="M12.9 6.1l5 5" /><path d="M4 21h12" /></svg>;
  if (name === 'eraser') return <svg {...common}><path d="M4 15.5l7.8-7.8a2.4 2.4 0 0 1 3.4 0l3.1 3.1a2.4 2.4 0 0 1 0 3.4L12.5 20H8.3L4 15.5z" /><path d="M9.4 10.1l6.5 6.5" /><path d="M12.5 20H20" /></svg>;
  if (name === 'text') return <svg {...common}><path d="M5 5h14" /><path d="M12 5v14" /><path d="M8.5 19h7" /></svg>;
  if (name === 'image') return <svg {...common}><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M7 16l3.3-3.4 2.7 2.7 2.1-2.1L20 18" /><circle cx="9" cy="9" r="1.4" /></svg>;
  if (name === 'shape') return <svg {...common}><rect x="4" y="4" width="9" height="9" rx="2" /><circle cx="16.5" cy="16.5" r="3.5" /></svg>;
  if (name === 'maths') return <svg {...common}><path d="M6 5h12" /><path d="M17 19H6l6-7-6-7h11" /><path d="M15 14.5c.8-1.2 2.2-1.2 3 0" /><path d="M14.8 18.4l3.4-6.8" /></svg>;
  if (name === 'space') return <svg {...common}><path d="M12 4v16" /><path d="M8 8l4-4 4 4" /><path d="M8 16l4 4 4-4" /><path d="M5 12h14" /></svg>;
  return <svg {...common}><path d="M8 12V7.8a1.5 1.5 0 0 1 3 0V12" /><path d="M11 11V6.5a1.5 1.5 0 0 1 3 0V12" /><path d="M14 12V8a1.5 1.5 0 0 1 3 0v6" /><path d="M8 12l-1.4-1.2a1.5 1.5 0 0 0-2.1 2.1l4.9 5.2A6 6 0 0 0 14 20h.5a5.5 5.5 0 0 0 5.5-5.5V10" /></svg>;
}

function UtilityIcon({ name }: { name: UtilityIconName }) {
  const common = { viewBox: '0 0 24 24', className: 'tool-icon', 'aria-hidden': true } as const;
  if (name === 'undo') return <svg {...common}><path d="M9 7H4v5" /><path d="M4.8 11.2A7 7 0 1 0 11 4.1" /></svg>;
  if (name === 'redo') return <svg {...common}><path d="M15 7h5v5" /><path d="M19.2 11.2A7 7 0 1 1 13 4.1" /></svg>;
  if (name === 'clear') return <svg {...common}><path d="M5 20h14" /><path d="M7 16l7.8-7.8a2 2 0 0 1 2.8 0l.2.2a2 2 0 0 1 0 2.8L13 16" /><path d="M6 16h8" /><path d="M10.5 11.5l4 4" /></svg>;
  if (name === 'scratch') return <svg {...common}><path d="M5 19l4.2-1 9.1-9.1a2 2 0 0 0 0-2.8l-.4-.4a2 2 0 0 0-2.8 0L6 14.8 5 19z" /><path d="M13.8 6.8l3.4 3.4" /><path d="M4 21h16" /></svg>;
  return <svg {...common}><rect x="5" y="7" width="14" height="11" rx="4" /><path d="M12 7V4" /><path d="M9 13h.1" /><path d="M15 13h.1" /><path d="M10 16h4" /><path d="M4 12H2" /><path d="M22 12h-2" /></svg>;
}

type ColourPickerTarget = 'pen' | 'highlighter' | 'shapeStroke' | 'shapeFill';
type EraserMode = 'pixel' | 'object';
type ButtonSizeMode = 'compact' | 'standard' | 'large';
type MathsTab = 'symbols' | 'templates' | 'plane' | 'builders';
type MathPlaneSize = 'small' | 'medium' | 'large';
type MathVectorMode = 'arrow' | 'bar';
type MathPlaneConfig = {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  gridStyle: MathPlaneBox['gridStyle'];
  gridSpacing: number;
  showAxisLabels: boolean;
  showTickMarks: boolean;
  axisColor: string;
  gridColor: string;
  size: MathPlaneSize;
};
type MathBuilderDraft = {
  numerator: string;
  denominator: string;
  powerBase: string;
  exponent: string;
  subscriptBase: string;
  subscript: string;
  root: string;
  absolute: string;
  vector: string;
  vectorMode: MathVectorMode;
};

const SECONDARY_TOOL_SET = new Set<Tool>(['pen', 'highlighter', 'eraser', 'text', 'shape', 'space', 'lasso', 'hand']);

const MATH_PLANE_SIZES: Record<MathPlaneSize, number> = { small: 200, medium: 350, large: 500 };

const MATH_SYMBOL_GROUPS: { label: string; symbols: { value: string; name: string }[] }[] = [
  { label: 'Basic operations', symbols: [['±', 'Plus-minus'], ['·', 'Multiplication dot'], ['×', 'Times'], ['÷', 'Divide'], ['≠', 'Not equal'], ['≈', 'Approximately equal'], ['∝', 'Proportional to'], ['∞', 'Infinity'], ['√', 'Square root'], ['∛', 'Cube root'], ['%', 'Percent'], ['‰', 'Per mille']].map(([value, name]) => ({ value, name })) },
  { label: 'Comparison and logic', symbols: [['<', 'Less than'], ['>', 'Greater than'], ['≤', 'Less than or equal'], ['≥', 'Greater than or equal'], ['≡', 'Identical to'], ['∴', 'Therefore'], ['∵', 'Because'], ['⇒', 'Implies'], ['⇔', 'If and only if'], ['¬', 'Not'], ['∧', 'And'], ['∨', 'Or']].map(([value, name]) => ({ value, name })) },
  { label: 'Algebra and sets', symbols: [['∈', 'Element of'], ['∉', 'Not element of'], ['⊂', 'Proper subset'], ['⊃', 'Proper superset'], ['⊆', 'Subset or equal'], ['⊇', 'Superset or equal'], ['∩', 'Intersection'], ['∪', 'Union'], ['∅', 'Empty set'], ['ℝ', 'Real numbers'], ['ℤ', 'Integers'], ['ℕ', 'Natural numbers'], ['ℚ', 'Rational numbers'], ['ℂ', 'Complex numbers'], ['|x|', 'Absolute value'], ['‖x‖', 'Norm']].map(([value, name]) => ({ value, name })) },
  { label: 'Greek letters', symbols: [['α', 'Alpha'], ['β', 'Beta'], ['γ', 'Gamma'], ['δ', 'Delta'], ['ε', 'Epsilon'], ['ζ', 'Zeta'], ['η', 'Eta'], ['θ', 'Theta'], ['λ', 'Lambda'], ['μ', 'Mu'], ['π', 'Pi'], ['ρ', 'Rho'], ['σ', 'Sigma'], ['τ', 'Tau'], ['φ', 'Phi'], ['ω', 'Omega'], ['Δ', 'Capital delta'], ['Σ', 'Capital sigma'], ['Π', 'Capital pi'], ['Ω', 'Capital omega'], ['Γ', 'Capital gamma'], ['Λ', 'Capital lambda'], ['Φ', 'Capital phi']].map(([value, name]) => ({ value, name })) },
  { label: 'Calculus', symbols: [['∫', 'Integral'], ['∬', 'Double integral'], ['∭', 'Triple integral'], ['∮', 'Contour integral'], ['∂', 'Partial derivative'], ['∇', 'Nabla'], ['d/dx', 'Derivative'], ['lim', 'Limit'], ['→', 'Approaches'], ['∑', 'Summation'], ['∏', 'Product'], ['dy/dx', 'Derivative dy dx'], ['δx', 'Small change in x'], ['Δx', 'Change in x'], ['∞', 'Infinity']].map(([value, name]) => ({ value, name })) },
  { label: 'Vectors', symbols: [['→', 'Right arrow'], ['←', 'Left arrow'], ['↑', 'Up arrow'], ['↓', 'Down arrow'], ['↔', 'Left-right arrow'], ['⇀', 'Right harpoon'], ['↼', 'Left harpoon'], ['·', 'Dot product'], ['×', 'Cross product'], ['‖v‖', 'Vector norm'], ['|v|', 'Vector magnitude'], ['î', 'i hat'], ['ĵ', 'j hat'], ['k̂', 'k hat'], ['∙', 'Bullet operator'], ['⊗', 'Tensor product']].map(([value, name]) => ({ value, name })) },
  { label: 'Geometry and trigonometry', symbols: [['∠', 'Angle'], ['∟', 'Right angle'], ['⊥', 'Perpendicular'], ['∥', 'Parallel'], ['≅', 'Congruent'], ['~', 'Similar'], ['△', 'Triangle'], ['□', 'Square'], ['○', 'Circle'], ['π', 'Pi'], ['sin', 'Sine'], ['cos', 'Cosine'], ['tan', 'Tangent'], ['sin⁻¹', 'Inverse sine'], ['cos⁻¹', 'Inverse cosine'], ['tan⁻¹', 'Inverse tangent']].map(([value, name]) => ({ value, name })) }
];

const MATH_TEMPLATES = [
  ['Quadratic formula', 'x = (−b ± √(b²−4ac)) / 2a'],
  ['Pythagorean theorem', 'a² + b² = c²'],
  ['Distance formula', 'd = √((x₂−x₁)² + (y₂−y₁)²)'],
  ['Gradient formula', 'm = (y₂−y₁) / (x₂−x₁)'],
  ['Standard form of a line', 'y = mx + b'],
  ['Circle equation', '(x−h)² + (y−k)² = r²'],
  ['Derivative definition', "f'(x) = lim(h→0) [f(x+h)−f(x)] / h"],
  ['Chain rule', 'dy/dx = dy/du · du/dx'],
  ['Product rule', "d/dx[f·g] = f'g + fg'"],
  ['Quotient rule', "d/dx[f/g] = (f'g − fg') / g²"],
  ['Integration by parts', '∫u dv = uv − ∫v du'],
  ['Fundamental theorem of calculus', '∫[a→b] f(x)dx = F(b) − F(a)'],
  ['Binomial theorem', '(a+b)ⁿ = Σ C(n,r) aⁿ⁻ʳ bʳ'],
  ['Vector magnitude', '|v| = √(x² + y² + z²)'],
  ['Dot product', 'a·b = |a||b|cosθ'],
  ['Cross product magnitude', '|a×b| = |a||b|sinθ'],
  ['Sum of arithmetic series', 'Sₙ = n/2(a + l)'],
  ['Sum of geometric series', 'Sₙ = a(1−rⁿ)/(1−r)'],
  ['Compound interest', 'A = P(1 + r/n)ⁿᵗ'],
  ['Normal distribution', 'f(x) = (1/σ√2π) e^(−(x−μ)²/2σ²)']
].map(([label, formula]) => ({ label, formula }));

const SUPERSCRIPT_DIGITS: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ', t: 'ᵗ' };
const SUBSCRIPT_DIGITS: Record<string, string> = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎', a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ', r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ' };

function hasSecondaryToolSettings(nextTool: Tool) {
  return SECONDARY_TOOL_SET.has(nextTool);
}

function makeCircularCursor(diameter: number, stroke: string, fill: string, fillOpacity = 0.16, fallback = 'crosshair') {
  const size = Math.round(clamp(diameter, 8, 96));
  const centre = size / 2;
  const radius = Math.max(2, centre - 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${centre}" cy="${centre}" r="${radius}" fill="${fill}" fill-opacity="${fillOpacity}" stroke="${stroke}" stroke-width="2"/><circle cx="${centre}" cy="${centre}" r="1.5" fill="${stroke}"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${centre} ${centre}, ${fallback}`;
}

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

type OnboardingPhase = 'intro' | 'welcome' | 'tour' | 'complete';

type OnboardingStep = {
  title: string;
  text: string;
  target: string;
  animationClass?: string;
};

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    title: 'Your writing tools',
    text: 'Pen, Highlighter, Eraser, Text, Select and more. Use keyboard shortcuts — B for Pen, H for Highlighter, T for Text, S for Select.',
    target: '[data-tour-id="toolbar"]',
    animationClass: 'tour-tools-sweep'
  },
  {
    title: 'Your document library',
    text: 'All your documents, folders and tags live here. Click the DN logo or collapse arrow to hide the sidebar and maximise writing space.',
    target: '[data-tour-id="sidebar"]'
  },
  {
    title: 'Quick access to everything',
    text: 'Dux AI, Scratch notes, Study schedule, Flashcards, Tips, Settings and Dark mode — all one click away on the right.',
    target: '[data-tour-id="right-utility"]',
    animationClass: 'tour-utility-pulse'
  },
  {
    title: 'Plan your study sessions',
    text: 'Create study blocks on a calendar, link them to your notes, and get notified when it is time to study. The AI generator fills your whole schedule from one sentence.',
    target: '[data-tour-id="study-schedule"]'
  },
  {
    title: 'Study smarter with flashcards',
    text: 'Create decks from your notes with spaced repetition. The built-in generator creates real HSC questions automatically when you describe your topic.',
    target: '[data-tour-id="flashcards"]'
  },
  {
    title: 'Ask Dux AI anything',
    text: 'HSC topics, maths problems, essay help, coding — Dux AI answers any question and knows which document you have open.',
    target: '[data-tour-id="dux-ai"]'
  },
  {
    title: 'Always in control',
    text: 'Your clock, tips, zoom, page number and save status are always visible here. Everything saves locally and automatically — your data never leaves your computer.',
    target: '[data-tour-id="bottom-bar"]'
  }
];

type NoteTheme = {
  id: NoteThemeId;
  name: string;
  description: string;
  background: string;
  accent: string;
  text: string;
  muted: string;
  backgroundRgb: string;
  accentRgb: string;
  textRgb: string;
  mutedRgb: string;
};

const NOTE_THEMES: Record<string, NoteTheme> = {
  ecru: {
    id: 'ecru',
    name: 'Focused Ecru',
    description: 'warm, calm study paper',
    background: '#F1E9D2',
    accent: '#C2B280',
    text: '#000080',
    muted: '#708090',
    backgroundRgb: '241, 233, 210',
    accentRgb: '194, 178, 128',
    textRgb: '0, 0, 128',
    mutedRgb: '112, 128, 144'
  },
  sage: {
    id: 'sage',
    name: 'Sage & Slate',
    description: 'soft grey-white and sage',
    background: '#F1F3F2',
    accent: '#84968B',
    text: '#2F3E46',
    muted: '#647077',
    backgroundRgb: '241, 243, 242',
    accentRgb: '132, 150, 139',
    textRgb: '47, 62, 70',
    mutedRgb: '100, 112, 119'
  },
  terracotta: {
    id: 'terracotta',
    name: 'Terracotta & Parchment',
    description: 'warm creative workspace',
    background: '#FDF8F5',
    accent: '#E27D60',
    text: '#412219',
    muted: '#80594E',
    backgroundRgb: '253, 248, 245',
    accentRgb: '226, 125, 96',
    textRgb: '65, 34, 25',
    mutedRgb: '128, 89, 78'
  },
  cyberpunk: {
    id: 'cyberpunk',
    name: 'Cyberpunk Night',
    description: 'dark, sharp, high contrast',
    background: '#0D0D0D',
    accent: '#00FFD1',
    text: '#FFFFFF',
    muted: '#8AEFE0',
    backgroundRgb: '13, 13, 13',
    accentRgb: '0, 255, 209',
    textRgb: '255, 255, 255',
    mutedRgb: '138, 239, 224'
  },
  lavender: {
    id: 'lavender',
    name: 'Lavender Mist',
    description: 'soft and minimal',
    background: '#F9F7FF',
    accent: '#B5A8D5',
    text: '#2D283E',
    muted: '#6C6383',
    backgroundRgb: '249, 247, 255',
    accentRgb: '181, 168, 213',
    textRgb: '45, 40, 62',
    mutedRgb: '108, 99, 131'
  }
};

const THEME_OPTIONS = Object.values(NOTE_THEMES);

type UiMode = 'light' | 'dark';

type ThemeChrome = {
  uiBg: string;
  uiPanel: string;
  uiPanel2: string;
  uiText: string;
  uiMuted: string;
  uiBorder: string;
  uiShadow: string;
  sidebarBg: string;
  topbarBg: string;
  toolbarBg: string;
  buttonBg: string;
  buttonFg: string;
  chipBg: string;
  chipFg: string;
  chipActiveBg: string;
  chipActiveFg: string;
  canvasBg: string;
  danger: string;
};


type RgbColour = { r: number; g: number; b: number };

function hexToRgb(value: string): RgbColour | null {
  const clean = value.trim().replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(clean)) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16)
  };
}

function rgbToHex({ r, g, b }: RgbColour): string {
  return `#${[r, g, b].map((part) => Math.round(clamp(part, 0, 255)).toString(16).padStart(2, '0')).join('')}`;
}

function rgbStringFromHex(value: string): string {
  const rgb = hexToRgb(value) || { r: 17, g: 24, b: 39 };
  return `${rgb.r}, ${rgb.g}, ${rgb.b}`;
}

function mixHex(a: string, b: string, amount = 0.5): string {
  const first = hexToRgb(a) || { r: 255, g: 255, b: 255 };
  const second = hexToRgb(b) || { r: 0, g: 0, b: 0 };
  return rgbToHex({
    r: first.r * (1 - amount) + second.r * amount,
    g: first.g * (1 - amount) + second.g * amount,
    b: first.b * (1 - amount) + second.b * amount
  });
}

function colourLuminance(hex: string): number {
  const rgb = hexToRgb(hex) || { r: 255, g: 255, b: 255 };
  const parts = [rgb.r, rgb.g, rgb.b].map((value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2];
}

function readableTextForBackground(background: string): string {
  return colourLuminance(background) > 0.56 ? '#211A22' : '#F8F5EE';
}

function mutedTextForTheme(background: string, text: string): string {
  return mixHex(text, background, colourLuminance(background) > 0.56 ? 0.38 : 0.32);
}

function makeNoteTheme(id: string, name: string, description: string, background: string, accent: string, text?: string): NoteTheme {
  const safeBackground = safeHexColour(background, '#F9F7FF');
  const safeAccent = safeHexColour(accent, '#B5A8D5');
  const safeText = safeHexColour(text || readableTextForBackground(safeBackground), readableTextForBackground(safeBackground));
  const muted = mutedTextForTheme(safeBackground, safeText);
  return {
    id,
    name: name.trim() || 'Custom theme',
    description: description.trim() || 'custom saved colour scheme',
    background: safeBackground,
    accent: safeAccent,
    text: safeText,
    muted,
    backgroundRgb: rgbStringFromHex(safeBackground),
    accentRgb: rgbStringFromHex(safeAccent),
    textRgb: rgbStringFromHex(safeText),
    mutedRgb: rgbStringFromHex(muted)
  };
}

function deriveThemeChrome(theme: NoteTheme): ThemeChrome {
  const isDark = colourLuminance(theme.background) < 0.42;
  const panel = isDark ? mixHex(theme.background, '#FFFFFF', 0.08) : mixHex(theme.background, '#FFFFFF', 0.62);
  const panel2 = isDark ? mixHex(theme.background, '#FFFFFF', 0.15) : mixHex(theme.background, theme.accent, 0.16);
  const borderRgb = isDark ? '255, 255, 255' : rgbStringFromHex(theme.text);
  return {
    uiBg: isDark ? mixHex(theme.background, '#000000', 0.16) : mixHex(theme.background, '#FFFFFF', 0.18),
    uiPanel: panel,
    uiPanel2: panel2,
    uiText: theme.text,
    uiMuted: theme.muted,
    uiBorder: `rgba(${borderRgb}, ${isDark ? '0.16' : '0.14'})`,
    uiShadow: isDark ? 'rgba(0, 0, 0, 0.46)' : `rgba(${rgbStringFromHex(theme.text)}, 0.14)`,
    sidebarBg: isDark ? mixHex(theme.background, '#000000', 0.08) : mixHex(theme.background, theme.accent, 0.10),
    topbarBg: panel,
    toolbarBg: panel2,
    buttonBg: theme.accent,
    buttonFg: readableTextForBackground(theme.accent),
    chipBg: isDark ? mixHex(theme.background, '#FFFFFF', 0.10) : mixHex(theme.background, '#FFFFFF', 0.48),
    chipFg: theme.text,
    chipActiveBg: theme.accent,
    chipActiveFg: readableTextForBackground(theme.accent),
    canvasBg: isDark ? mixHex(theme.background, '#000000', 0.08) : mixHex(theme.background, '#000000', 0.04),
    danger: isDark ? '#FF7A7A' : '#B42318'
  };
}

const LIGHT_CHROME: Record<string, ThemeChrome> = {
  ecru: {
    uiBg: '#E8E4DF',
    uiPanel: '#EEE9E2',
    uiPanel2: '#DDD6CC',
    uiText: '#2C1C10',
    uiMuted: '#735F48',
    uiBorder: 'rgba(64, 43, 22, 0.10)',
    uiShadow: 'rgba(64, 43, 22, 0.14)',
    sidebarBg: '#E5DED5',
    topbarBg: '#EEE9E2',
    toolbarBg: '#E5DFD7',
    buttonBg: '#4D3218',
    buttonFg: '#FFF8E9',
    chipBg: '#EDE6DE',
    chipFg: '#5A3A1A',
    chipActiveBg: '#4D3218',
    chipActiveFg: '#FFF8E9',
    canvasBg: '#E2DDD7',
    danger: '#B42318'
  },
  sage: {
    uiBg: '#E2E6E3',
    uiPanel: '#E8ECE9',
    uiPanel2: '#D5DDD8',
    uiText: '#263840',
    uiMuted: '#5E6F69',
    uiBorder: 'rgba(38, 56, 64, 0.10)',
    uiShadow: 'rgba(38, 56, 64, 0.14)',
    sidebarBg: '#DDE4DF',
    topbarBg: '#E8ECE9',
    toolbarBg: '#DDE4DF',
    buttonBg: '#607B69',
    buttonFg: '#F8FAF8',
    chipBg: '#EAF0EC',
    chipFg: '#40524A',
    chipActiveBg: '#607B69',
    chipActiveFg: '#FFFFFF',
    canvasBg: '#DDE4DF',
    danger: '#B54708'
  },
  terracotta: {
    uiBg: '#E9CDBF',
    uiPanel: '#EED7CC',
    uiPanel2: '#DFAF9C',
    uiText: '#3A1D14',
    uiMuted: '#7B4E40',
    uiBorder: 'rgba(92, 38, 23, 0.11)',
    uiShadow: 'rgba(92, 38, 23, 0.18)',
    sidebarBg: '#D76B4A',
    topbarBg: '#EED7CC',
    toolbarBg: '#E4C2B4',
    buttonBg: '#8F3B26',
    buttonFg: '#FFF6EF',
    chipBg: '#F0D8CD',
    chipFg: '#5C2617',
    chipActiveBg: '#8F3B26',
    chipActiveFg: '#FFF6EF',
    canvasBg: '#E2C5B7',
    danger: '#7A1710'
  },
  cyberpunk: {
    uiBg: '#1E1E1E',
    uiPanel: '#242424',
    uiPanel2: '#171D22',
    uiText: '#F6FFFD',
    uiMuted: '#79FBEA',
    uiBorder: 'rgba(0, 255, 209, 0.26)',
    uiShadow: 'rgba(0, 0, 0, 0.5)',
    sidebarBg: '#1A1A1A',
    topbarBg: '#222222',
    toolbarBg: '#191F24',
    buttonBg: '#00FFD1',
    buttonFg: '#00130F',
    chipBg: '#202C2D',
    chipFg: '#9FFFF3',
    chipActiveBg: '#00FFD1',
    chipActiveFg: '#00130F',
    canvasBg: '#151515',
    danger: '#FF3B8A'
  },
  lavender: {
    uiBg: '#E8E1F0',
    uiPanel: '#EEE8F4',
    uiPanel2: '#DCD2EA',
    uiText: '#2D283E',
    uiMuted: '#71678C',
    uiBorder: 'rgba(68, 52, 105, 0.10)',
    uiShadow: 'rgba(68, 52, 105, 0.14)',
    sidebarBg: '#E5DDEE',
    topbarBg: '#EEE8F4',
    toolbarBg: '#E8E0F1',
    buttonBg: '#765BB2',
    buttonFg: '#FFFFFF',
    chipBg: '#EFE8F8',
    chipFg: '#443469',
    chipActiveBg: '#765BB2',
    chipActiveFg: '#FFFFFF',
    canvasBg: '#E0D8EA',
    danger: '#A32155'
  }
};

function getThemeChrome(theme: NoteTheme, uiMode: UiMode): ThemeChrome {
  const light = LIGHT_CHROME[theme.id] || deriveThemeChrome(theme);
  if (uiMode === 'light' || theme.id === 'cyberpunk') return light;
  return {
    uiBg: '#2A2D3E',
    uiPanel: '#303449',
    uiPanel2: '#363B52',
    uiText: '#F8F5EE',
    uiMuted: '#D4CEC3',
    uiBorder: 'rgba(255, 255, 255, 0.08)',
    uiShadow: 'rgba(0, 0, 0, 0.5)',
    sidebarBg: '#252938',
    topbarBg: '#303449',
    toolbarBg: '#303449',
    buttonBg: light.buttonBg,
    buttonFg: light.buttonFg,
    chipBg: '#32374C',
    chipFg: '#F8F5EE',
    chipActiveBg: light.buttonBg,
    chipActiveFg: light.buttonFg,
    canvasBg: '#262A38',
    danger: '#FF6B6B'
  };
}

function getDisplayPageTheme(theme: NoteTheme, uiMode: UiMode): NoteTheme {
  if (uiMode !== 'dark' || colourLuminance(theme.background) <= 0.72) return theme;
  const background = mixHex(theme.background, '#F5F5F0', 0.72);
  return {
    ...theme,
    background,
    backgroundRgb: rgbStringFromHex(background)
  };
}

const TIPS = [
  'Before you start a session, write one target: “By the end, I can answer ___ without notes.”',
  'For Maths and Physics, keep a mistake list. The same error showing up twice is a revision target.',
  'For English, use short quotes. The analysis should do the heavy lifting, not the quote.',
  'For Chemistry, write the equation, then the observation, then the explanation. Do not skip the link.',
  'For Studies of Religion, define the belief, connect it to practice, then explain its impact on adherents.',
  'Use flashcards for definitions and traps. Use practice questions for full marks.',
  'A 45-minute block works best when it ends with five minutes of recall from a blank page.',
  'If you feel stuck, ask Dux AI to turn the question into steps before you try the answer.',
  'Press the DN logo to collapse or reopen the library, so your writing space stays wide.'
];
const THEME_STORAGE_KEY = 'local-notes-theme-id';
const UI_MODE_STORAGE_KEY = 'local-notes-ui-mode';
const BUTTON_SIZE_STORAGE_KEY = 'dux-notes-button-size';
const CUSTOM_FOLDERS_STORAGE_KEY = 'local-notes-custom-folders';
const FOLDER_PATHS_STORAGE_KEY = 'local-notes-folder-paths';
const CUSTOM_TAGS_STORAGE_KEY = 'dux-notes-custom-tags';
const STUDY_SCHEDULE_STORAGE_KEY = 'dux-notes-study-schedule';
const FLASHCARD_STORAGE_KEY = 'dux-notes-flashcards';
const SCRATCHPAD_STORAGE_KEY = 'dux-notes-scratchpad';
const CUSTOM_THEMES_STORAGE_KEY = 'dux-notes-custom-colour-schemes';
const AI_CHAT_MEMORY_STORAGE_KEY = 'dux-notes-ai-chat-memory';
const AI_CHAT_MEMORY_LIMIT = 24;
const WEEK_START_HOUR = 7;
const WEEK_END_HOUR = 23;
const WEEK_ROW_HEIGHT = 60;
const WEEK_ROW_HEIGHT_STORAGE_KEY = 'dux-notes-week-row-height';
const WEEK_ROW_HEIGHT_STEPS = [30, 45, 60, 90, 120];
const STUDY_NOTIFICATION_STORAGE_PREFIX = 'dux-notes-study-notification:';



type LabelOption = {
  id: LabelId | '';
  name: string;
  icon: string;
  bg: string;
  fg: string;
};

type StudyScheduleItem = {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  subject: string;
  note: string;
  colour: string;
  completed: boolean;
  linkedDocId?: string | null;
  linkedDocName?: string | null;
  linkedPageIndex?: number | null;
  linkedDeck?: string | null;
  createdAt: string;
  updatedAt: string;
};

type StudyScheduleDraft = {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  subject: string;
  note: string;
  colour: string;
  completed: boolean;
  linkedDocId: string;
  linkedDocName: string;
  linkedPageIndex: number | null;
  linkedDeck: string;
};

type StudyNotificationKind = 'now' | 'soon' | 'complete';

type StudyNotificationBanner = {
  id: string;
  kind: StudyNotificationKind;
  sessionId: string;
  title: string;
  message: string;
  startTime: string;
  subject: string;
  linkedDocId?: string | null;
  linkedDocName?: string | null;
};


type FlashcardRating = 'again' | 'hard' | 'good' | 'easy';

type Flashcard = {
  id: string;
  deck: string;
  front: string;
  back: string;
  dueDate: string;
  linkedDocId?: string | null;
  linkedDocName?: string | null;
  createdAt: string;
  updatedAt: string;
  lastRating?: FlashcardRating | null;
};

type FlashcardDraft = {
  front: string;
  back: string;
  deck: string;
};

type FlashcardSource = {
  front: string;
  docId?: string | null;
  docName?: string | null;
};

type GeneratedFlashcardPreview = {
  id: string;
  front: string;
  back: string;
  deck: string;
};

type ImportedAnkiCard = {
  front: string;
  back: string;
};

type AnkiImportPreview = {
  fileName: string;
  deckName: string;
  cards: ImportedAnkiCard[];
};

type WeekLayoutItem = {
  item: StudyScheduleItem;
  column: number;
  columns: number;
};

type ReviewSummary = Record<FlashcardRating, number>;

type AiScheduleItem = {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  subject: string;
  notes?: string;
  linkedDeck?: string | null;
};

type ShapeOptionGroup = {
  label: string;
  options: { value: ShapeKind; label: string }[];
};

const SHAPE_OPTION_GROUPS: ShapeOptionGroup[] = [
  { label: 'Basic', options: [
    { value: 'rectangle', label: 'Rectangle' },
    { value: 'rounded-rectangle', label: 'Rounded Rectangle' },
    { value: 'ellipse', label: 'Circle / Oval' },
    { value: 'line', label: 'Line' },
    { value: 'line-arrow', label: 'Arrow Line' }
  ]},
  { label: 'Geometric polygons', options: [
    { value: 'triangle-isosceles', label: 'Isosceles Triangle' },
    { value: 'triangle-right', label: 'Right Triangle' },
    { value: 'trapezoid', label: 'Trapezoid' },
    { value: 'diamond', label: 'Diamond' },
    { value: 'pentagon', label: 'Pentagon' },
    { value: 'hexagon', label: 'Hexagon' },
    { value: 'heptagon', label: 'Heptagon' },
    { value: 'octagon', label: 'Octagon' },
    { value: 'decagon', label: 'Decagon' },
    { value: 'dodecagon', label: 'Dodecagon' }
  ]},
  { label: 'Rectangle variations', options: [
    { value: 'snip-single-corner-rectangle', label: 'Snip Single Corner Rectangle' },
    { value: 'snip-same-side-corner-rectangle', label: 'Snip Same Side Corner Rectangle' },
    { value: 'snip-diagonal-corner-rectangle', label: 'Snip Diagonal Corner Rectangle' },
    { value: 'round-single-corner-rectangle', label: 'Round Single Corner Rectangle' },
    { value: 'round-same-side-corner-rectangle', label: 'Round Same Side Corner Rectangle' }
  ]},
  { label: '3D and frames', options: [
    { value: 'cube', label: 'Cube' },
    { value: 'cylinder', label: 'Cylinder' },
    { value: 'plaque', label: 'Plaque' },
    { value: 'frame', label: 'Frame' },
    { value: 'half-frame', label: 'Half Frame' },
    { value: 'bevel', label: 'Bevel' },
    { value: 'folded-corner', label: 'Folded Corner' }
  ]},
  { label: 'Common symbols', options: [
    { value: 'donut', label: 'Donut' },
    { value: 'chord', label: 'Chord' },
    { value: 'pie', label: 'Pie' },
    { value: 'arc', label: 'Arc' },
    { value: 'block-arc', label: 'Block Arc' },
    { value: 'smiley', label: 'Smiley Face' },
    { value: 'heart', label: 'Heart' },
    { value: 'sun', label: 'Sun' },
    { value: 'moon', label: 'Moon' },
    { value: 'cloud', label: 'Cloud' },
    { value: 'lightning', label: 'Lightning Bolt' },
    { value: 'prohibited', label: 'Prohibited Symbol' },
    { value: 'l-shape', label: 'L Shape' },
    { value: 'u-shape', label: 'U Shape' }
  ]},
  { label: 'Flowchart', options: [
    { value: 'flow-process', label: 'Process' },
    { value: 'flow-decision', label: 'Decision' },
    { value: 'flow-terminator', label: 'Terminator' },
    { value: 'flow-data', label: 'Data' },
    { value: 'flow-document', label: 'Document' },
    { value: 'flow-multidocument', label: 'Multidocument' },
    { value: 'flow-preparation', label: 'Preparation' }
  ]},
  { label: 'Block arrows', options: [
    { value: 'arrow-right', label: 'Right Arrow' },
    { value: 'arrow-left', label: 'Left Arrow' },
    { value: 'arrow-up', label: 'Up Arrow' },
    { value: 'arrow-down', label: 'Down Arrow' },
    { value: 'arrow-left-right', label: 'Left-Right Arrow' },
    { value: 'arrow-up-down', label: 'Up-Down Arrow' },
    { value: 'arrow-quad', label: 'Four-way Arrow' },
    { value: 'arrow-bent', label: 'Bent Arrow' },
    { value: 'arrow-uturn', label: 'U-Turn Arrow' },
    { value: 'chevron', label: 'Chevron' },
    { value: 'arrow-pentagon', label: 'Pentagon Arrow' },
    { value: 'arrow-striped-right', label: 'Striped Right Arrow' },
    { value: 'arrow-curved-right', label: 'Curved Right Arrow' },
    { value: 'arrow-curved-left', label: 'Curved Left Arrow' },
    { value: 'arrow-curved-up', label: 'Curved Up Arrow' },
    { value: 'arrow-curved-down', label: 'Curved Down Arrow' }
  ]},
  { label: 'Arrow callouts', options: [
    { value: 'callout-right', label: 'Right Arrow Callout' },
    { value: 'callout-left', label: 'Left Arrow Callout' },
    { value: 'callout-up', label: 'Up Arrow Callout' },
    { value: 'callout-down', label: 'Down Arrow Callout' },
    { value: 'callout-left-right', label: 'Left-Right Arrow Callout' },
    { value: 'callout-up-down', label: 'Up-Down Arrow Callout' },
    { value: 'callout-quad', label: 'Quad Arrow Callout' }
  ]},
  { label: 'Callouts', options: [
    { value: 'callout-rect', label: 'Rectangular Speech Bubble' },
    { value: 'callout-round', label: 'Rounded Speech Bubble' },
    { value: 'callout-oval', label: 'Oval Speech Bubble' },
    { value: 'thought-cloud', label: 'Cloud Thought Bubble' }
  ]},
  { label: 'Stars and bursts', options: [
    { value: 'star-4', label: '4-point Star' },
    { value: 'star-5', label: '5-point Star' },
    { value: 'star-6', label: '6-point Star' },
    { value: 'star-7', label: '7-point Star' },
    { value: 'star-8', label: '8-point Star' },
    { value: 'star-10', label: '10-point Star' },
    { value: 'star-12', label: '12-point Star' },
    { value: 'star-16', label: '16-point Star' },
    { value: 'star-24', label: '24-point Star' },
    { value: 'star-32', label: '32-point Star' },
    { value: 'burst-1', label: 'Explosion 1' },
    { value: 'burst-2', label: 'Explosion 2' }
  ]},
  { label: 'Banners and scrolls', options: [
    { value: 'scroll-vertical', label: 'Vertical Scroll' },
    { value: 'scroll-horizontal', label: 'Horizontal Scroll' },
    { value: 'ribbon-up', label: 'Up Ribbon' },
    { value: 'ribbon-down', label: 'Down Ribbon' }
  ]},
  { label: 'Equations', options: [
    { value: 'equation-plus', label: 'Plus' },
    { value: 'equation-minus', label: 'Minus' },
    { value: 'equation-multiply', label: 'Multiplication' },
    { value: 'equation-divide', label: 'Division' },
    { value: 'equation-equals', label: 'Equals' },
    { value: 'equation-not-equal', label: 'Not Equal To' }
  ]},
  { label: 'Connectors', options: [
    { value: 'elbow-connector', label: 'Elbow Connector' },
    { value: 'curved-connector', label: 'Curved Connector' },
    { value: 'curve', label: 'Curve' },
    { value: 'polyline', label: 'Polyline' },
    { value: 'scribble', label: 'Scribble' }
  ]}
];

const STUDY_COLOURS = ['#765BB2', '#E27D60', '#16A34A', '#2563EB', '#F59E0B', '#DB2777', '#0891B2', '#7C3AED'];

const LABEL_OPTIONS: LabelOption[] = [
  { id: '', name: 'No tag', icon: '○', bg: 'var(--chip-bg)', fg: 'var(--chip-fg)' },
  { id: 'urgent', name: 'Urgent', icon: '🔴', bg: '#FEE2E2', fg: '#991B1B' },
  { id: 'progress', name: 'In progress', icon: '🟡', bg: '#FEF3C7', fg: '#92400E' },
  { id: 'done', name: 'Done', icon: '🟢', bg: '#DCFCE7', fg: '#166534' },
  { id: 'review', name: 'Review', icon: '🔵', bg: '#DBEAFE', fg: '#1E40AF' },
  { id: 'archived', name: 'Archived', icon: '⚫', bg: '#E5E7EB', fg: '#111827' }
];

const SYSTEM_TAGS = new Set(['quick-note']);

function getLabelOption(label?: LabelId | null) {
  return LABEL_OPTIONS.find((item) => item.id === (label || '')) || LABEL_OPTIONS[0];
}

function getDocumentCustomTags(doc?: DocumentRecord | null) {
  return (doc?.tags || []).map((tag) => tag.trim()).filter((tag) => tag && !SYSTEM_TAGS.has(tag));
}

function makeCustomTagOption(tag: string): LabelOption {
  return { id: '', name: tag, icon: '#', bg: 'var(--chip-bg)', fg: 'var(--chip-fg)' };
}

function getDocumentTagOption(doc?: DocumentRecord | null) {
  if (doc?.label) return getLabelOption(doc.label);
  const customTag = getDocumentCustomTags(doc)[0];
  return customTag ? makeCustomTagOption(customTag) : LABEL_OPTIONS[0];
}

const FONT_OPTIONS = [
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Poppins',
  'Manrope',
  'Arial',
  'Calibri',
  'Lora',
  'Merriweather',
  'Georgia',
  'Bitter',
  'Wildera',
  'Mindfulness',
  'Simple Handwriting',
  'Playfair Display'
];

const makeId = () => crypto.randomUUID();

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function isNoteThemeId(value: string | undefined | null): value is NoteThemeId {
  return Boolean(value && Object.prototype.hasOwnProperty.call(NOTE_THEMES, value));
}

function readCustomThemes(): NoteTheme[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === 'object')
      .map((item) => makeNoteTheme(
        typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `custom-${makeId()}`,
        typeof item.name === 'string' ? item.name : 'Custom theme',
        typeof item.description === 'string' ? item.description : 'custom saved colour scheme',
        typeof item.background === 'string' ? item.background : '#F9F7FF',
        typeof item.accent === 'string' ? item.accent : '#B5A8D5',
        typeof item.text === 'string' ? item.text : undefined
      ))
      .slice(0, 24);
  } catch {
    return [];
  }
}

function saveCustomThemes(themes: NoteTheme[]) {
  window.localStorage.setItem(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify(themes.slice(0, 24)));
}

function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read image'));
    reader.readAsDataURL(file);
  });
}

function loadImageElementForTheme(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load image'));
    image.src = src;
  });
}

function colourDistance(a: RgbColour, b: RgbColour): number {
  return (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2;
}

function saturation(rgb: RgbColour): number {
  const high = Math.max(rgb.r, rgb.g, rgb.b);
  const low = Math.min(rgb.r, rgb.g, rgb.b);
  return high - low;
}

async function extractDominantColoursFromImage(file: File): Promise<string[]> {
  const dataUrl = await readImageAsDataUrl(file);
  const image = await loadImageElementForTheme(dataUrl);
  const canvas = document.createElement('canvas');
  const size = 96;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return [];
  context.drawImage(image, 0, 0, size, size);
  const data = context.getImageData(0, 0, size, size).data;
  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 16) {
    const alpha = data[i + 3];
    if (alpha < 120) continue;
    const raw: RgbColour = { r: data[i], g: data[i + 1], b: data[i + 2] };
    if (raw.r > 245 && raw.g > 245 && raw.b > 245) continue;
    if (raw.r < 10 && raw.g < 10 && raw.b < 10) continue;
    const bucket: RgbColour = {
      r: Math.round(raw.r / 28) * 28,
      g: Math.round(raw.g / 28) * 28,
      b: Math.round(raw.b / 28) * 28
    };
    const key = `${bucket.r}-${bucket.g}-${bucket.b}`;
    const current = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
    current.count += 1;
    current.r += raw.r;
    current.g += raw.g;
    current.b += raw.b;
    buckets.set(key, current);
  }

  const ranked = Array.from(buckets.values())
    .map((bucket) => ({
      count: bucket.count,
      rgb: {
        r: bucket.r / bucket.count,
        g: bucket.g / bucket.count,
        b: bucket.b / bucket.count
      }
    }))
    .sort((a, b) => (b.count + saturation(b.rgb) * 0.12) - (a.count + saturation(a.rgb) * 0.12));

  const selected: RgbColour[] = [];
  for (const item of ranked) {
    if (selected.every((existing) => colourDistance(existing, item.rgb) > 1300)) selected.push(item.rgb);
    if (selected.length >= 3) break;
  }
  return selected.map(rgbToHex);
}

function getStoredThemeId(): NoteThemeId {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (!stored) return DEFAULT_THEME_ID;
  if (isNoteThemeId(stored)) return stored;
  return readCustomThemes().some((theme) => theme.id === stored) ? stored : DEFAULT_THEME_ID;
}



function isHexColour(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value.trim());
}

function getStoredColour(key: string, fallback: string): string {
  const stored = window.localStorage.getItem(key);
  if (stored === 'transparent') return stored;
  if (stored && isHexColour(stored)) return stored.trim();
  return fallback;
}

function safeHexColour(value: string, fallback: string): string {
  if (value && isHexColour(value)) return value;
  return isHexColour(fallback) ? fallback : '#111827';
}
function getStoredHighlighterColour(): string {
  const stored = window.localStorage.getItem(HIGHLIGHTER_COLOUR_STORAGE_KEY);
  if (stored && /^#[0-9a-f]{6}$/i.test(stored.trim())) return stored.trim();
  return HIGHLIGHTER_PRESETS[0].value;
}


function getStoredEraserMode(): EraserMode {
  return window.localStorage.getItem(ERASER_MODE_STORAGE_KEY) === 'object' ? 'object' : 'pixel';
}

function getStoredUiMode(): UiMode {
  return window.localStorage.getItem(UI_MODE_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
}

function getStoredButtonSize(): ButtonSizeMode {
  const stored = window.localStorage.getItem(BUTTON_SIZE_STORAGE_KEY);
  return stored === 'compact' || stored === 'large' ? stored : 'standard';
}

function getStoredCustomFolders(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CUSTOM_FOLDERS_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()) : [];
  } catch {
    return [];
  }
}

function saveCustomFolders(folders: string[]) {
  const clean = Array.from(new Set(folders.map((folder) => folder.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  window.localStorage.setItem(CUSTOM_FOLDERS_STORAGE_KEY, JSON.stringify(clean));
  return clean;
}

function getStoredCustomTags(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CUSTOM_TAGS_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()).filter((item) => !SYSTEM_TAGS.has(item)) : [];
  } catch {
    return [];
  }
}

function saveCustomTags(tags: string[]) {
  const clean = Array.from(new Set(tags.map((tag) => tag.trim()).filter((tag) => tag && !SYSTEM_TAGS.has(tag)))).sort((a, b) => a.localeCompare(b));
  window.localStorage.setItem(CUSTOM_TAGS_STORAGE_KEY, JSON.stringify(clean));
  return clean;
}

function getStoredFolderPaths(): Record<string, string> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FOLDER_PATHS_STORAGE_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([key, value]) => key.trim() && typeof value === 'string' && value.trim())
        .map(([key, value]) => [key.trim(), String(value).trim()])
    );
  } catch {
    return {};
  }
}

function saveFolderPaths(paths: Record<string, string>) {
  const clean = Object.fromEntries(
    Object.entries(paths)
      .filter(([key, value]) => key.trim() && value.trim())
      .map(([key, value]) => [key.trim(), value.trim()])
  );
  window.localStorage.setItem(FOLDER_PATHS_STORAGE_KEY, JSON.stringify(clean));
  return clean;
}

function formatLocalIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function todayIsoDate() {
  return formatLocalIsoDate(new Date());
}

function toDateFromIso(dateIso: string) {
  const safe = dateIso || todayIsoDate();
  const [year, month, day] = safe.split('-').map((part) => Number(part));
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function monthLabel(date: Date) {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function formatScheduleDate(dateIso: string) {
  return toDateFromIso(dateIso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function readStudySchedule(): StudyScheduleItem[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STUDY_SCHEDULE_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === 'object' && typeof item.title === 'string' && typeof item.date === 'string')
      .map((item) => ({
        id: typeof item.id === 'string' ? item.id : makeId(),
        title: item.title || 'Study session',
        date: item.date || todayIsoDate(),
        startTime: item.startTime || '16:00',
        endTime: item.endTime || '17:00',
        subject: item.subject || '',
        note: item.note || '',
        colour: item.colour || '#8F3B26',
        completed: Boolean(item.completed),
        linkedDocId: item.linkedDocId || null,
        linkedDocName: item.linkedDocName || null,
        linkedPageIndex: typeof item.linkedPageIndex === 'number' ? item.linkedPageIndex : null,
        linkedDeck: typeof item.linkedDeck === 'string' ? item.linkedDeck : null,
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.updatedAt || new Date().toISOString()
      }))
      .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
  } catch {
    return [];
  }
}

function saveStudySchedule(items: StudyScheduleItem[]) {
  const sorted = [...items].sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
  window.localStorage.setItem(STUDY_SCHEDULE_STORAGE_KEY, JSON.stringify(sorted));
  return sorted;
}

function readFlashcards(): Flashcard[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FLASHCARD_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === 'object' && typeof item.front === 'string')
      .map((item) => ({
        id: typeof item.id === 'string' ? item.id : makeId(),
        deck: typeof item.deck === 'string' && item.deck.trim() ? item.deck.trim() : 'General',
        front: item.front || '',
        back: typeof item.back === 'string' ? item.back : '',
        dueDate: typeof item.dueDate === 'string' ? item.dueDate : todayIsoDate(),
        linkedDocId: item.linkedDocId || null,
        linkedDocName: item.linkedDocName || null,
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.updatedAt || new Date().toISOString(),
        lastRating: ['again', 'hard', 'good', 'easy'].includes(item.lastRating) ? item.lastRating : null
      }));
  } catch {
    return [];
  }
}

function saveFlashcards(cards: Flashcard[]) {
  const clean = cards.map((card) => ({ ...card, deck: card.deck?.trim() || 'General' }));
  window.localStorage.setItem(FLASHCARD_STORAGE_KEY, JSON.stringify(clean));
  return clean;
}

function addDaysIso(baseIso: string, days: number) {
  const date = toDateFromIso(baseIso || todayIsoDate());
  date.setDate(date.getDate() + days);
  return formatLocalIsoDate(date);
}

function formatAestClock(date: Date) {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${get('weekday')} ${get('day')} ${get('month')} · ${get('hour')}:${get('minute')} ${get('dayPeriod').toLowerCase()}`;
}

function formatAestFullDate(date: Date) {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short'
  }).format(date);
}


function getAestDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return {
    iso: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour') || 0) * 60 + Number(get('minute') || 0)
  };
}

function studyNotificationPriority(kind: StudyNotificationKind) {
  if (kind === 'now') return 0;
  if (kind === 'soon') return 1;
  return 2;
}

function stripHtmlToPlainText(value: string) {
  const div = document.createElement('div');
  div.innerHTML = value;
  return div.textContent || div.innerText || '';
}

function defaultDeckNameFromFile(fileName: string) {
  const base = fileName.replace(/\.(apkg|apkg2|apkj|txt|csv)$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return base ? `Anki - ${smartTitleCase(base)}` : 'Imported Anki Deck';
}

function readUInt16LE(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUInt32LE(bytes: Uint8Array, offset: number) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function readUInt16BE(bytes: Uint8Array, offset: number) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUInt32BE(bytes: Uint8Array, offset: number) {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function findZipEndOfCentralDirectory(bytes: Uint8Array) {
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 70000); offset -= 1) {
    if (readUInt32LE(bytes, offset) === 0x06054b50) return offset;
  }
  return -1;
}

type ZipDirectoryEntry = {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

function parseZipDirectory(bytes: Uint8Array): ZipDirectoryEntry[] {
  const endOffset = findZipEndOfCentralDirectory(bytes);
  if (endOffset < 0) throw new Error('This Anki file is not a readable .apkg package.');
  const totalEntries = readUInt16LE(bytes, endOffset + 10);
  const centralOffset = readUInt32LE(bytes, endOffset + 16);
  const decoder = new TextDecoder('utf-8');
  const entries: ZipDirectoryEntry[] = [];
  let cursor = centralOffset;

  for (let index = 0; index < totalEntries; index += 1) {
    if (readUInt32LE(bytes, cursor) !== 0x02014b50) break;
    const method = readUInt16LE(bytes, cursor + 10);
    const compressedSize = readUInt32LE(bytes, cursor + 20);
    const uncompressedSize = readUInt32LE(bytes, cursor + 24);
    const nameLength = readUInt16LE(bytes, cursor + 28);
    const extraLength = readUInt16LE(bytes, cursor + 30);
    const commentLength = readUInt16LE(bytes, cursor + 32);
    const localHeaderOffset = readUInt32LE(bytes, cursor + 42);
    const name = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + nameLength));
    entries.push({ name, method, compressedSize, uncompressedSize, localHeaderOffset });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function decompressBytesWithStream(data: Uint8Array, format: 'deflate-raw' | 'deflate' | 'zstd') {
  const StreamCtor = (globalThis as unknown as { DecompressionStream?: new (format: string) => TransformStream<Uint8Array, Uint8Array> }).DecompressionStream;
  if (!StreamCtor) throw new Error('This browser cannot unpack compressed Anki packages. Try the desktop app or export from Anki as tab-separated notes.');
  const copy = new Uint8Array(data);
  const stream = new Blob([copy.buffer as ArrayBuffer]).stream().pipeThrough(new StreamCtor(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflateZipEntry(data: Uint8Array) {
  try {
    return await decompressBytesWithStream(data, 'deflate-raw');
  } catch {
    return decompressBytesWithStream(data, 'deflate');
  }
}

async function extractZipEntry(bytes: Uint8Array, wantedNames: string[]) {
  const entries = parseZipDirectory(bytes);
  const entry = wantedNames
    .map((wantedName) => entries.find((item) => item.name.toLowerCase() === wantedName.toLowerCase()))
    .find((item): item is ZipDirectoryEntry => Boolean(item));
  if (!entry) throw new Error('No Anki collection database was found inside this package.');
  const local = entry.localHeaderOffset;
  if (readUInt32LE(bytes, local) !== 0x04034b50) throw new Error('The Anki package has a damaged local file header.');
  const nameLength = readUInt16LE(bytes, local + 26);
  const extraLength = readUInt16LE(bytes, local + 28);
  const dataStart = local + 30 + nameLength + extraLength;
  const compressed = bytes.slice(dataStart, dataStart + entry.compressedSize);
  const data = entry.method === 0 ? compressed : entry.method === 8 ? await inflateZipEntry(compressed) : null;
  if (data) return { name: entry.name, bytes: data };
  throw new Error(`This Anki package uses unsupported ZIP compression method ${entry.method}.`);
}

function readSqliteVarint(bytes: Uint8Array, offset: number) {
  let value = 0;
  let cursor = offset;
  for (let i = 0; i < 9; i += 1) {
    const byte = bytes[cursor++];
    if (i === 8) {
      value = value * 256 + byte;
      break;
    }
    value = value * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) break;
  }
  return { value, next: cursor };
}

function readSignedInteger(bytes: Uint8Array, offset: number, length: number) {
  if (length === 8) {
    let value = 0n;
    for (let i = 0; i < 8; i += 1) value = (value << 8n) | BigInt(bytes[offset + i]);
    if (value & (1n << 63n)) value -= 1n << 64n;
    return Number(value);
  }
  let value = 0;
  for (let i = 0; i < length; i += 1) value = value * 256 + bytes[offset + i];
  const signBit = 2 ** (length * 8 - 1);
  const full = 2 ** (length * 8);
  return value >= signBit ? value - full : value;
}

function parseSqliteRecord(payload: Uint8Array, decoder: TextDecoder): Array<string | number | Uint8Array | null> {
  const header = readSqliteVarint(payload, 0);
  const headerSize = header.value;
  const serials: number[] = [];
  let cursor = header.next;
  while (cursor < headerSize) {
    const serial = readSqliteVarint(payload, cursor);
    serials.push(serial.value);
    cursor = serial.next;
  }

  let dataOffset = headerSize;
  return serials.map((serial) => {
    if (serial === 0) return null;
    if (serial >= 1 && serial <= 6) {
      const lengths = [0, 1, 2, 3, 4, 6, 8];
      const length = lengths[serial];
      const value = readSignedInteger(payload, dataOffset, length);
      dataOffset += length;
      return value;
    }
    if (serial === 7) {
      const value = new DataView(payload.buffer, payload.byteOffset + dataOffset, 8).getFloat64(0, false);
      dataOffset += 8;
      return value;
    }
    if (serial === 8) return 0;
    if (serial === 9) return 1;
    if (serial >= 12) {
      const length = Math.floor((serial - (serial % 2 === 0 ? 12 : 13)) / 2);
      const valueBytes = payload.slice(dataOffset, dataOffset + length);
      dataOffset += length;
      return serial % 2 === 0 ? valueBytes : decoder.decode(valueBytes);
    }
    return null;
  });
}

function getSqlitePayload(bytes: Uint8Array, offset: number, payloadSize: number, localStart: number, pageSize: number, reservedBytes: number) {
  const usableSize = pageSize - reservedBytes;
  const maxLocal = usableSize - 35;
  const minLocal = Math.floor(((usableSize - 12) * 32) / 255) - 23;
  let localSize = payloadSize;
  if (payloadSize > maxLocal) {
    const surplus = minLocal + ((payloadSize - minLocal) % (usableSize - 4));
    localSize = surplus <= maxLocal ? surplus : minLocal;
  }
  const chunks: Uint8Array[] = [bytes.slice(localStart, localStart + localSize)];
  let remaining = payloadSize - localSize;
  let overflowPage = remaining > 0 ? readUInt32BE(bytes, localStart + localSize) : 0;

  while (remaining > 0 && overflowPage > 0) {
    const pageOffset = (overflowPage - 1) * pageSize;
    const nextOverflow = readUInt32BE(bytes, pageOffset);
    const take = Math.min(usableSize - 4, remaining);
    chunks.push(bytes.slice(pageOffset + 4, pageOffset + 4 + take));
    remaining -= take;
    overflowPage = nextOverflow;
  }

  const payload = new Uint8Array(payloadSize);
  let cursor = 0;
  for (const chunk of chunks) {
    payload.set(chunk.slice(0, payload.length - cursor), cursor);
    cursor += chunk.length;
    if (cursor >= payload.length) break;
  }
  return payload;
}

type SqliteRow = Array<string | number | Uint8Array | null> & { __rowid?: number };

function collectSqliteTableRows(bytes: Uint8Array, rootPage: number, decoder: TextDecoder, rows: SqliteRow[] = []) {
  const rawPageSize = readUInt16BE(bytes, 16);
  const pageSize = rawPageSize === 1 ? 65536 : rawPageSize;
  const reservedBytes = bytes[20] || 0;
  const pageStart = (rootPage - 1) * pageSize;
  const headerStart = pageStart + (rootPage === 1 ? 100 : 0);
  const pageType = bytes[headerStart];
  const cellCount = readUInt16BE(bytes, headerStart + 3);
  const cellPointerStart = headerStart + (pageType === 0x05 || pageType === 0x02 ? 12 : 8);

  if (pageType === 0x05 || pageType === 0x02) {
    for (let i = 0; i < cellCount; i += 1) {
      const cellOffset = pageStart + readUInt16BE(bytes, cellPointerStart + i * 2);
      collectSqliteTableRows(bytes, readUInt32BE(bytes, cellOffset), decoder, rows);
    }
    const rightMost = readUInt32BE(bytes, headerStart + 8);
    if (rightMost) collectSqliteTableRows(bytes, rightMost, decoder, rows);
    return rows;
  }

  if (pageType !== 0x0d && pageType !== 0x0a) return rows;

  for (let i = 0; i < cellCount; i += 1) {
    const cellOffset = pageStart + readUInt16BE(bytes, cellPointerStart + i * 2);
    const payloadVarint = readSqliteVarint(bytes, cellOffset);
    if (pageType === 0x0a) {
      const payload = getSqlitePayload(bytes, cellOffset, payloadVarint.value, payloadVarint.next, pageSize, reservedBytes);
      rows.push(parseSqliteRecord(payload, decoder) as SqliteRow);
      continue;
    }

    const rowIdVarint = readSqliteVarint(bytes, payloadVarint.next);
    const payload = getSqlitePayload(bytes, cellOffset, payloadVarint.value, rowIdVarint.next, pageSize, reservedBytes);
    const row = parseSqliteRecord(payload, decoder) as SqliteRow;
    row.__rowid = rowIdVarint.value;
    rows.push(row);
  }
  return rows;
}

function sqliteRowValue(row: SqliteRow, index: number, useRowId = false) {
  const value = row[index];
  if (useRowId && (value === null || value === undefined)) return row.__rowid ?? null;
  return value;
}

function findSqliteTableRoot(bytes: Uint8Array, tableName: string, decoder: TextDecoder) {
  const masterRows = collectSqliteTableRows(bytes, 1, decoder);
  for (const row of masterRows) {
    if (String(row[0] || '') === 'table' && String(row[1] || '') === tableName) {
      const root = Number(row[3]);
      return Number.isFinite(root) && root > 0 ? root : null;
    }
  }
  return null;
}

function isSqliteDatabase(bytes: Uint8Array) {
  return bytes.length >= 16 && String.fromCharCode(...bytes.slice(0, 16)) === 'SQLite format 3\0';
}

async function prepareAnkiCollectionDatabase(entryName: string, bytes: Uint8Array) {
  if (isSqliteDatabase(bytes)) return bytes;
  if (entryName.toLowerCase() === 'collection.anki21b') {
    try {
      const decompressed = await decompressBytesWithStream(bytes, 'zstd');
      if (isSqliteDatabase(decompressed)) return decompressed;
    } catch {
      throw new Error('This is a newer Anki package that uses zstd-compressed collection.anki21b. Your browser cannot decode it yet. Export from Anki again with “Support older Anki versions” enabled, or import a “Notes in Plain Text” export.');
    }
  }
  throw new Error('The Anki collection inside this package is not a SQLite database.');
}

type AnkiModelTemplate = {
  name?: string;
  qfmt?: string;
  afmt?: string;
  ord?: number;
};

type AnkiModel = {
  id: string;
  name?: string;
  type?: number;
  fields: string[];
  templates: AnkiModelTemplate[];
};

type AnkiNoteData = {
  id: number;
  modelId: string;
  fieldsRaw: string;
  fields: Array<{ name: string; value: string }>;
};

function readAnkiTable(bytes: Uint8Array, tableName: string, decoder: TextDecoder) {
  const root = findSqliteTableRoot(bytes, tableName, decoder);
  return root ? collectSqliteTableRows(bytes, root, decoder) : [];
}

function stripAnkiMarkup(value: string) {
  const withMediaPlaceholders = value
    .replace(/<img\b[^>]*\bsrc=["']?([^"'\s>]+)[^>]*>/gi, (_match, src) => ` [Image: ${String(src).split('/').pop()}] `)
    .replace(/\[sound:([^\]]+)]/gi, (_match, src) => ` [Audio: ${src}] `);
  return stripHtmlToPlainText(withMediaPlaceholders)
    .replace(/\{\{type:[^}]+}}/gi, '')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function parseAnkiFields(fieldsRaw: string, model?: AnkiModel): Array<{ name: string; value: string }> {
  const rawFields = fieldsRaw.includes('\x1f') ? fieldsRaw.split('\x1f') : fieldsRaw.split('^_');
  return rawFields.map((value, index) => ({
    name: model?.fields[index] || `Field ${index + 1}`,
    value
  }));
}

function buildFieldMap(fields: Array<{ name: string; value: string }>) {
  const map = new Map<string, string>();
  fields.forEach((field, index) => {
    map.set(field.name.toLowerCase(), field.value);
    map.set(`field ${index + 1}`, field.value);
  });
  return map;
}

function fieldValueByName(fields: Array<{ name: string; value: string }>, name: string) {
  const cleanName = name.trim().toLowerCase();
  return buildFieldMap(fields).get(cleanName) || '';
}

function renderClozeValue(value: string, clozeNumber: number, side: 'question' | 'answer') {
  return value.replace(/\{\{c(\d+)::(.*?)(?:::([^}]+))?}}/gi, (_match, numberRaw, answer, hint) => {
    const number = Number(numberRaw);
    if (number !== clozeNumber) return answer;
    return side === 'question' ? `[${hint || '...'}]` : answer;
  });
}

function renderAnkiTemplate(template: string, fields: Array<{ name: string; value: string }>, side: 'question' | 'answer', clozeNumber: number, frontSide = '') {
  let output = template || '';
  const map = buildFieldMap(fields);
  output = output.replace(/\{\{FrontSide}}/gi, frontSide);
  output = output.replace(/\{\{#([^}]+)}}([\s\S]*?)\{\{\/\1}}/g, (_match, name, content) => stripAnkiMarkup(map.get(String(name).toLowerCase()) || '') ? content : '');
  output = output.replace(/\{\{\^([^}]+)}}([\s\S]*?)\{\{\/\1}}/g, (_match, name, content) => stripAnkiMarkup(map.get(String(name).toLowerCase()) || '') ? '' : content);
  output = output.replace(/\{\{type:([^}]+)}}/gi, (_match, name) => fieldValueByName(fields, String(name)));
  output = output.replace(/\{\{cloze:([^}]+)}}/gi, (_match, name) => renderClozeValue(fieldValueByName(fields, String(name)), clozeNumber, side));
  output = output.replace(/\{\{([^}]+)}}/g, (_match, name) => fieldValueByName(fields, String(name)));
  return output;
}

function removeRepeatedFrontFromBack(front: string, back: string) {
  const cleanFront = front.trim();
  const cleanBack = back.trim();
  if (!cleanFront || !cleanBack) return cleanBack;
  if (cleanBack.toLowerCase().startsWith(cleanFront.toLowerCase())) {
    return cleanBack.slice(cleanFront.length).replace(/^[-–—:| \n\r\t]+/, '').trim() || cleanBack;
  }
  return cleanBack;
}

function fieldsToFallbackCard(fields: Array<{ name: string; value: string }>, modelName = 'custom Anki note'): ImportedAnkiCard | null {
  const cleaned = fields
    .map((field) => ({ name: field.name, value: stripAnkiMarkup(field.value) }))
    .filter((field) => field.value);
  if (!cleaned.length) return null;

  const frontField = cleaned.find((field) => /\b(front|question|prompt|term|text)\b/i.test(field.name)) || cleaned[0];
  const backFields = cleaned.filter((field) => field !== frontField && /\b(back|answer|definition|extra|explanation|notes?)\b/i.test(field.name));
  const otherFields = cleaned.filter((field) => field !== frontField && !backFields.includes(field));
  const back = [...backFields, ...otherFields]
    .map((field) => `${field.name}: ${field.value}`)
    .join('\n\n')
    .trim();

  if (frontField.value && back) return { front: frontField.value, back };
  if (cleaned.length >= 2) return { front: cleaned[0].value, back: cleaned.slice(1).map((field) => `${field.name}: ${field.value}`).join('\n\n') };
  return {
    front: cleaned[0].value,
    back: `Imported from Anki note type "${modelName}". This note only exposed one readable field, so Dux Notes kept it as a simple review card.`
  };
}

function ankiNoteToCard(note: AnkiNoteData, model?: AnkiModel, ord = 0): ImportedAnkiCard | null {
  const clozeNumber = ord + 1;
  const combinedRaw = note.fields.map((field) => field.value).join('\n');
  const template = model?.templates.find((item) => Number(item.ord ?? model.templates.indexOf(item)) === ord) || model?.templates[ord] || model?.templates[0];

  if (template?.qfmt || template?.afmt) {
    const frontHtml = renderAnkiTemplate(template.qfmt || '', note.fields, 'question', clozeNumber);
    const renderedFrontSide = renderAnkiTemplate(template.qfmt || '', note.fields, 'answer', clozeNumber);
    const backHtml = renderAnkiTemplate(template.afmt || '', note.fields, 'answer', clozeNumber, renderedFrontSide);
    const front = stripAnkiMarkup(frontHtml);
    const back = removeRepeatedFrontFromBack(front, stripAnkiMarkup(backHtml));
    if (front && back) return { front, back };
  }

  if (/\{\{c\d+::/i.test(combinedRaw)) {
    const frontRaw = renderClozeValue(combinedRaw, clozeNumber, 'question');
    const backRaw = renderClozeValue(combinedRaw, clozeNumber, 'answer');
    const front = stripAnkiMarkup(frontRaw);
    const back = removeRepeatedFrontFromBack(front, stripAnkiMarkup(backRaw));
    if (front && back) return { front, back };
  }

  return fieldsToFallbackCard(note.fields, model?.name || 'custom Anki note');
}

function parseLegacyAnkiModels(bytes: Uint8Array, decoder: TextDecoder) {
  const models = new Map<string, AnkiModel>();
  const colRows = readAnkiTable(bytes, 'col', decoder);
  const modelsRaw = colRows.find((row) => typeof row[9] === 'string')?.[9];
  if (typeof modelsRaw !== 'string') return models;
  try {
    const parsed = JSON.parse(modelsRaw) as Record<string, any>;
    Object.entries(parsed || {}).forEach(([id, model]) => {
      const fields = Array.isArray(model?.flds) ? model.flds.map((field: any) => String(field?.name || '')).filter(Boolean) : [];
      const templates = Array.isArray(model?.tmpls) ? model.tmpls.map((template: any, index: number) => ({
        name: String(template?.name || ''),
        qfmt: String(template?.qfmt || ''),
        afmt: String(template?.afmt || ''),
        ord: typeof template?.ord === 'number' ? template.ord : index
      })) : [];
      models.set(String(id), { id: String(id), name: String(model?.name || ''), type: Number(model?.type || 0), fields, templates });
    });
  } catch {
    return models;
  }
  return models;
}

function parseModernAnkiModels(bytes: Uint8Array, decoder: TextDecoder) {
  const models = new Map<string, AnkiModel>();
  const noteTypeRows = readAnkiTable(bytes, 'notetypes', decoder);
  const fieldRows = readAnkiTable(bytes, 'fields', decoder);
  const templateRows = readAnkiTable(bytes, 'templates', decoder);

  for (const row of noteTypeRows) {
    const id = String(sqliteRowValue(row, 0, true) || '');
    if (!id) continue;
    models.set(id, {
      id,
      name: typeof row[1] === 'string' ? row[1] : '',
      type: 0,
      fields: [],
      templates: []
    });
  }

  for (const row of fieldRows) {
    const modelId = String(row[0] || '');
    const ord = Number(row[1] || 0);
    const name = typeof row[2] === 'string' ? row[2] : '';
    if (!modelId || !name) continue;
    const model = models.get(modelId) || { id: modelId, fields: [], templates: [] };
    model.fields[Number.isFinite(ord) ? ord : model.fields.length] = name;
    models.set(modelId, model);
  }

  for (const row of templateRows) {
    const modelId = String(row[0] || '');
    const ord = Number(row[1] || 0);
    const name = typeof row[2] === 'string' ? row[2] : '';
    if (!modelId || !name) continue;
    const model = models.get(modelId) || { id: modelId, fields: [], templates: [] };
    model.templates[Number.isFinite(ord) ? ord : model.templates.length] = { name, ord };
    models.set(modelId, model);
  }

  models.forEach((model) => {
    model.fields = model.fields.filter(Boolean);
    model.templates = model.templates.filter(Boolean);
  });
  return models;
}

function mergeAnkiModels(...modelMaps: Array<Map<string, AnkiModel>>) {
  const merged = new Map<string, AnkiModel>();
  for (const models of modelMaps) {
    models.forEach((model, id) => {
      const existing = merged.get(id);
      if (!existing) {
        merged.set(id, model);
        return;
      }
      merged.set(id, {
        ...existing,
        ...model,
        fields: model.fields.length ? model.fields : existing.fields,
        templates: model.templates.length ? model.templates : existing.templates
      });
    });
  }
  return merged;
}

function dedupeImportedCards(cards: ImportedAnkiCard[]) {
  const seen = new Set<string>();
  const output: ImportedAnkiCard[] = [];
  for (const card of cards) {
    const front = card.front.trim();
    const back = card.back.trim();
    const key = normaliseSearchText(`${front} ${back}`);
    if (!front || !back || seen.has(key)) continue;
    seen.add(key);
    output.push({ front, back });
    if (output.length >= 2000) break;
  }
  return output;
}

function isAnkiCompatibilityPlaceholder(cards: ImportedAnkiCard[]) {
  return cards.length === 1
    && /please update to the latest anki version/i.test(`${cards[0].front} ${cards[0].back}`);
}

function parseAnkiCollectionDatabase(bytes: Uint8Array) {
  if (!isSqliteDatabase(bytes)) {
    throw new Error('The Anki collection inside this package is not a SQLite database.');
  }
  const encoding = readUInt32BE(bytes, 56);
  const decoder = new TextDecoder(encoding === 2 ? 'utf-16le' : encoding === 3 ? 'utf-16be' : 'utf-8');
  const noteRows = readAnkiTable(bytes, 'notes', decoder);
  if (!noteRows.length) throw new Error('The Anki notes table was not found.');
  const models = mergeAnkiModels(parseLegacyAnkiModels(bytes, decoder), parseModernAnkiModels(bytes, decoder));
  const notes = new Map<number, AnkiNoteData>();

  for (const row of noteRows) {
    const id = Number(sqliteRowValue(row, 0, true));
    const modelId = String(row[2] || '');
    const fieldsRaw = typeof row[6] === 'string' ? row[6] : '';
    if (!Number.isFinite(id) || !fieldsRaw) continue;
    const model = models.get(modelId);
    notes.set(id, { id, modelId, fieldsRaw, fields: parseAnkiFields(fieldsRaw, model) });
  }

  const cards: ImportedAnkiCard[] = [];
  const cardRows = readAnkiTable(bytes, 'cards', decoder);
  if (cardRows.length) {
    for (const row of cardRows) {
      const noteId = Number(row[1]);
      const ord = Number(row[3] || 0);
      const note = notes.get(noteId);
      if (!note) continue;
      const card = ankiNoteToCard(note, models.get(note.modelId), Number.isFinite(ord) ? ord : 0);
      if (card) cards.push(card);
    }
  } else {
    notes.forEach((note) => {
      const card = ankiNoteToCard(note, models.get(note.modelId), 0);
      if (card) cards.push(card);
    });
  }

  return dedupeImportedCards(cards);
}

function parseDelimitedFlashcards(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const cards: ImportedAnkiCard[] = [];
  for (const line of lines) {
    const pieces = line.includes('\t') ? line.split('\t') : line.split(',');
    const front = stripAnkiMarkup(pieces[0] || '');
    const back = stripAnkiMarkup(pieces.slice(1).join(pieces.length > 2 ? ', ' : '') || '');
    if (front && back) cards.push({ front, back });
  }
  return dedupeImportedCards(cards);
}

async function parseAnkiImportFile(file: File): Promise<AnkiImportPreview> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const lowerName = file.name.toLowerCase();
  const isZipLike = bytes[0] === 0x50 && bytes[1] === 0x4b;
  let cards: ImportedAnkiCard[] = [];

  if (lowerName.endsWith('.apkg') || lowerName.endsWith('.apkg2') || lowerName.endsWith('.apkj') || isZipLike) {
    const collection = await extractZipEntry(bytes, ['collection.anki21b', 'collection.anki21', 'collection.anki2']);
    const database = await prepareAnkiCollectionDatabase(collection.name, collection.bytes);
    cards = parseAnkiCollectionDatabase(database);
  } else {
    cards = parseDelimitedFlashcards(new TextDecoder('utf-8').decode(bytes));
  }

  if (!cards.length || isAnkiCompatibilityPlaceholder(cards)) {
    throw new Error('No readable cards were found in the legacy compatibility database. Import the modern .apkg in the desktop app, or export from Anki with “Support older Anki versions” enabled / “Notes in Plain Text”.');
  }
  return {
    fileName: file.name,
    deckName: defaultDeckNameFromFile(file.name),
    cards
  };
}


function extractQuickNoteText(doc: DocumentRecord): string {
  const firstPage = doc.pages?.[0];
  if (!firstPage) return '';
  const annotations = getPageAnnotations(doc, firstPage.key);
  return annotations.textBoxes?.[0]?.text || '';
}

function updateQuickNoteTextInDocument(doc: DocumentRecord, text: string): DocumentRecord {
  const next = cloneDocument(doc);
  const now = new Date().toISOString();
  let page = next.pages?.[0];
  if (!page) {
    page = createBlankPage('plain');
    next.pages = [page];
  }
  const annotations = getPageAnnotations(next, page.key);
  const existing = annotations.textBoxes?.[0];
  const textBox: TextBox = existing ? { ...existing, text } : {
    id: makeId(),
    x: 80,
    y: 80,
    width: 620,
    minHeight: 260,
    text,
    fontFamily: 'Open Sans',
    fontSize: 18,
    color: (NOTE_THEMES[next.themeId || DEFAULT_THEME_ID] || NOTE_THEMES[DEFAULT_THEME_ID]).text,
    fontWeight: '400',
    z: 1
  };
  setPageAnnotations(next, page.key, { strokes: [], imageBoxes: [], mathPlaneBoxes: [], shapeBoxes: [], textBoxes: [textBox] });
  next.updatedAt = now;
  next.docKind = 'quick-note';
  next.tags = Array.from(new Set([...(next.tags || []), 'quick-note']));
  return next;
}

function makeStudyDraft(date = todayIsoDate()): StudyScheduleDraft {
  return {
    title: '',
    date,
    startTime: '16:00',
    endTime: '17:00',
    subject: '',
    note: '',
    colour: '#8F3B26',
    completed: false,
    linkedDocId: '',
    linkedDocName: '',
    linkedPageIndex: null,
    linkedDeck: ''
  };
}

function getCalendarCells(month: Date) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const first = new Date(year, monthIndex, 1);
  const start = new Date(year, monthIndex, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const iso = formatLocalIsoDate(date);
    return { iso, day: date.getDate(), inMonth: date.getMonth() === monthIndex };
  });
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function startOfWeek(date: Date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
  copy.setDate(copy.getDate() - copy.getDay());
  return copy;
}

function getWeekDates(anchor: Date) {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { iso: formatLocalIsoDate(date), label: date.toLocaleDateString(undefined, { weekday: 'short' }), day: date.getDate() };
  });
}

function timeToMinutes(time: string) {
  const [hourRaw, minuteRaw] = (time || '00:00').split(':').map((part) => Number(part));
  const hour = Number.isFinite(hourRaw) ? hourRaw : 0;
  const minute = Number.isFinite(minuteRaw) ? minuteRaw : 0;
  return hour * 60 + minute;
}

function minutesToTime(minutes: number) {
  const safe = clamp(Math.round(minutes), 0, 23 * 60 + 59);
  const hour = String(Math.floor(safe / 60)).padStart(2, '0');
  const minute = String(safe % 60).padStart(2, '0');
  return `${hour}:${minute}`;
}

function formatTimeLabel(time: string) {
  const [hourRaw, minuteRaw] = (time || '00:00').split(':').map((part) => Number(part));
  const date = new Date(2026, 0, 1, hourRaw || 0, minuteRaw || 0, 0, 0);
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatHourLabel(hour: number) {
  if (hour === 0 || hour === 24) return '12am';
  if (hour === 12) return '12pm';
  if (hour < 12) return `${hour}am`;
  return `${hour - 12}pm`;
}

function getStoredWeekRowHeight() {
  const stored = Number(window.localStorage.getItem(WEEK_ROW_HEIGHT_STORAGE_KEY));
  return WEEK_ROW_HEIGHT_STEPS.includes(stored) ? stored : WEEK_ROW_HEIGHT;
}

function getNextWeekRowHeight(current: number, direction: -1 | 1) {
  const index = WEEK_ROW_HEIGHT_STEPS.indexOf(current);
  const safeIndex = index === -1 ? WEEK_ROW_HEIGHT_STEPS.indexOf(WEEK_ROW_HEIGHT) : index;
  return WEEK_ROW_HEIGHT_STEPS[clamp(safeIndex + direction, 0, WEEK_ROW_HEIGHT_STEPS.length - 1)];
}

function getWeekZoomLabel(rowHeight: number) {
  return `${Math.round((rowHeight / WEEK_ROW_HEIGHT) * 100)}%`;
}

function layoutOverlappingWeekItems(items: StudyScheduleItem[]): WeekLayoutItem[] {
  const sorted = [...items].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime) || timeToMinutes(a.endTime) - timeToMinutes(b.endTime));
  const layouts: WeekLayoutItem[] = [];
  let group: StudyScheduleItem[] = [];
  let groupEnd = -1;

  const flushGroup = () => {
    if (!group.length) return;
    const columnEnds: number[] = [];
    const temp: WeekLayoutItem[] = [];
    for (const item of group) {
      const start = timeToMinutes(item.startTime);
      const end = Math.max(start + 15, timeToMinutes(item.endTime));
      let column = columnEnds.findIndex((value) => value <= start);
      if (column === -1) {
        column = columnEnds.length;
        columnEnds.push(end);
      } else {
        columnEnds[column] = end;
      }
      temp.push({ item, column, columns: 1 });
    }
    const columns = Math.max(1, columnEnds.length);
    temp.forEach((layout) => layouts.push({ ...layout, columns }));
    group = [];
    groupEnd = -1;
  };

  for (const item of sorted) {
    const start = timeToMinutes(item.startTime);
    const end = Math.max(start + 15, timeToMinutes(item.endTime));
    if (!group.length || start < groupEnd) {
      group.push(item);
      groupEnd = Math.max(groupEnd, end);
    } else {
      flushGroup();
      group.push(item);
      groupEnd = end;
    }
  }
  flushGroup();
  return layouts;
}


type FlashcardBankEntry = {
  front: string;
  back: string;
  subject: string;
  topic: string;
  tags: string[];
};

type FlashcardConcept = {
  term: string;
  answer: string;
  example?: string;
  exam?: string;
  contrast?: string;
  tags?: string[];
  q?: string;
};

type FlashcardTopicBank = {
  subject: string;
  topic: string;
  aliases: string[];
  concepts: FlashcardConcept[];
};

const FLASHCARD_TOPIC_BANKS: FlashcardTopicBank[] = [
  {
    "subject": "HSC Chemistry",
    "topic": "Module 1 Properties and Structure of Matter",
    "aliases": [
      "chemistry module 1",
      "chem mod 1",
      "properties and structure of matter",
      "atomic structure",
      "bonding",
      "periodic table"
    ],
    "concepts": [
      {
        "term": "isotopes",
        "answer": "Atoms of the same element with the same number of protons but different numbers of neutrons.",
        "example": "Isotopes have the same chemical behaviour but different mass numbers.",
        "exam": "Use atomic number for protons and mass number for protons plus neutrons."
      },
      {
        "term": "relative atomic mass",
        "answer": "The weighted average mass of naturally occurring isotopes compared with one twelfth of carbon-12.",
        "example": "It explains why chlorine has an atomic mass near 35.5 rather than a whole number.",
        "exam": "Always use percentage abundance as a decimal fraction in calculations."
      },
      {
        "term": "ionic bonding",
        "answer": "Electrostatic attraction between oppositely charged ions formed by electron transfer.",
        "example": "Sodium chloride forms when sodium loses one electron and chlorine gains one.",
        "exam": "Ionic compounds usually have high melting points because strong attractions extend through the lattice."
      },
      {
        "term": "covalent bonding",
        "answer": "A bond formed when atoms share pairs of electrons.",
        "example": "Water has covalent O-H bonds because oxygen and hydrogen share electrons.",
        "exam": "Covalent molecular substances often have low melting points due to weak intermolecular forces."
      },
      {
        "term": "metallic bonding",
        "answer": "Electrostatic attraction between positive metal ions and delocalised electrons.",
        "example": "Copper conducts electricity because electrons can move through the metallic lattice.",
        "exam": "Metallic bonding explains malleability, conductivity and lustre."
      },
      {
        "term": "electronegativity",
        "answer": "The tendency of an atom to attract shared electrons in a chemical bond.",
        "example": "Fluorine is highly electronegative and strongly attracts bonding electrons.",
        "exam": "Electronegativity differences help predict bond polarity."
      },
      {
        "term": "intermolecular forces",
        "answer": "Attractions between molecules, including dispersion forces, dipole-dipole forces and hydrogen bonding.",
        "example": "Hydrogen bonding gives water a higher boiling point than expected.",
        "exam": "Stronger intermolecular forces generally increase boiling point."
      },
      {
        "term": "periodic trends",
        "answer": "Patterns in properties across periods and down groups of the periodic table.",
        "example": "Atomic radius decreases across a period because nuclear charge increases.",
        "exam": "Explain trends using nuclear charge, shielding and electron shells."
      },
      {
        "term": "allotropes",
        "answer": "Different structural forms of the same element in the same physical state.",
        "example": "Diamond and graphite are allotropes of carbon with different bonding arrangements.",
        "exam": "Structure determines properties, so allotropes can behave very differently."
      },
      {
        "term": "molecular polarity",
        "answer": "A measure of whether a molecule has an uneven distribution of charge.",
        "example": "Water is polar because it has polar bonds and a bent shape.",
        "exam": "A molecule with polar bonds may still be non-polar if the dipoles cancel."
      }
    ]
  },
  {
    "subject": "HSC Chemistry",
    "topic": "Module 2 Introduction to Quantitative Chemistry",
    "aliases": [
      "chemistry module 2",
      "chem mod 2",
      "quantitative chemistry",
      "mole",
      "stoichiometry",
      "limiting reagent"
    ],
    "concepts": [
      {
        "term": "the mole",
        "answer": "A counting unit equal to Avogadro's number, 6.022 x 10^23 particles.",
        "example": "One mole of carbon atoms contains 6.022 x 10^23 carbon atoms.",
        "exam": "Use n = m/M to convert mass to moles."
      },
      {
        "term": "molar mass",
        "answer": "The mass of one mole of a substance, measured in g mol^-1.",
        "example": "The molar mass of water is about 18.02 g mol^-1.",
        "exam": "Add atomic masses using the chemical formula."
      },
      {
        "term": "Avogadro constant",
        "answer": "The number of particles in one mole, 6.022 x 10^23.",
        "example": "It links microscopic particles to measurable amounts in the lab.",
        "exam": "Particles = moles x Avogadro constant."
      },
      {
        "term": "empirical formula",
        "answer": "The simplest whole-number ratio of atoms in a compound.",
        "example": "CH2O is the empirical formula of glucose, C6H12O6.",
        "exam": "Convert percentage composition to moles, then divide by the smallest mole value."
      },
      {
        "term": "molecular formula",
        "answer": "The actual number of atoms of each element in a molecule.",
        "example": "Glucose has the molecular formula C6H12O6.",
        "exam": "Use molar mass divided by empirical formula mass to find the multiplier."
      },
      {
        "term": "limiting reagent",
        "answer": "The reactant that is used up first and limits the amount of product formed.",
        "example": "If oxygen runs out first in combustion, it limits the reaction.",
        "exam": "Calculate product from each reactant and choose the smaller possible amount."
      },
      {
        "term": "percentage yield",
        "answer": "The actual yield divided by theoretical yield, multiplied by 100%.",
        "example": "A low percentage yield can result from side reactions or product loss.",
        "exam": "Percentage yield cannot normally exceed 100% unless impurities or measurement errors are present."
      },
      {
        "term": "concentration",
        "answer": "The amount of solute per volume of solution, commonly measured in mol L^-1.",
        "example": "A 1.0 mol L^-1 NaCl solution contains 1 mole of NaCl per litre.",
        "exam": "Use c = n/V with volume in litres."
      },
      {
        "term": "gas molar volume",
        "answer": "At a given temperature and pressure, one mole of gas occupies a predictable volume.",
        "example": "At 25°C and 100 kPa, molar volume is often taken as about 24.79 L mol^-1.",
        "exam": "Use n = V/Vm when conditions match the given molar volume."
      },
      {
        "term": "stoichiometric ratio",
        "answer": "The mole ratio between substances in a balanced chemical equation.",
        "example": "2H2 + O2 -> 2H2O shows a 2:1:2 mole ratio.",
        "exam": "Always balance the equation before using mole ratios."
      }
    ]
  },
  {
    "subject": "HSC Chemistry",
    "topic": "Module 3 Reactive Chemistry",
    "aliases": [
      "chemistry module 3",
      "chem mod 3",
      "reactive chemistry",
      "redox",
      "precipitation",
      "metal activity"
    ],
    "concepts": [
      {
        "term": "redox reaction",
        "answer": "A reaction involving electron transfer, where oxidation and reduction occur together.",
        "example": "Magnesium is oxidised when it loses electrons to form Mg2+.",
        "exam": "Oxidation is loss of electrons; reduction is gain of electrons."
      },
      {
        "term": "oxidation number",
        "answer": "A number assigned to an atom to track electron transfer in redox reactions.",
        "example": "Oxygen is usually -2 and hydrogen is usually +1.",
        "exam": "An increase in oxidation number means oxidation."
      },
      {
        "term": "activity series",
        "answer": "A ranking of metals by their tendency to lose electrons and react.",
        "example": "A more reactive metal can displace a less reactive metal from solution.",
        "exam": "Use the activity series to predict displacement reactions."
      },
      {
        "term": "precipitation reaction",
        "answer": "A reaction where ions in solution form an insoluble solid.",
        "example": "Ag+ and Cl- form a white precipitate of AgCl.",
        "exam": "Use solubility rules to predict whether a precipitate forms."
      },
      {
        "term": "net ionic equation",
        "answer": "An equation showing only the ions and species directly involved in a reaction.",
        "example": "Ag+ + Cl- -> AgCl(s) is a net ionic equation.",
        "exam": "Remove spectator ions that do not change during the reaction."
      },
      {
        "term": "combustion",
        "answer": "A reaction with oxygen that releases energy and usually forms oxides.",
        "example": "Complete combustion of methane forms carbon dioxide and water.",
        "exam": "Incomplete combustion can form carbon monoxide and soot."
      },
      {
        "term": "acid-metal reaction",
        "answer": "A reaction where an acid reacts with an active metal to form a salt and hydrogen gas.",
        "example": "Zinc plus hydrochloric acid forms zinc chloride and hydrogen.",
        "exam": "Look for bubbling hydrogen gas as evidence."
      },
      {
        "term": "neutralisation",
        "answer": "A reaction between an acid and a base producing salt and water.",
        "example": "HCl + NaOH -> NaCl + H2O.",
        "exam": "Neutralisation involves H+ reacting with OH- to form water."
      },
      {
        "term": "enthalpy change",
        "answer": "The heat energy change of a reaction at constant pressure.",
        "example": "Exothermic reactions release heat and have negative enthalpy change.",
        "exam": "Use bond breaking and bond forming to explain heat changes."
      },
      {
        "term": "reaction observations",
        "answer": "Observable changes that indicate a chemical reaction may have occurred.",
        "example": "Colour change, gas production, precipitate formation and temperature change are common signs.",
        "exam": "Observation alone is not proof; connect it to particle changes."
      }
    ]
  },
  {
    "subject": "HSC Chemistry",
    "topic": "Module 4 Drivers of Reactions",
    "aliases": [
      "chemistry module 4",
      "chem mod 4",
      "drivers of reactions",
      "enthalpy",
      "entropy",
      "gibbs",
      "spontaneous"
    ],
    "concepts": [
      {
        "term": "enthalpy",
        "answer": "The heat content of a system at constant pressure.",
        "example": "Combustion is usually exothermic because products have lower enthalpy than reactants.",
        "exam": "Negative enthalpy change favours product formation energetically."
      },
      {
        "term": "entropy",
        "answer": "A measure of energy dispersal or disorder in a system.",
        "example": "A reaction producing more gas particles often increases entropy.",
        "exam": "Higher entropy generally favours spontaneity."
      },
      {
        "term": "Gibbs free energy",
        "answer": "A value used to predict spontaneity: delta G = delta H - T delta S.",
        "example": "A negative delta G indicates a thermodynamically spontaneous process.",
        "exam": "Temperature can change spontaneity when entropy is significant."
      },
      {
        "term": "exothermic reaction",
        "answer": "A reaction that releases heat energy to the surroundings.",
        "example": "The surroundings feel warmer during an exothermic reaction.",
        "exam": "Products have lower enthalpy than reactants."
      },
      {
        "term": "endothermic reaction",
        "answer": "A reaction that absorbs heat energy from the surroundings.",
        "example": "The surroundings may feel colder during an endothermic reaction.",
        "exam": "Products have higher enthalpy than reactants."
      },
      {
        "term": "activation energy",
        "answer": "The minimum energy particles need to react successfully.",
        "example": "Catalysts lower activation energy by providing an alternate pathway.",
        "exam": "Lower activation energy increases reaction rate but does not change equilibrium position."
      },
      {
        "term": "collision theory",
        "answer": "Particles must collide with enough energy and correct orientation to react.",
        "example": "Increasing temperature increases the fraction of successful collisions.",
        "exam": "Use collision theory to explain effects of temperature, concentration and surface area."
      },
      {
        "term": "catalyst",
        "answer": "A substance that increases reaction rate without being consumed.",
        "example": "Manganese dioxide catalyses decomposition of hydrogen peroxide.",
        "exam": "A catalyst speeds forward and reverse reactions equally in equilibrium."
      },
      {
        "term": "reaction profile diagram",
        "answer": "A diagram showing energy changes from reactants to products.",
        "example": "The peak represents the activated complex or transition state.",
        "exam": "Compare activation energy and enthalpy change from the diagram."
      },
      {
        "term": "spontaneous reaction",
        "answer": "A reaction that can occur without continuous outside energy input under given conditions.",
        "example": "Rusting is spontaneous but slow at room temperature.",
        "exam": "Spontaneous does not always mean fast."
      }
    ]
  },
  {
    "subject": "HSC Chemistry",
    "topic": "Module 5 Equilibrium and Acid Reactions",
    "aliases": [
      "chemistry module 5",
      "chem mod 5",
      "equilibrium",
      "acid reactions",
      "le chatelier",
      "equilibrium constant"
    ],
    "concepts": [
      {
        "term": "dynamic equilibrium",
        "answer": "A state where forward and reverse reactions continue at equal rates in a closed system.",
        "example": "Concentrations remain constant even though particles keep reacting.",
        "exam": "Dynamic equilibrium is not a stopped reaction."
      },
      {
        "term": "Le Chatelier principle",
        "answer": "A system at equilibrium shifts to oppose an imposed change.",
        "example": "Adding reactant shifts equilibrium towards products.",
        "exam": "State the disturbance, the shift, and the effect on concentrations."
      },
      {
        "term": "equilibrium constant",
        "answer": "A value describing the ratio of product to reactant concentrations at equilibrium.",
        "example": "A large K means products are favoured at equilibrium.",
        "exam": "Only temperature changes the value of K."
      },
      {
        "term": "reaction quotient",
        "answer": "A value calculated like K but using current concentrations before equilibrium is reached.",
        "example": "Compare Q with K to predict the direction of shift.",
        "exam": "If Q<K, the system shifts forward."
      },
      {
        "term": "closed system",
        "answer": "A system where matter cannot enter or leave, allowing equilibrium to be established.",
        "example": "A sealed container can allow a reversible gas reaction to reach equilibrium.",
        "exam": "Equilibrium needs a closed system for reactants and products to remain present."
      },
      {
        "term": "effect of temperature on equilibrium",
        "answer": "Temperature changes both equilibrium position and K.",
        "example": "For an exothermic forward reaction, heating shifts equilibrium left.",
        "exam": "Treat heat as a reactant or product depending on enthalpy."
      },
      {
        "term": "effect of pressure on gas equilibrium",
        "answer": "Increasing pressure favours the side with fewer gas moles.",
        "example": "For N2 + 3H2 ⇌ 2NH3, higher pressure favours ammonia.",
        "exam": "Pressure changes matter most for gaseous equilibria with unequal gas moles."
      },
      {
        "term": "weak acid equilibrium",
        "answer": "Weak acids partially ionise in water and establish equilibrium.",
        "example": "Ethanoic acid forms an equilibrium with ethanoate and hydrogen ions.",
        "exam": "Use equilibrium ideas to explain pH and acid strength."
      },
      {
        "term": "buffer solution",
        "answer": "A solution that resists pH change when small amounts of acid or base are added.",
        "example": "A weak acid and its conjugate base can form a buffer.",
        "exam": "Buffers work because equilibrium consumes added H+ or OH-."
      },
      {
        "term": "Haber process",
        "answer": "The industrial production of ammonia from nitrogen and hydrogen.",
        "example": "High pressure and moderate temperature balance yield, rate and cost.",
        "exam": "Explain industrial conditions using equilibrium and rate together."
      }
    ]
  },
  {
    "subject": "HSC Chemistry",
    "topic": "Module 6 Acid/Base Reactions",
    "aliases": [
      "chemistry module 6",
      "chem mod 6",
      "acid base",
      "acid/base reactions",
      "ka",
      "ph",
      "titration",
      "buffers"
    ],
    "concepts": [
      {
        "term": "Bronsted-Lowry acid",
        "answer": "A species that donates a proton, H+.",
        "example": "HCl donates H+ to water, forming hydronium ions.",
        "exam": "Identify the acid by looking for proton donation."
      },
      {
        "term": "Bronsted-Lowry base",
        "answer": "A species that accepts a proton, H+.",
        "example": "NH3 accepts H+ to form NH4+.",
        "exam": "Identify the base by looking for proton acceptance."
      },
      {
        "term": "conjugate acid-base pair",
        "answer": "Two species that differ by one proton.",
        "example": "NH4+ and NH3 are a conjugate acid-base pair.",
        "exam": "The conjugate base is formed after an acid loses H+."
      },
      {
        "term": "strong acid",
        "answer": "An acid that fully ionises in water.",
        "example": "Hydrochloric acid is treated as a strong acid.",
        "exam": "Strong acid does not mean concentrated; strength refers to ionisation extent."
      },
      {
        "term": "weak acid",
        "answer": "An acid that partially ionises in water.",
        "example": "Ethanoic acid is a weak acid.",
        "exam": "Weak acids establish an equilibrium with their ions."
      },
      {
        "term": "Ka",
        "answer": "The acid dissociation constant for a weak acid.",
        "example": "A larger Ka means a stronger weak acid.",
        "exam": "Ka = [H+][A-]/[HA] for HA ⇌ H+ + A-."
      },
      {
        "term": "pH",
        "answer": "A logarithmic measure of hydrogen ion concentration.",
        "example": "pH = -log10[H+].",
        "exam": "A decrease of 1 pH unit means [H+] increases by a factor of 10."
      },
      {
        "term": "titration",
        "answer": "An analytical method using a solution of known concentration to find an unknown concentration.",
        "example": "A burette delivers titrant into an analyte in a conical flask.",
        "exam": "Use balanced equations and mole ratios at the equivalence point."
      },
      {
        "term": "equivalence point",
        "answer": "The point where reactants have reacted in exact stoichiometric proportions.",
        "example": "In a strong acid-strong base titration, equivalence is near pH 7.",
        "exam": "Equivalence point is not always the same as endpoint."
      },
      {
        "term": "indicator endpoint",
        "answer": "The point where an indicator changes colour.",
        "example": "Phenolphthalein turns pink in basic solution.",
        "exam": "Choose an indicator whose colour-change range matches the steep region of the titration curve."
      }
    ]
  },
  {
    "subject": "HSC Chemistry",
    "topic": "Module 7 Organic Chemistry",
    "aliases": [
      "chemistry module 7",
      "chem mod 7",
      "module 7 organic",
      "organic chemistry",
      "homologous series",
      "functional groups",
      "nomenclature",
      "polymers",
      "esterification",
      "organic"
    ],
    "concepts": [
      {
        "term": "homologous series",
        "answer": "A series of compounds with the same functional group and general formula, where each member differs by a CH2 unit.",
        "example": "Alkanes form a homologous series with formula CnH2n+2.",
        "exam": "Members show gradual trends in physical properties and similar chemical reactions.",
        "q": "What is a homologous series?"
      },
      {
        "term": "alkanes",
        "answer": "Saturated hydrocarbons containing only single carbon-carbon bonds, with general formula CnH2n+2.",
        "example": "Methane, ethane and propane are alkanes.",
        "exam": "Alkanes mainly undergo combustion and substitution reactions.",
        "q": "What is the general formula for alkanes?"
      },
      {
        "term": "alkenes",
        "answer": "Unsaturated hydrocarbons containing at least one carbon-carbon double bond, with general formula CnH2n for one double bond.",
        "example": "Ethene decolourises bromine water.",
        "exam": "Alkenes readily undergo addition reactions."
      },
      {
        "term": "alkynes",
        "answer": "Unsaturated hydrocarbons containing at least one carbon-carbon triple bond, with general formula CnH2n-2.",
        "example": "Ethyne is the simplest alkyne.",
        "exam": "Alkynes can undergo addition reactions at the triple bond."
      },
      {
        "term": "functional group",
        "answer": "A specific atom or group of atoms that gives an organic molecule its characteristic reactions.",
        "example": "Alcohols contain the hydroxyl functional group, -OH.",
        "exam": "Identify the functional group before predicting reactions."
      },
      {
        "term": "structural isomerism",
        "answer": "Compounds with the same molecular formula but different structural arrangements.",
        "example": "Butane and methylpropane are structural isomers.",
        "exam": "Structural isomers can have different boiling points and reactivity."
      },
      {
        "term": "saturated hydrocarbons",
        "answer": "Hydrocarbons containing only single carbon-carbon bonds.",
        "example": "Alkanes are saturated hydrocarbons.",
        "exam": "Saturated compounds do not rapidly decolourise bromine water without UV light.",
        "contrast": "Saturated hydrocarbons contain only single bonds; unsaturated hydrocarbons contain at least one double or triple bond."
      },
      {
        "term": "unsaturated hydrocarbons",
        "answer": "Hydrocarbons containing at least one carbon-carbon double or triple bond.",
        "example": "Alkenes and alkynes are unsaturated.",
        "exam": "Bromine water tests for unsaturation by losing its orange-brown colour."
      },
      {
        "term": "addition reaction",
        "answer": "A reaction where atoms add across a carbon-carbon double or triple bond.",
        "example": "Ethene reacts with bromine to form 1,2-dibromoethane.",
        "exam": "Addition reactions increase saturation."
      },
      {
        "term": "substitution reaction",
        "answer": "A reaction where one atom or group is replaced by another.",
        "example": "Methane can react with chlorine under UV light in a substitution reaction.",
        "exam": "Substitution is common for alkanes and haloalkanes."
      },
      {
        "term": "condensation reaction",
        "answer": "A reaction where two molecules join and release a small molecule, usually water.",
        "example": "Esterification is a condensation reaction.",
        "exam": "Condensation polymers form with loss of small molecules.",
        "q": "Define a condensation reaction."
      },
      {
        "term": "esterification",
        "answer": "A reaction between an alcohol and carboxylic acid to form an ester and water.",
        "example": "Ethanol and ethanoic acid form ethyl ethanoate and water.",
        "exam": "Concentrated sulfuric acid acts as a catalyst and dehydrating agent."
      },
      {
        "term": "hydrolysis",
        "answer": "A reaction where water breaks a chemical bond.",
        "example": "Esters can hydrolyse to form alcohols and carboxylic acids.",
        "exam": "Hydrolysis is the reverse of condensation in many organic systems."
      },
      {
        "term": "addition polymerisation",
        "answer": "Joining alkene monomers by opening double bonds without releasing small molecules.",
        "example": "Ethene forms polyethene by addition polymerisation.",
        "exam": "The repeating unit comes from the alkene monomer."
      },
      {
        "term": "condensation polymerisation",
        "answer": "Joining monomers with two functional groups while releasing small molecules.",
        "example": "Nylon can form by condensation polymerisation.",
        "exam": "Polyesters and polyamides are common condensation polymers."
      },
      {
        "term": "alcohols",
        "answer": "Organic compounds containing the hydroxyl group, -OH.",
        "example": "Ethanol is an alcohol that can be oxidised to ethanoic acid.",
        "exam": "Primary alcohols can be oxidised more readily than tertiary alcohols."
      },
      {
        "term": "carboxylic acids",
        "answer": "Organic acids containing the carboxyl group, -COOH.",
        "example": "Ethanoic acid reacts with ethanol to form an ester.",
        "exam": "Carboxylic acids can donate H+ but are usually weak acids."
      },
      {
        "term": "amines",
        "answer": "Organic bases containing nitrogen groups such as -NH2.",
        "example": "Amines can accept protons because nitrogen has a lone pair.",
        "exam": "Amines can form salts with acids."
      },
      {
        "term": "amides",
        "answer": "Organic compounds containing the amide group, -CONH2, -CONHR or -CONR2.",
        "example": "Amide links occur in proteins.",
        "exam": "Amides are less basic than amines because the nitrogen lone pair is delocalised."
      },
      {
        "term": "IUPAC nomenclature",
        "answer": "A systematic naming method based on carbon chain length, functional groups and substituent positions.",
        "example": "2-chlorobutane means a four-carbon chain with chlorine on carbon 2.",
        "exam": "Number the chain to give the highest priority feature the lowest possible number."
      }
    ]
  },
  {
    "subject": "HSC Chemistry",
    "topic": "Module 8 Applying Chemical Ideas",
    "aliases": [
      "chemistry module 8",
      "chem mod 8",
      "applying chemical ideas",
      "spectroscopy",
      "analysis",
      "chemical monitoring"
    ],
    "concepts": [
      {
        "term": "qualitative analysis",
        "answer": "Chemical analysis used to identify what substances are present.",
        "example": "Flame tests can identify some metal ions.",
        "exam": "Qualitative results describe identity, not amount."
      },
      {
        "term": "quantitative analysis",
        "answer": "Chemical analysis used to determine how much of a substance is present.",
        "example": "Titration can determine the concentration of an acid.",
        "exam": "Quantitative analysis needs calibration, accuracy and uncertainty control."
      },
      {
        "term": "calibration curve",
        "answer": "A graph linking known concentrations to measured instrument response.",
        "example": "Absorbance can be plotted against concentration to find an unknown.",
        "exam": "The unknown should fall within the calibrated range."
      },
      {
        "term": "AAS",
        "answer": "Atomic absorption spectroscopy measures light absorbed by free atoms to determine metal ion concentration.",
        "example": "AAS can measure lead concentration in water.",
        "exam": "Specific wavelengths make AAS selective for particular elements."
      },
      {
        "term": "UV-visible spectroscopy",
        "answer": "A technique measuring absorption of ultraviolet or visible light by substances.",
        "example": "Coloured solutions can be analysed with UV-vis.",
        "exam": "Beer-Lambert law links absorbance to concentration."
      },
      {
        "term": "IR spectroscopy",
        "answer": "A technique identifying functional groups by absorption of infrared radiation.",
        "example": "O-H bonds produce broad absorptions in IR spectra.",
        "exam": "Use IR for functional group evidence, not full structure alone."
      },
      {
        "term": "mass spectrometry",
        "answer": "A technique that measures mass-to-charge ratios of ions.",
        "example": "The molecular ion peak can help determine molecular mass.",
        "exam": "Fragmentation patterns support structure identification."
      },
      {
        "term": "NMR spectroscopy",
        "answer": "A technique using nuclear environments to infer organic structure.",
        "example": "Hydrogen NMR shows chemically different hydrogen environments.",
        "exam": "Peak splitting and integration help identify structure."
      },
      {
        "term": "chromatography",
        "answer": "A separation technique based on different affinities for stationary and mobile phases.",
        "example": "Paper chromatography can separate dyes.",
        "exam": "Retention time or Rf values help compare substances."
      },
      {
        "term": "validity in chemical analysis",
        "answer": "The extent to which an investigation tests what it claims to test.",
        "example": "Using appropriate standards improves validity.",
        "exam": "Validity depends on method choice, controls and calibration."
      }
    ]
  },
  {
    "subject": "HSC Physics",
    "topic": "Module 1 Kinematics",
    "aliases": [
      "physics module 1",
      "physics mod 1",
      "kinematics",
      "motion",
      "displacement",
      "velocity"
    ],
    "concepts": [
      {
        "term": "displacement",
        "answer": "Change in position with direction.",
        "example": "Walking 3 m east has displacement 3 m east.",
        "exam": "Displacement is a vector, while distance is scalar."
      },
      {
        "term": "velocity",
        "answer": "Rate of change of displacement.",
        "example": "A car moving north at 20 m s^-1 has velocity.",
        "exam": "Velocity has direction; speed does not."
      },
      {
        "term": "acceleration",
        "answer": "Rate of change of velocity.",
        "example": "A falling object accelerates downward due to gravity.",
        "exam": "Acceleration can involve speeding up, slowing down or changing direction."
      },
      {
        "term": "SUVAT equations",
        "answer": "Equations linking displacement, initial velocity, final velocity, acceleration and time under constant acceleration.",
        "example": "v = u + at is a SUVAT equation.",
        "exam": "Use only when acceleration is constant."
      },
      {
        "term": "graphical motion",
        "answer": "Motion can be analysed using displacement-time, velocity-time and acceleration-time graphs.",
        "example": "Gradient of a displacement-time graph gives velocity.",
        "exam": "Area under a velocity-time graph gives displacement."
      },
      {
        "term": "free fall",
        "answer": "Motion under gravity alone, ignoring air resistance.",
        "example": "Near Earth, acceleration is about 9.8 m s^-2 downward.",
        "exam": "Objects in free fall have the same acceleration regardless of mass."
      },
      {
        "term": "relative motion",
        "answer": "Motion described from a particular frame of reference.",
        "example": "A passenger may be stationary relative to a train but moving relative to the ground.",
        "exam": "State the reference frame clearly."
      },
      {
        "term": "vector resolution",
        "answer": "Breaking a vector into perpendicular components.",
        "example": "A velocity can be split into horizontal and vertical components.",
        "exam": "Components allow two-dimensional motion to be analysed separately."
      }
    ]
  },
  {
    "subject": "HSC Physics",
    "topic": "Module 2 Dynamics",
    "aliases": [
      "physics module 2",
      "physics mod 2",
      "dynamics",
      "forces",
      "newton laws"
    ],
    "concepts": [
      {
        "term": "Newton's first law",
        "answer": "An object remains at rest or in uniform motion unless acted on by a net external force.",
        "example": "A puck keeps sliding on low-friction ice.",
        "exam": "Zero net force means no acceleration, not necessarily no motion."
      },
      {
        "term": "Newton's second law",
        "answer": "Net force equals mass times acceleration, F = ma.",
        "example": "A larger force produces greater acceleration for the same mass.",
        "exam": "Use net force, not one individual force, in F = ma."
      },
      {
        "term": "Newton's third law",
        "answer": "For every action force there is an equal and opposite reaction force on another object.",
        "example": "A swimmer pushes water backward and water pushes the swimmer forward.",
        "exam": "Action-reaction pairs act on different objects."
      },
      {
        "term": "friction",
        "answer": "A contact force opposing relative motion or attempted motion.",
        "example": "Friction slows a sliding box.",
        "exam": "Friction can also provide useful grip, such as tyres on a road."
      },
      {
        "term": "normal force",
        "answer": "A support force perpendicular to a surface.",
        "example": "A table exerts an upward normal force on a book.",
        "exam": "Normal force is not always equal to weight."
      },
      {
        "term": "tension",
        "answer": "A pulling force transmitted through a string, rope or cable.",
        "example": "A hanging mass experiences tension upward.",
        "exam": "Ideal strings are often treated as massless and inextensible."
      },
      {
        "term": "momentum",
        "answer": "The product of mass and velocity, p = mv.",
        "example": "A heavy truck at the same speed has more momentum than a car.",
        "exam": "Momentum is conserved in isolated systems."
      },
      {
        "term": "impulse",
        "answer": "Change in momentum, equal to force multiplied by time.",
        "example": "Airbags increase collision time and reduce average force.",
        "exam": "Impulse is the area under a force-time graph."
      },
      {
        "term": "work",
        "answer": "Energy transferred when a force moves an object through a displacement.",
        "example": "Work = force times displacement in the direction of force.",
        "exam": "No displacement means no mechanical work by that force."
      },
      {
        "term": "energy conservation",
        "answer": "Energy cannot be created or destroyed, only transferred or transformed.",
        "example": "Gravitational potential energy can become kinetic energy.",
        "exam": "Account for energy lost as heat or sound in non-ideal systems."
      }
    ]
  },
  {
    "subject": "HSC Physics",
    "topic": "Module 3 Waves and Thermodynamics",
    "aliases": [
      "physics module 3",
      "physics mod 3",
      "waves thermodynamics",
      "wave",
      "sound",
      "heat"
    ],
    "concepts": [
      {
        "term": "transverse wave",
        "answer": "A wave where particles oscillate perpendicular to the direction of energy transfer.",
        "example": "Light can be modelled as a transverse electromagnetic wave.",
        "exam": "Crests and troughs are features of transverse waves."
      },
      {
        "term": "longitudinal wave",
        "answer": "A wave where particles oscillate parallel to the direction of energy transfer.",
        "example": "Sound in air is longitudinal.",
        "exam": "Compressions and rarefactions are features of longitudinal waves."
      },
      {
        "term": "frequency",
        "answer": "Number of wave cycles passing a point per second.",
        "example": "Frequency is measured in hertz.",
        "exam": "Higher frequency sound is heard as higher pitch."
      },
      {
        "term": "wavelength",
        "answer": "Distance between equivalent points on adjacent waves.",
        "example": "Distance from crest to crest is one wavelength.",
        "exam": "Wave speed equals frequency times wavelength."
      },
      {
        "term": "superposition",
        "answer": "When waves overlap, their displacements add.",
        "example": "Interference patterns form by superposition.",
        "exam": "Constructive interference adds amplitudes; destructive interference reduces them."
      },
      {
        "term": "standing waves",
        "answer": "Waves formed by interference of waves travelling in opposite directions.",
        "example": "A guitar string can form standing wave patterns.",
        "exam": "Nodes have zero displacement and antinodes have maximum displacement."
      },
      {
        "term": "specific heat capacity",
        "answer": "Energy needed to raise 1 kg of a substance by 1°C.",
        "example": "Water has a high specific heat capacity.",
        "exam": "Use Q = mc delta T for heating calculations."
      },
      {
        "term": "latent heat",
        "answer": "Energy absorbed or released during a change of state without temperature change.",
        "example": "Melting ice absorbs latent heat of fusion.",
        "exam": "Temperature stays constant during the phase change."
      },
      {
        "term": "first law of thermodynamics",
        "answer": "Energy conservation applied to heat, work and internal energy.",
        "example": "Heating gas can increase internal energy or allow work to be done.",
        "exam": "Relate heat added to work done and internal energy change."
      },
      {
        "term": "thermal equilibrium",
        "answer": "A state where objects in contact have the same temperature and no net heat transfer.",
        "example": "A thermometer reaches thermal equilibrium with the substance it measures.",
        "exam": "Heat flows from hotter to cooler objects until equilibrium."
      }
    ]
  },
  {
    "subject": "HSC Physics",
    "topic": "Module 4 Electricity and Magnetism",
    "aliases": [
      "physics module 4",
      "physics mod 4",
      "electricity magnetism",
      "circuits",
      "ohm",
      "magnetic field"
    ],
    "concepts": [
      {
        "term": "electric current",
        "answer": "Rate of flow of charge.",
        "example": "Current is measured in amperes.",
        "exam": "Conventional current flows from positive to negative."
      },
      {
        "term": "potential difference",
        "answer": "Energy transferred per unit charge between two points.",
        "example": "A 12 V battery gives 12 J per coulomb.",
        "exam": "Voltage drives current through a circuit."
      },
      {
        "term": "resistance",
        "answer": "Opposition to current flow.",
        "example": "A resistor limits current.",
        "exam": "Resistance depends on material, length, cross-sectional area and temperature."
      },
      {
        "term": "Ohm's law",
        "answer": "For an ohmic conductor, V = IR at constant temperature.",
        "example": "Doubling voltage doubles current if resistance is constant.",
        "exam": "Not all components are ohmic."
      },
      {
        "term": "series circuit",
        "answer": "A circuit where components are connected one after another in a single path.",
        "example": "Current is the same through all series components.",
        "exam": "Total resistance is the sum of resistances."
      },
      {
        "term": "parallel circuit",
        "answer": "A circuit with multiple current paths.",
        "example": "Voltage is the same across parallel branches.",
        "exam": "Total resistance is less than the smallest branch resistance."
      },
      {
        "term": "magnetic field",
        "answer": "A region where magnetic forces can act.",
        "example": "Field lines point from north to south outside a magnet.",
        "exam": "Closer field lines mean a stronger field."
      },
      {
        "term": "motor effect",
        "answer": "The force on a current-carrying conductor in a magnetic field.",
        "example": "A wire experiences force when current flows perpendicular to a magnetic field.",
        "exam": "Force is maximum when current is perpendicular to the field."
      },
      {
        "term": "electromagnetic induction",
        "answer": "Production of an emf due to changing magnetic flux.",
        "example": "Moving a magnet through a coil induces current.",
        "exam": "Induced current opposes the change that produced it."
      },
      {
        "term": "power in circuits",
        "answer": "Rate of electrical energy transfer.",
        "example": "P = VI, and also P = I^2R for resistors.",
        "exam": "Power is measured in watts."
      }
    ]
  },
  {
    "subject": "HSC Physics",
    "topic": "Module 5 Advanced Mechanics",
    "aliases": [
      "physics module 5",
      "physics mod 5",
      "advanced mechanics",
      "projectile",
      "circular motion",
      "gravity"
    ],
    "concepts": [
      {
        "term": "projectile motion",
        "answer": "Two-dimensional motion under gravity after launch.",
        "example": "A ball kicked through the air follows a parabolic path if air resistance is ignored.",
        "exam": "Horizontal and vertical components are analysed separately."
      },
      {
        "term": "uniform circular motion",
        "answer": "Motion in a circle at constant speed but changing velocity.",
        "example": "A satellite in circular orbit has centripetal acceleration.",
        "exam": "The acceleration points toward the centre."
      },
      {
        "term": "centripetal force",
        "answer": "Net force directed toward the centre of circular motion.",
        "example": "Tension can provide centripetal force for a ball on a string.",
        "exam": "Centripetal force is not a separate force; it is the net inward force."
      },
      {
        "term": "gravitational field",
        "answer": "A region where a mass experiences gravitational force.",
        "example": "Earth has a gravitational field around it.",
        "exam": "Field strength is force per unit mass."
      },
      {
        "term": "Newton's law of gravitation",
        "answer": "Every mass attracts every other mass with a force proportional to their masses and inversely proportional to distance squared.",
        "example": "Doubling separation reduces force to one quarter.",
        "exam": "Use centre-to-centre distance."
      },
      {
        "term": "orbital velocity",
        "answer": "The velocity needed for an object to maintain an orbit.",
        "example": "Low Earth orbit satellites move very fast to keep falling around Earth.",
        "exam": "Orbital velocity depends on orbital radius and central mass."
      },
      {
        "term": "escape velocity",
        "answer": "Minimum speed needed to escape a gravitational field without further propulsion.",
        "example": "Escape velocity from Earth is about 11.2 km s^-1.",
        "exam": "Escape velocity does not depend on the mass of the escaping object."
      },
      {
        "term": "energy in orbits",
        "answer": "Orbiting objects have kinetic and gravitational potential energy.",
        "example": "A satellite in lower orbit has higher speed.",
        "exam": "Total mechanical energy is negative for bound orbits."
      },
      {
        "term": "banked curves",
        "answer": "Curves tilted so normal force contributes to centripetal force.",
        "example": "Roads and tracks use banking to help vehicles turn safely.",
        "exam": "Resolve forces toward the centre of the circle."
      },
      {
        "term": "inclined plane dynamics",
        "answer": "Motion on a slope analysed by resolving weight into components.",
        "example": "The component down the slope is mg sin theta.",
        "exam": "Normal force on an incline is mg cos theta if no other vertical effects apply."
      }
    ]
  },
  {
    "subject": "HSC Physics",
    "topic": "Module 6 Electromagnetism",
    "aliases": [
      "physics module 6",
      "physics mod 6",
      "electromagnetism",
      "motors",
      "generators",
      "transformers"
    ],
    "concepts": [
      {
        "term": "magnetic flux",
        "answer": "A measure of magnetic field passing through an area.",
        "example": "Flux changes when field strength, area or angle changes.",
        "exam": "Changing flux induces emf."
      },
      {
        "term": "Faraday's law",
        "answer": "Induced emf is proportional to the rate of change of magnetic flux.",
        "example": "Faster magnet movement through a coil produces larger emf.",
        "exam": "Greater flux change per second means larger induced voltage."
      },
      {
        "term": "Lenz's law",
        "answer": "Induced current flows in a direction that opposes the change causing it.",
        "example": "A falling magnet through a copper pipe is slowed by induced currents.",
        "exam": "Lenz's law follows conservation of energy."
      },
      {
        "term": "DC motor",
        "answer": "A device converting electrical energy into mechanical rotation.",
        "example": "A current-carrying coil in a magnetic field experiences torque.",
        "exam": "A split-ring commutator keeps torque in the same rotational direction."
      },
      {
        "term": "AC generator",
        "answer": "A device converting mechanical rotation into alternating electrical energy.",
        "example": "Rotating a coil in a magnetic field induces alternating emf.",
        "exam": "Slip rings connect the rotating coil to the external circuit."
      },
      {
        "term": "transformer",
        "answer": "A device changing AC voltage using electromagnetic induction.",
        "example": "Step-up transformers increase voltage and reduce current.",
        "exam": "Transformers require changing magnetic flux, so they work with AC."
      },
      {
        "term": "eddy currents",
        "answer": "Circular currents induced in conductors by changing magnetic fields.",
        "example": "Eddy currents can cause magnetic braking.",
        "exam": "They can waste energy as heat unless reduced by laminations."
      },
      {
        "term": "transmission lines",
        "answer": "Power lines transfer electrical energy over long distances.",
        "example": "High voltage reduces current and therefore reduces I^2R losses.",
        "exam": "Step-up and step-down transformers make grid transmission efficient."
      },
      {
        "term": "back emf",
        "answer": "An induced emf in a motor that opposes the supply voltage.",
        "example": "Back emf increases as motor speed increases.",
        "exam": "It limits current in a running motor."
      },
      {
        "term": "torque on a coil",
        "answer": "Turning effect on a current-carrying coil in a magnetic field.",
        "example": "Torque is maximum when the plane of the coil is parallel to the magnetic field.",
        "exam": "Torque depends on current, field strength, area and number of turns."
      }
    ]
  },
  {
    "subject": "HSC Physics",
    "topic": "Module 7 The Nature of Light",
    "aliases": [
      "physics module 7",
      "physics mod 7",
      "nature of light",
      "light",
      "spectra",
      "photoelectric",
      "relativity"
    ],
    "concepts": [
      {
        "term": "wave model of light",
        "answer": "Light can be modelled as a wave that diffracts and interferes.",
        "example": "Young's double-slit experiment shows interference fringes.",
        "exam": "Wave behaviour is strong evidence for wave nature."
      },
      {
        "term": "quantum model of light",
        "answer": "Light energy is carried in photons with energy E = hf.",
        "example": "The photoelectric effect supports photons.",
        "exam": "Higher frequency means higher photon energy."
      },
      {
        "term": "photoelectric effect",
        "answer": "Emission of electrons from a metal surface when light above a threshold frequency hits it.",
        "example": "Increasing frequency increases maximum kinetic energy of emitted electrons.",
        "exam": "Increasing intensity increases the number of emitted electrons if frequency is sufficient."
      },
      {
        "term": "threshold frequency",
        "answer": "Minimum frequency of light needed to eject electrons from a metal.",
        "example": "Below threshold frequency, no electrons are emitted regardless of intensity.",
        "exam": "Threshold depends on the metal's work function."
      },
      {
        "term": "interference",
        "answer": "A wave effect where overlapping waves combine.",
        "example": "Bright and dark fringes form in double-slit interference.",
        "exam": "Path difference determines constructive or destructive interference."
      },
      {
        "term": "diffraction",
        "answer": "Spreading of waves around obstacles or through gaps.",
        "example": "Narrow slits produce wider diffraction patterns.",
        "exam": "Diffraction is strongest when gap size is comparable to wavelength."
      },
      {
        "term": "polarisation",
        "answer": "Restriction of light waves to one plane of vibration.",
        "example": "Polarising sunglasses reduce glare.",
        "exam": "Polarisation shows light is transverse."
      },
      {
        "term": "emission spectrum",
        "answer": "Bright lines produced when excited electrons drop to lower energy levels.",
        "example": "Hydrogen has a unique emission line pattern.",
        "exam": "Spectra can identify elements."
      },
      {
        "term": "absorption spectrum",
        "answer": "Dark lines formed when atoms absorb specific wavelengths from continuous light.",
        "example": "Stars show absorption lines from elements in their atmospheres.",
        "exam": "Line positions reveal composition and Doppler shift."
      },
      {
        "term": "special relativity",
        "answer": "Einstein's theory for motion near the speed of light.",
        "example": "Time dilation means moving clocks can be measured to run slower.",
        "exam": "The speed of light in vacuum is constant for all inertial observers."
      }
    ]
  },
  {
    "subject": "HSC Physics",
    "topic": "Module 8 From the Universe to the Atom",
    "aliases": [
      "physics module 8",
      "physics mod 8",
      "universe atom",
      "quantum",
      "nuclear",
      "standard model"
    ],
    "concepts": [
      {
        "term": "black body radiation",
        "answer": "Radiation emitted by an ideal object that absorbs and emits all wavelengths.",
        "example": "The ultraviolet catastrophe showed classical physics was incomplete.",
        "exam": "Planck solved it by proposing quantised energy."
      },
      {
        "term": "Bohr model",
        "answer": "A model where electrons occupy discrete energy levels around the nucleus.",
        "example": "Hydrogen emission lines arise from electron transitions.",
        "exam": "The model explains hydrogen well but not complex atoms."
      },
      {
        "term": "de Broglie wavelength",
        "answer": "Matter has wave-like properties with wavelength h/p.",
        "example": "Electrons can diffract, showing wave behaviour.",
        "exam": "Wave-particle duality applies to matter and light."
      },
      {
        "term": "nuclear fission",
        "answer": "Splitting of a heavy nucleus into smaller nuclei, releasing energy.",
        "example": "Uranium-235 can undergo fission after absorbing a neutron.",
        "exam": "Fission can produce chain reactions."
      },
      {
        "term": "nuclear fusion",
        "answer": "Combining light nuclei to form heavier nuclei, releasing energy.",
        "example": "The Sun produces energy through fusion.",
        "exam": "Fusion requires extremely high temperature and pressure."
      },
      {
        "term": "mass-energy equivalence",
        "answer": "Mass and energy are related by E = mc^2.",
        "example": "Small mass losses in nuclear reactions release large energy.",
        "exam": "Mass defect explains nuclear binding energy."
      },
      {
        "term": "standard model",
        "answer": "A model describing fundamental particles and interactions except gravity.",
        "example": "Quarks and leptons are fundamental matter particles.",
        "exam": "Gauge bosons mediate forces."
      },
      {
        "term": "quarks",
        "answer": "Fundamental particles that combine to form hadrons.",
        "example": "Protons and neutrons contain up and down quarks.",
        "exam": "Quarks have fractional charge."
      },
      {
        "term": "leptons",
        "answer": "Fundamental particles not made of quarks.",
        "example": "Electrons and neutrinos are leptons.",
        "exam": "Leptons do not experience the strong nuclear force."
      },
      {
        "term": "radioactive decay",
        "answer": "Spontaneous transformation of unstable nuclei.",
        "example": "Alpha, beta and gamma radiation are common decay types.",
        "exam": "Decay is random for individual nuclei but predictable statistically."
      }
    ]
  },
  {
    "subject": "HSC Biology",
    "topic": "Module 1 Cells as the Basis of Life",
    "aliases": [
      "biology module 1",
      "bio mod 1",
      "cells",
      "cell structure"
    ],
    "concepts": [
      {
        "term": "cell membrane",
        "answer": "A selectively permeable phospholipid bilayer that controls movement of substances into and out of cells.",
        "example": "It maintains internal conditions by regulating transport of ions, nutrients and waste.",
        "exam": "Mention selective permeability, receptors and transport proteins."
      },
      {
        "term": "nucleus",
        "answer": "A membrane-bound organelle containing DNA and controlling cell activities.",
        "example": "The nucleus stores genetic instructions used for protein synthesis.",
        "exam": "Eukaryotic cells have a nucleus; prokaryotic cells do not."
      },
      {
        "term": "mitochondria",
        "answer": "Organelles where aerobic cellular respiration produces ATP.",
        "example": "Muscle cells often have many mitochondria due to high energy demand.",
        "exam": "Link mitochondria to ATP, not just energy vaguely."
      },
      {
        "term": "ribosomes",
        "answer": "Cell structures that synthesise proteins by translating mRNA.",
        "example": "Ribosomes may be free in cytoplasm or attached to rough ER.",
        "exam": "Protein synthesis depends on ribosomes reading codons."
      },
      {
        "term": "chloroplasts",
        "answer": "Plant cell organelles where photosynthesis occurs.",
        "example": "Chlorophyll in chloroplasts absorbs light energy.",
        "exam": "Chloroplasts convert light energy into chemical energy in glucose."
      },
      {
        "term": "cell theory",
        "answer": "The theory that living things are made of cells, cells are the basic unit of life, and cells come from pre-existing cells.",
        "example": "Cell theory links microscopic structure to all living systems.",
        "exam": "State all three parts when asked."
      },
      {
        "term": "prokaryotes",
        "answer": "Organisms whose cells lack a membrane-bound nucleus and membrane-bound organelles.",
        "example": "Bacteria are prokaryotes.",
        "exam": "Their DNA is usually circular and located in the cytoplasm."
      },
      {
        "term": "eukaryotes",
        "answer": "Organisms whose cells contain a membrane-bound nucleus and organelles.",
        "example": "Animals, plants, fungi and protists are eukaryotes.",
        "exam": "Eukaryotic cells are generally larger and more complex than prokaryotic cells."
      },
      {
        "term": "surface area to volume ratio",
        "answer": "The amount of surface area available for exchange compared with internal volume.",
        "example": "Small cells exchange materials more efficiently because they have higher SA:V ratio.",
        "exam": "As size increases, volume grows faster than surface area."
      },
      {
        "term": "microscopy",
        "answer": "Use of microscopes to view structures too small to see with the naked eye.",
        "example": "Light microscopes view cells; electron microscopes show finer organelle detail.",
        "exam": "Resolution is the ability to distinguish two close points."
      }
    ]
  },
  {
    "subject": "HSC Biology",
    "topic": "Module 2 Organisation of Living Things",
    "aliases": [
      "biology module 2",
      "bio mod 2",
      "organisation",
      "transport systems"
    ],
    "concepts": [
      {
        "term": "tissues",
        "answer": "Groups of similar cells working together to perform a function.",
        "example": "Muscle tissue contracts to produce movement.",
        "exam": "Tissues form organs in multicellular organisms."
      },
      {
        "term": "organs",
        "answer": "Structures made of different tissues working together for a specific function.",
        "example": "The heart is an organ made of muscle, nerve and connective tissue.",
        "exam": "Organs are part of organ systems."
      },
      {
        "term": "organ systems",
        "answer": "Groups of organs that work together to perform major body functions.",
        "example": "The digestive system breaks down and absorbs nutrients.",
        "exam": "Link structure and function across multiple organs."
      },
      {
        "term": "xylem",
        "answer": "Plant vascular tissue that transports water and mineral ions upward from roots.",
        "example": "Xylem vessels are strengthened with lignin.",
        "exam": "Transport is driven by transpiration pull."
      },
      {
        "term": "phloem",
        "answer": "Plant vascular tissue that transports sugars and other organic substances.",
        "example": "Phloem moves sucrose from leaves to growing or storage tissues.",
        "exam": "Translocation can move substances in different directions."
      },
      {
        "term": "transpiration",
        "answer": "Loss of water vapour from plant leaves, mainly through stomata.",
        "example": "Transpiration creates tension that pulls water through xylem.",
        "exam": "Rate is affected by light, temperature, humidity and wind."
      },
      {
        "term": "circulatory system",
        "answer": "The body system that transports blood, oxygen, nutrients, wastes and hormones.",
        "example": "The heart pumps blood through arteries, capillaries and veins.",
        "exam": "Closed circulation allows efficient transport in large animals."
      },
      {
        "term": "gas exchange",
        "answer": "Movement of oxygen and carbon dioxide across specialised exchange surfaces.",
        "example": "Alveoli provide large surface area and thin walls for diffusion.",
        "exam": "Efficient gas exchange needs moist surfaces and concentration gradients."
      },
      {
        "term": "homeostasis",
        "answer": "Maintenance of a stable internal environment within narrow limits.",
        "example": "Body temperature and blood glucose are regulated by homeostasis.",
        "exam": "Usually controlled by negative feedback loops."
      },
      {
        "term": "adaptations",
        "answer": "Inherited features that increase survival or reproductive success in a particular environment.",
        "example": "Cactus spines reduce water loss and herbivory.",
        "exam": "Do not say organisms choose adaptations; selection acts on variation."
      }
    ]
  },
  {
    "subject": "HSC Biology",
    "topic": "Module 3 Biological Diversity",
    "aliases": [
      "biology module 3",
      "bio mod 3",
      "biological diversity",
      "evolution"
    ],
    "concepts": [
      {
        "term": "natural selection",
        "answer": "A process where individuals with favourable heritable traits survive and reproduce more successfully.",
        "example": "Antibiotic resistance can increase by natural selection.",
        "exam": "Variation, selection pressure and inheritance are required."
      },
      {
        "term": "variation",
        "answer": "Differences between individuals in a population.",
        "example": "Variation may be genetic or environmental.",
        "exam": "Natural selection acts on variation."
      },
      {
        "term": "mutation",
        "answer": "A change in DNA sequence that can create new genetic variation.",
        "example": "A mutation may be beneficial, harmful or neutral.",
        "exam": "Mutations are random, but selection is non-random."
      },
      {
        "term": "selection pressure",
        "answer": "An environmental factor that affects survival or reproduction.",
        "example": "Predation can be a selection pressure.",
        "exam": "Selection pressures change allele frequencies over generations."
      },
      {
        "term": "speciation",
        "answer": "Formation of a new species when populations become reproductively isolated.",
        "example": "Geographic isolation can lead to speciation over time.",
        "exam": "Speciation requires genetic divergence and reproductive isolation."
      },
      {
        "term": "biodiversity",
        "answer": "The variety of life, including genetic, species and ecosystem diversity.",
        "example": "High biodiversity can improve ecosystem resilience.",
        "exam": "Discuss biodiversity at the correct level."
      },
      {
        "term": "classification",
        "answer": "Grouping organisms based on shared characteristics and evolutionary relationships.",
        "example": "Binomial nomenclature gives each species a two-part scientific name.",
        "exam": "Modern classification uses genetic evidence as well as morphology."
      },
      {
        "term": "evidence for evolution",
        "answer": "Data supporting change in species over time, such as fossils, comparative anatomy and DNA.",
        "example": "Homologous structures suggest common ancestry.",
        "exam": "Use specific evidence rather than saying evolution is proven by fossils only."
      },
      {
        "term": "adaptation",
        "answer": "Adaptation is a key biology concept in Module 3 Biological Diversity; explain its structure, function and role in maintaining life processes.",
        "example": "In exam answers, link adaptation to biological function and evidence.",
        "exam": "Use precise biological language and connect adaptation to cause and effect."
      },
      {
        "term": "extinction",
        "answer": "Extinction is a key biology concept in Module 3 Biological Diversity; explain its structure, function and role in maintaining life processes.",
        "example": "In exam answers, link extinction to biological function and evidence.",
        "exam": "Use precise biological language and connect extinction to cause and effect."
      }
    ]
  },
  {
    "subject": "HSC Biology",
    "topic": "Module 4 Ecosystem Dynamics",
    "aliases": [
      "biology module 4",
      "bio mod 4",
      "ecosystem dynamics",
      "ecosystems"
    ],
    "concepts": [
      {
        "term": "ecosystem",
        "answer": "A community of organisms interacting with each other and their physical environment.",
        "example": "A pond ecosystem includes organisms, water, light and nutrients.",
        "exam": "Include biotic and abiotic components."
      },
      {
        "term": "food webs",
        "answer": "Interconnected feeding relationships showing energy flow through an ecosystem.",
        "example": "Food webs are more realistic than simple food chains.",
        "exam": "Arrows show direction of energy transfer."
      },
      {
        "term": "population dynamics",
        "answer": "Changes in population size and structure over time.",
        "example": "Birth rate, death rate, immigration and emigration affect population size.",
        "exam": "Population change can be density-dependent or density-independent."
      },
      {
        "term": "carrying capacity",
        "answer": "The maximum population size an environment can sustainably support.",
        "example": "Limited food or space can reduce carrying capacity.",
        "exam": "Populations may fluctuate around carrying capacity."
      },
      {
        "term": "sampling",
        "answer": "Collecting data from part of a population or ecosystem to estimate patterns.",
        "example": "Quadrats can estimate plant abundance.",
        "exam": "Random sampling reduces bias."
      },
      {
        "term": "abiotic factors",
        "answer": "Non-living environmental factors affecting organisms.",
        "example": "Temperature, light, water and pH are abiotic factors.",
        "exam": "Abiotic factors can act as selection pressures."
      },
      {
        "term": "biotic factors",
        "answer": "Living factors affecting organisms.",
        "example": "Predation, competition and disease are biotic factors.",
        "exam": "Biotic interactions shape community structure."
      },
      {
        "term": "succession",
        "answer": "Gradual change in community composition over time.",
        "example": "Pioneer species colonise bare surfaces in primary succession.",
        "exam": "Disturbance can trigger secondary succession."
      },
      {
        "term": "human impacts",
        "answer": "Changes caused by human activity that affect ecosystems.",
        "example": "Land clearing, pollution and climate change reduce biodiversity.",
        "exam": "Evaluate both direct and indirect impacts."
      },
      {
        "term": "conservation",
        "answer": "Protection and management of biodiversity and ecosystems.",
        "example": "Habitat corridors can support gene flow.",
        "exam": "Effective conservation uses evidence and long-term monitoring."
      }
    ]
  },
  {
    "subject": "HSC Biology",
    "topic": "Module 5 Heredity",
    "aliases": [
      "biology module 5",
      "bio mod 5",
      "heredity",
      "genetics"
    ],
    "concepts": [
      {
        "term": "DNA",
        "answer": "A double-stranded molecule that stores genetic information in nucleotide sequences.",
        "example": "DNA bases are A, T, C and G.",
        "exam": "DNA codes for proteins through genes."
      },
      {
        "term": "gene",
        "answer": "A section of DNA that codes for a functional product, usually a protein.",
        "example": "A gene can influence a trait through protein production.",
        "exam": "Genes exist at specific loci on chromosomes."
      },
      {
        "term": "allele",
        "answer": "An alternative version of a gene.",
        "example": "A blood type gene has different alleles.",
        "exam": "Alleles can be dominant, recessive or codominant."
      },
      {
        "term": "meiosis",
        "answer": "Cell division producing genetically different haploid gametes.",
        "example": "Meiosis halves chromosome number.",
        "exam": "Crossing over and independent assortment create variation."
      },
      {
        "term": "crossing over",
        "answer": "Exchange of DNA between homologous chromosomes during meiosis.",
        "example": "Crossing over creates new allele combinations.",
        "exam": "It occurs in prophase I."
      },
      {
        "term": "dominant allele",
        "answer": "An allele expressed in the phenotype when at least one copy is present.",
        "example": "A dominant allele can mask a recessive allele.",
        "exam": "Dominant does not mean more common."
      },
      {
        "term": "recessive allele",
        "answer": "An allele expressed only when two copies are present in a diploid organism.",
        "example": "A recessive trait appears in homozygous recessive individuals.",
        "exam": "Carriers can have one recessive allele without showing the trait."
      },
      {
        "term": "Punnett square",
        "answer": "A grid used to predict possible genotypes from a genetic cross.",
        "example": "A monohybrid cross can show 1:2:1 genotype ratio.",
        "exam": "Punnett squares show probabilities, not guaranteed offspring outcomes."
      },
      {
        "term": "genotype",
        "answer": "The genetic makeup of an organism for a trait.",
        "example": "Bb is a genotype.",
        "exam": "Genotype contributes to phenotype."
      },
      {
        "term": "phenotype",
        "answer": "The observable characteristics of an organism.",
        "example": "Tall plant height is a phenotype.",
        "exam": "Phenotype can be influenced by genotype and environment."
      }
    ]
  },
  {
    "subject": "HSC Biology",
    "topic": "Module 6 Genetic Change",
    "aliases": [
      "biology module 6",
      "bio mod 6",
      "genetic change",
      "biotechnology"
    ],
    "concepts": [
      {
        "term": "mutation",
        "answer": "A change in DNA sequence that can create new genetic variation.",
        "example": "A mutation may be beneficial, harmful or neutral.",
        "exam": "Mutations are random, but selection is non-random."
      },
      {
        "term": "gene expression",
        "answer": "The process where information in a gene is used to produce a functional product.",
        "example": "Transcription and translation are key stages of gene expression.",
        "exam": "Gene regulation controls when and how much protein is made."
      },
      {
        "term": "genetic technologies",
        "answer": "Tools used to analyse, modify or apply genetic information.",
        "example": "PCR, gel electrophoresis and CRISPR are genetic technologies.",
        "exam": "Discuss benefits, limitations and ethics."
      },
      {
        "term": "CRISPR",
        "answer": "A gene-editing technology that can target and modify specific DNA sequences.",
        "example": "CRISPR-Cas9 can cut DNA at selected sites.",
        "exam": "Ethical concerns include off-target effects and germline editing."
      },
      {
        "term": "gel electrophoresis",
        "answer": "A technique that separates DNA fragments by size using an electric field.",
        "example": "Smaller fragments move further through the gel.",
        "exam": "DNA profiles can be compared using band patterns."
      },
      {
        "term": "recombinant DNA",
        "answer": "DNA formed by combining genetic material from different sources.",
        "example": "A bacterial plasmid can carry a human insulin gene.",
        "exam": "Restriction enzymes and ligase are often involved."
      },
      {
        "term": "selective breeding",
        "answer": "Human selection of organisms with desired traits for reproduction.",
        "example": "Dogs and crops have been shaped by selective breeding.",
        "exam": "It can reduce genetic diversity."
      },
      {
        "term": "cloning",
        "answer": "Producing genetically identical copies of DNA, cells or organisms.",
        "example": "Plant cuttings are a simple form of cloning.",
        "exam": "Clones may still differ due to environment."
      },
      {
        "term": "genetic screening",
        "answer": "Testing DNA to identify genes or alleles linked to traits or disease risk.",
        "example": "Screening can detect carriers for genetic disorders.",
        "exam": "Raises issues of privacy and discrimination."
      },
      {
        "term": "ethics",
        "answer": "Moral principles used to judge actions and technologies.",
        "example": "Gene editing raises questions about consent and equity.",
        "exam": "Ethics requires weighing benefits, risks and rights."
      }
    ]
  },
  {
    "subject": "HSC Biology",
    "topic": "Module 7 Infectious Disease",
    "aliases": [
      "biology module 7",
      "bio mod 7",
      "infectious disease",
      "pathogens"
    ],
    "concepts": [
      {
        "term": "pathogen",
        "answer": "An organism or agent that causes disease.",
        "example": "Bacteria, viruses, fungi and parasites can be pathogens.",
        "exam": "Identify pathogen type and transmission method."
      },
      {
        "term": "virus",
        "answer": "A non-cellular infectious agent that replicates only inside host cells.",
        "example": "Influenza is caused by a virus.",
        "exam": "Antibiotics do not work against viruses."
      },
      {
        "term": "bacteria",
        "answer": "Single-celled prokaryotic organisms, some of which cause disease.",
        "example": "Tuberculosis is caused by bacteria.",
        "exam": "Antibiotics can treat many bacterial infections."
      },
      {
        "term": "fungi",
        "answer": "Eukaryotic organisms including yeasts and moulds, some of which cause disease.",
        "example": "Athlete's foot is caused by a fungus.",
        "exam": "Antifungal treatments target fungal cells."
      },
      {
        "term": "parasites",
        "answer": "Organisms that live on or in a host and benefit at the host's expense.",
        "example": "Malaria is caused by a parasite transmitted by mosquitoes.",
        "exam": "Control may target the parasite or vector."
      },
      {
        "term": "immune response",
        "answer": "The body's defence response against pathogens.",
        "example": "White blood cells identify and attack foreign antigens.",
        "exam": "Innate responses are fast; adaptive responses are specific."
      },
      {
        "term": "antibodies",
        "answer": "Proteins produced by B cells that bind specific antigens.",
        "example": "Antibodies can neutralise pathogens.",
        "exam": "Antibody specificity is key to adaptive immunity."
      },
      {
        "term": "vaccination",
        "answer": "Exposure to harmless antigen material to trigger immune memory.",
        "example": "Vaccines prepare the immune system without causing severe disease.",
        "exam": "Herd immunity reduces spread in a population."
      },
      {
        "term": "antibiotics",
        "answer": "Drugs that kill or inhibit bacteria.",
        "example": "Penicillin affects bacterial cell wall synthesis.",
        "exam": "Misuse can select for antibiotic resistance."
      },
      {
        "term": "epidemiology",
        "answer": "Study of patterns, causes and control of disease in populations.",
        "example": "Incidence and prevalence are epidemiological measures.",
        "exam": "Epidemiology guides public health responses."
      }
    ]
  },
  {
    "subject": "HSC Biology",
    "topic": "Module 8 Non-infectious Disease",
    "aliases": [
      "biology module 8",
      "bio mod 8",
      "non-infectious disease",
      "homeostasis"
    ],
    "concepts": [
      {
        "term": "non-infectious disease",
        "answer": "Disease not caused by pathogens and not spread between people by infection.",
        "example": "Cancer and cardiovascular disease are non-infectious.",
        "exam": "Risk factors may be genetic, behavioural or environmental."
      },
      {
        "term": "risk factors",
        "answer": "Variables that increase the chance of disease.",
        "example": "Smoking is a risk factor for lung cancer.",
        "exam": "Risk factors are not always direct causes."
      },
      {
        "term": "homeostasis",
        "answer": "Maintenance of a stable internal environment within narrow limits.",
        "example": "Body temperature and blood glucose are regulated by homeostasis.",
        "exam": "Usually controlled by negative feedback loops."
      },
      {
        "term": "feedback loops",
        "answer": "Control systems where a change triggers responses that affect the original change.",
        "example": "Negative feedback maintains homeostasis.",
        "exam": "Positive feedback amplifies change."
      },
      {
        "term": "diabetes",
        "answer": "A disease involving problems with insulin production or response and blood glucose regulation.",
        "example": "Type 1 involves autoimmune destruction of insulin-producing cells.",
        "exam": "Management can involve insulin, diet, exercise and monitoring."
      },
      {
        "term": "cardiovascular disease",
        "answer": "Diseases affecting the heart and blood vessels.",
        "example": "Atherosclerosis can restrict blood flow.",
        "exam": "Risk factors include smoking, diet, inactivity and genetics."
      },
      {
        "term": "cancer",
        "answer": "A disease involving uncontrolled cell division.",
        "example": "Mutations affecting cell cycle control can lead to cancer.",
        "exam": "Cancer can invade tissues and spread by metastasis."
      },
      {
        "term": "epidemiological studies",
        "answer": "Research studies examining disease patterns and risk factors in populations.",
        "example": "Cohort and case-control studies are common designs.",
        "exam": "Confounding variables must be considered."
      },
      {
        "term": "prevention",
        "answer": "Actions taken to reduce disease risk before illness occurs.",
        "example": "Screening and lifestyle change can prevent some diseases.",
        "exam": "Prevention may be primary, secondary or tertiary."
      },
      {
        "term": "treatment",
        "answer": "Interventions used to manage or cure disease.",
        "example": "Treatment can include medication, surgery or lifestyle changes.",
        "exam": "Effectiveness depends on disease type, stage and patient factors."
      }
    ]
  },
  {
    "subject": "HSC Maths",
    "topic": "Standard Maths 1 and 2",
    "aliases": [
      "standard maths",
      "standard math",
      "maths standard",
      "financial maths",
      "measurement",
      "statistics",
      "algebra"
    ],
    "concepts": [
      {
        "term": "mean",
        "answer": "The arithmetic average found by adding values and dividing by the number of values.",
        "example": "The mean is affected by extreme outliers.",
        "exam": "State units where relevant."
      },
      {
        "term": "median",
        "answer": "The middle value when data is ordered.",
        "example": "Median is useful for skewed data.",
        "exam": "For even data sets, average the two middle values."
      },
      {
        "term": "standard deviation",
        "answer": "A measure of spread around the mean.",
        "example": "A larger standard deviation means data is more spread out.",
        "exam": "Use it to compare consistency between data sets."
      },
      {
        "term": "compound interest",
        "answer": "Interest calculated on both the principal and previous interest.",
        "example": "A = P(1+r)^n for annual compounding.",
        "exam": "Check whether r is a decimal and n matches the compounding period."
      },
      {
        "term": "depreciation",
        "answer": "Decrease in value over time.",
        "example": "A car can depreciate by a fixed percentage each year.",
        "exam": "Reducing balance depreciation is exponential decay."
      },
      {
        "term": "annuity",
        "answer": "A sequence of equal payments made at regular intervals.",
        "example": "Loan repayments are often modelled as annuities.",
        "exam": "Use the correct formula for future value or present value."
      },
      {
        "term": "scale drawing",
        "answer": "A drawing representing real dimensions using a fixed ratio.",
        "example": "1:100 means 1 cm on the plan represents 100 cm in real life.",
        "exam": "Keep units consistent."
      },
      {
        "term": "area and volume",
        "answer": "Measurement of two-dimensional surface and three-dimensional space.",
        "example": "Volume of a prism equals area of cross-section times length.",
        "exam": "Show units squared for area and cubed for volume."
      },
      {
        "term": "linear equation",
        "answer": "An equation whose graph is a straight line.",
        "example": "y = mx + b has gradient m and y-intercept b.",
        "exam": "Solve by isolating the unknown."
      },
      {
        "term": "bivariate data",
        "answer": "Data involving two variables measured together.",
        "example": "Height and arm span can be bivariate data.",
        "exam": "Correlation does not prove causation."
      }
    ]
  },
  {
    "subject": "HSC Maths",
    "topic": "Advanced Mathematics",
    "aliases": [
      "advanced maths",
      "math advanced",
      "advanced mathematics",
      "functions",
      "trigonometry",
      "calculus",
      "logs"
    ],
    "concepts": [
      {
        "term": "function",
        "answer": "A rule assigning each input exactly one output.",
        "example": "f(x)=x^2 is a function.",
        "exam": "Domain and range matter in graphing and solving."
      },
      {
        "term": "domain",
        "answer": "The set of allowed input values for a function.",
        "example": "For sqrt(x), the real domain is x >= 0.",
        "exam": "Restrictions can come from denominators, square roots and context."
      },
      {
        "term": "range",
        "answer": "The set of possible output values of a function.",
        "example": "For y=x^2, the range is y >= 0.",
        "exam": "Use graph shape and turning points to determine range."
      },
      {
        "term": "trigonometric identity",
        "answer": "An equation true for all allowed values.",
        "example": "sin^2 x + cos^2 x = 1.",
        "exam": "Identities help simplify and solve trig equations."
      },
      {
        "term": "radian measure",
        "answer": "Angle measure based on arc length divided by radius.",
        "example": "pi radians equals 180 degrees.",
        "exam": "Calculus with trig functions uses radians."
      },
      {
        "term": "derivative",
        "answer": "The instantaneous rate of change of a function.",
        "example": "The derivative gives the gradient of a tangent.",
        "exam": "Use derivative tests for increasing, decreasing and turning points."
      },
      {
        "term": "integral",
        "answer": "A limit of sums representing area or accumulation.",
        "example": "The definite integral gives signed area under a curve.",
        "exam": "Integration reverses differentiation for many functions."
      },
      {
        "term": "exponential function",
        "answer": "A function where the variable appears in the exponent.",
        "example": "Population growth can be modelled exponentially.",
        "exam": "Exponential functions have constant percentage change."
      },
      {
        "term": "logarithm",
        "answer": "The inverse operation to exponentiation.",
        "example": "log base 10 of 100 is 2.",
        "exam": "Log laws simplify products, quotients and powers."
      },
      {
        "term": "normal distribution",
        "answer": "A symmetric bell-shaped distribution described by mean and standard deviation.",
        "example": "Many measurement errors are approximately normal.",
        "exam": "Use z-scores to compare positions in normal distributions."
      }
    ]
  },
  {
    "subject": "HSC Maths",
    "topic": "Extension 1 Mathematics",
    "aliases": [
      "extension 1",
      "ext 1",
      "mx1",
      "maths extension 1",
      "binomial theorem",
      "combinatorics",
      "vectors"
    ],
    "concepts": [
      {
        "term": "permutation",
        "answer": "An arrangement where order matters.",
        "example": "Arranging 5 people in a line uses permutations.",
        "exam": "Use nPr when order is important."
      },
      {
        "term": "combination",
        "answer": "A selection where order does not matter.",
        "example": "Choosing 3 students from 10 uses combinations.",
        "exam": "Use nCr when order is irrelevant."
      },
      {
        "term": "binomial theorem",
        "answer": "A formula for expanding powers of binomials.",
        "example": "(a+b)^n can be expanded using binomial coefficients.",
        "exam": "Coefficients come from Pascal's triangle or nCr."
      },
      {
        "term": "mathematical induction",
        "answer": "A proof method showing a statement is true for all positive integers.",
        "example": "Prove base case then inductive step.",
        "exam": "The inductive assumption must be used correctly."
      },
      {
        "term": "vectors",
        "answer": "Quantities with magnitude and direction.",
        "example": "Displacement and velocity are vectors.",
        "exam": "Use components for addition and scalar products."
      },
      {
        "term": "scalar product",
        "answer": "A dot product measuring how much one vector acts in another direction.",
        "example": "a dot b = |a||b|cos theta.",
        "exam": "Scalar product can test perpendicular vectors."
      },
      {
        "term": "trigonometric equations",
        "answer": "Equations involving trig functions over a specified domain.",
        "example": "sin x = 1/2 has multiple solutions over 0 to 2pi.",
        "exam": "Use ASTC or the unit circle for all solutions."
      },
      {
        "term": "rates of change",
        "answer": "How one variable changes with respect to another.",
        "example": "Related rates connect variables through differentiation.",
        "exam": "Differentiate with respect to time when variables change over time."
      },
      {
        "term": "inverse functions",
        "answer": "Functions that reverse the effect of another function.",
        "example": "ln x is the inverse of e^x.",
        "exam": "A function needs a one-to-one domain for an inverse function."
      },
      {
        "term": "parametric equations",
        "answer": "Equations expressing coordinates using a third variable or parameter.",
        "example": "x=t, y=t^2 describes a parabola.",
        "exam": "Eliminate the parameter where useful."
      }
    ]
  },
  {
    "subject": "HSC Maths",
    "topic": "Extension 2 Mathematics",
    "aliases": [
      "extension 2",
      "ext 2",
      "mx2",
      "maths extension 2",
      "complex numbers",
      "proof",
      "mechanics",
      "integration techniques"
    ],
    "concepts": [
      {
        "term": "complex number",
        "answer": "A number of the form a + bi where i^2 = -1.",
        "example": "3 + 2i is a complex number.",
        "exam": "Represent complex numbers on the Argand diagram."
      },
      {
        "term": "modulus",
        "answer": "Distance of a complex number from the origin.",
        "example": "For z=a+bi, modulus is sqrt(a^2+b^2).",
        "exam": "Modulus can represent magnitude."
      },
      {
        "term": "argument",
        "answer": "Angle a complex number makes with the positive real axis.",
        "example": "arg(z) locates direction on the Argand diagram.",
        "exam": "Check the quadrant carefully."
      },
      {
        "term": "De Moivre theorem",
        "answer": "A theorem connecting powers of complex numbers in polar form.",
        "example": "(cos theta + i sin theta)^n = cos ntheta + i sin ntheta.",
        "exam": "Useful for powers and roots of complex numbers."
      },
      {
        "term": "proof by contradiction",
        "answer": "A proof method assuming the opposite then showing a contradiction.",
        "example": "To prove irrationality, assume rational and contradict.",
        "exam": "State the contradiction clearly."
      },
      {
        "term": "integration by parts",
        "answer": "An integration technique based on the product rule.",
        "example": "Integral u dv = uv - integral v du.",
        "exam": "Choose u to simplify when differentiated."
      },
      {
        "term": "trigonometric substitution",
        "answer": "A substitution using trig functions to simplify radicals.",
        "example": "Use x=a sin theta for sqrt(a^2-x^2).",
        "exam": "Match substitution to the expression form."
      },
      {
        "term": "volumes of solids of revolution",
        "answer": "Volumes formed by rotating a region around an axis.",
        "example": "Use pi integral y^2 dx for rotation about the x-axis.",
        "exam": "Sketch the region and identify radius."
      },
      {
        "term": "mechanics in Extension 2",
        "answer": "Mathematical modelling of motion using calculus and vectors.",
        "example": "Acceleration can be expressed as dv/dt or v dv/dx.",
        "exam": "Choose the form that matches the given variables."
      },
      {
        "term": "vector equations of lines",
        "answer": "Equations describing lines using a point and direction vector.",
        "example": "r = a + lambda b describes a line.",
        "exam": "Use parameters to find intersections and angles."
      }
    ]
  },
  {
    "subject": "HSC English",
    "topic": "Literary Techniques and Effects",
    "aliases": [
      "english techniques",
      "literary techniques",
      "language techniques",
      "techniques effects",
      "analysis"
    ],
    "concepts": [
      {
        "term": "imagery",
        "answer": "Imagery is a technique used by composers to shape meaning and guide the responder's interpretation.",
        "example": "In analysis, name imagery, quote it briefly, then explain the effect on meaning.",
        "exam": "Do not just label imagery; connect it to the module, idea and question."
      },
      {
        "term": "metaphor",
        "answer": "Metaphor is a technique used by composers to shape meaning and guide the responder's interpretation.",
        "example": "In analysis, name metaphor, quote it briefly, then explain the effect on meaning.",
        "exam": "Do not just label metaphor; connect it to the module, idea and question."
      },
      {
        "term": "simile",
        "answer": "Simile is a technique used by composers to shape meaning and guide the responder's interpretation.",
        "example": "In analysis, name simile, quote it briefly, then explain the effect on meaning.",
        "exam": "Do not just label simile; connect it to the module, idea and question."
      },
      {
        "term": "personification",
        "answer": "Personification is a technique used by composers to shape meaning and guide the responder's interpretation.",
        "example": "In analysis, name personification, quote it briefly, then explain the effect on meaning.",
        "exam": "Do not just label personification; connect it to the module, idea and question."
      },
      {
        "term": "symbolism",
        "answer": "Symbolism is a technique used by composers to shape meaning and guide the responder's interpretation.",
        "example": "In analysis, name symbolism, quote it briefly, then explain the effect on meaning.",
        "exam": "Do not just label symbolism; connect it to the module, idea and question."
      },
      {
        "term": "motif",
        "answer": "Motif is a technique used by composers to shape meaning and guide the responder's interpretation.",
        "example": "In analysis, name motif, quote it briefly, then explain the effect on meaning.",
        "exam": "Do not just label motif; connect it to the module, idea and question."
      },
      {
        "term": "allusion",
        "answer": "Allusion is a technique used by composers to shape meaning and guide the responder's interpretation.",
        "example": "In analysis, name allusion, quote it briefly, then explain the effect on meaning.",
        "exam": "Do not just label allusion; connect it to the module, idea and question."
      },
      {
        "term": "juxtaposition",
        "answer": "Juxtaposition is a technique used by composers to shape meaning and guide the responder's interpretation.",
        "example": "In analysis, name juxtaposition, quote it briefly, then explain the effect on meaning.",
        "exam": "Do not just label juxtaposition; connect it to the module, idea and question."
      },
      {
        "term": "contrast",
        "answer": "Contrast is a technique used by composers to shape meaning and guide the responder's interpretation.",
        "example": "In analysis, name contrast, quote it briefly, then explain the effect on meaning.",
        "exam": "Do not just label contrast; connect it to the module, idea and question."
      },
      {
        "term": "irony",
        "answer": "Irony is a technique used by composers to shape meaning and guide the responder's interpretation.",
        "example": "In analysis, name irony, quote it briefly, then explain the effect on meaning.",
        "exam": "Do not just label irony; connect it to the module, idea and question."
      },
      {
        "term": "tone",
        "answer": "Tone is a technique used by composers to shape meaning and guide the responder's interpretation.",
        "example": "In analysis, name tone, quote it briefly, then explain the effect on meaning.",
        "exam": "Do not just label tone; connect it to the module, idea and question."
      },
      {
        "term": "diction",
        "answer": "Diction is a technique used by composers to shape meaning and guide the responder's interpretation.",
        "example": "In analysis, name diction, quote it briefly, then explain the effect on meaning.",
        "exam": "Do not just label diction; connect it to the module, idea and question."
      },
      {
        "term": "syntax",
        "answer": "Syntax is a technique used by composers to shape meaning and guide the responder's interpretation.",
        "example": "In analysis, name syntax, quote it briefly, then explain the effect on meaning.",
        "exam": "Do not just label syntax; connect it to the module, idea and question."
      },
      {
        "term": "fragmented sentences",
        "answer": "Fragmented sentences is a technique used by composers to shape meaning and guide the responder's interpretation.",
        "example": "In analysis, name fragmented sentences, quote it briefly, then explain the effect on meaning.",
        "exam": "Do not just label fragmented sentences; connect it to the module, idea and question."
      },
      {
        "term": "anaphora",
        "answer": "Anaphora is a technique used by composers to shape meaning and guide the responder's interpretation.",
        "example": "In analysis, name anaphora, quote it briefly, then explain the effect on meaning.",
        "exam": "Do not just label anaphora; connect it to the module, idea and question."
      },
      {
        "term": "repetition",
        "answer": "Repetition is a technique used by composers to shape meaning and guide the responder's interpretation.",
        "example": "In analysis, name repetition, quote it briefly, then explain the effect on meaning.",
        "exam": "Do not just label repetition; connect it to the module, idea and question."
      },
      {
        "term": "rhetorical question",
        "answer": "Rhetorical question is a technique used by composers to shape meaning and guide the responder's interpretation.",
        "example": "In analysis, name rhetorical question, quote it briefly, then explain the effect on meaning.",
        "exam": "Do not just label rhetorical question; connect it to the module, idea and question."
      },
      {
        "term": "inclusive language",
        "answer": "Inclusive language is a technique used by composers to shape meaning and guide the responder's interpretation.",
        "example": "In analysis, name inclusive language, quote it briefly, then explain the effect on meaning.",
        "exam": "Do not just label inclusive language; connect it to the module, idea and question."
      },
      {
        "term": "modality",
        "answer": "Modality is a technique used by composers to shape meaning and guide the responder's interpretation.",
        "example": "In analysis, name modality, quote it briefly, then explain the effect on meaning.",
        "exam": "Do not just label modality; connect it to the module, idea and question."
      },
      {
        "term": "hyperbole",
        "answer": "Hyperbole is a technique used by composers to shape meaning and guide the responder's interpretation.",
        "example": "In analysis, name hyperbole, quote it briefly, then explain the effect on meaning.",
        "exam": "Do not just label hyperbole; connect it to the module, idea and question."
      },
      {
        "term": "understatement",
        "answer": "Understatement is a technique used by composers to shape meaning and guide the responder's interpretation.",
        "example": "In analysis, name understatement, quote it briefly, then explain the effect on meaning.",
        "exam": "Do not just label understatement; connect it to the module, idea and question."
      },
      {
        "term": "foreshadowing",
        "answer": "Foreshadowing is a technique used by composers to shape meaning and guide the responder's interpretation.",
        "example": "In analysis, name foreshadowing, quote it briefly, then explain the effect on meaning.",
        "exam": "Do not just label foreshadowing; connect it to the module, idea and question."
      },
      {
        "term": "flashback",
        "answer": "Flashback is a technique used by composers to shape meaning and guide the responder's interpretation.",
        "example": "In analysis, name flashback, quote it briefly, then explain the effect on meaning.",
        "exam": "Do not just label flashback; connect it to the module, idea and question."
      },
      {
        "term": "narrative perspective",
        "answer": "Narrative perspective is a technique used by composers to shape meaning and guide the responder's interpretation.",
        "example": "In analysis, name narrative perspective, quote it briefly, then explain the effect on meaning.",
        "exam": "Do not just label narrative perspective; connect it to the module, idea and question."
      },
      {
        "term": "first-person voice",
        "answer": "First-person voice is a technique used by composers to shape meaning and guide the responder's interpretation.",
        "example": "In analysis, name first-person voice, quote it briefly, then explain the effect on meaning.",
        "exam": "Do not just label first-person voice; connect it to the module, idea and question."
      },
      {
        "term": "third-person omniscient narration",
        "answer": "Third-person omniscient narration is a technique used by composers to shape meaning and guide the responder's interpretation.",
        "example": "In analysis, name third-person omniscient narration, quote it briefly, then explain the effect on meaning.",
        "exam": "Do not just label third-person omniscient narration; connect it to the module, idea and question."
      },
      {
        "term": "dialogue",
        "answer": "Dialogue is a technique used by composers to shape meaning and guide the responder's interpretation.",
        "example": "In analysis, name dialogue, quote it briefly, then explain the effect on meaning.",
        "exam": "Do not just label dialogue; connect it to the module, idea and question."
      },
      {
        "term": "pathetic fallacy",
        "answer": "Pathetic fallacy is a technique used by composers to shape meaning and guide the responder's interpretation.",
        "example": "In analysis, name pathetic fallacy, quote it briefly, then explain the effect on meaning.",
        "exam": "Do not just label pathetic fallacy; connect it to the module, idea and question."
      },
      {
        "term": "sibilance",
        "answer": "Sibilance is a technique used by composers to shape meaning and guide the responder's interpretation.",
        "example": "In analysis, name sibilance, quote it briefly, then explain the effect on meaning.",
        "exam": "Do not just label sibilance; connect it to the module, idea and question."
      },
      {
        "term": "plosive sounds",
        "answer": "Plosive sounds is a technique used by composers to shape meaning and guide the responder's interpretation.",
        "example": "In analysis, name plosive sounds, quote it briefly, then explain the effect on meaning.",
        "exam": "Do not just label plosive sounds; connect it to the module, idea and question."
      },
      {
        "term": "enjambment",
        "answer": "Enjambment is a technique used by composers to shape meaning and guide the responder's interpretation.",
        "example": "In analysis, name enjambment, quote it briefly, then explain the effect on meaning.",
        "exam": "Do not just label enjambment; connect it to the module, idea and question."
      },
      {
        "term": "caesura",
        "answer": "Caesura is a technique used by composers to shape meaning and guide the responder's interpretation.",
        "example": "In analysis, name caesura, quote it briefly, then explain the effect on meaning.",
        "exam": "Do not just label caesura; connect it to the module, idea and question."
      }
    ]
  },
  {
    "subject": "HSC English",
    "topic": "Common Module Texts and Human Experiences",
    "aliases": [
      "english common module",
      "texts and human experiences",
      "human experiences",
      "common module"
    ],
    "concepts": [
      {
        "term": "human experience",
        "answer": "An individual or collective aspect of life represented through texts.",
        "example": "Loss, isolation, ambition and connection can all be human experiences.",
        "exam": "Tie the experience to the text's form and purpose."
      },
      {
        "term": "individual experience",
        "answer": "A personal experience shaped by memory, context and perspective.",
        "example": "A character's private grief can reveal broader human concerns.",
        "exam": "Avoid vague wording; name the exact experience."
      },
      {
        "term": "collective experience",
        "answer": "An experience shared by a group or community.",
        "example": "War, migration or social change can create collective experiences.",
        "exam": "Show how the text connects personal and shared experiences."
      },
      {
        "term": "anomaly",
        "answer": "A person, event or idea that sits outside expected patterns.",
        "example": "An outsider character can reveal flaws in society.",
        "exam": "Explain how the anomaly challenges assumptions."
      },
      {
        "term": "paradox",
        "answer": "A contradiction that reveals a deeper truth.",
        "example": "A character may feel trapped by freedom.",
        "exam": "Use paradox to discuss complexity in human behaviour."
      },
      {
        "term": "inconsistency",
        "answer": "A mismatch between belief, action or expectation.",
        "example": "A character may value honesty but lie under pressure.",
        "exam": "Inconsistency helps show human complexity."
      },
      {
        "term": "storytelling",
        "answer": "The way texts shape experiences through narrative choices.",
        "example": "Structure, voice and imagery guide how audiences feel.",
        "exam": "Discuss how form shapes meaning."
      },
      {
        "term": "empathy",
        "answer": "The capacity to understand another person's experience.",
        "example": "Texts can build empathy by placing readers inside a character's perspective.",
        "exam": "Explain how technique positions the responder."
      }
    ]
  },
  {
    "subject": "HSC English",
    "topic": "Essay Structure and Textual Analysis",
    "aliases": [
      "english essay",
      "essay structure",
      "thesis",
      "textual analysis",
      "topic sentence"
    ],
    "concepts": [
      {
        "term": "thesis statement",
        "answer": "A clear argument that directly answers the question.",
        "example": "A strong thesis gives the essay a spine.",
        "exam": "Avoid a generic thesis that could fit any question."
      },
      {
        "term": "topic sentence",
        "answer": "The first sentence of a paragraph that states the paragraph's argument.",
        "example": "A topic sentence should link to the question and thesis.",
        "exam": "Do not start with plot summary."
      },
      {
        "term": "evidence",
        "answer": "A short quoted or specific textual detail used to support analysis.",
        "example": "One sharp quote is better than a long slab.",
        "exam": "Embed evidence smoothly in your sentence."
      },
      {
        "term": "analysis",
        "answer": "Explanation of how technique creates meaning.",
        "example": "Analysis connects technique, example, effect and argument.",
        "exam": "Avoid retelling the plot."
      },
      {
        "term": "metalanguage",
        "answer": "Subject-specific language used to discuss texts.",
        "example": "Words like imagery, syntax and motif are metalanguage.",
        "exam": "Use metalanguage accurately, not randomly."
      },
      {
        "term": "conceptual argument",
        "answer": "A paragraph argument focused on ideas rather than events.",
        "example": "Discuss identity, power or memory instead of only what happened.",
        "exam": "Conceptual writing scores higher than plot summary."
      },
      {
        "term": "linking sentence",
        "answer": "A sentence tying paragraph analysis back to the question.",
        "example": "It seals the paragraph like a knot.",
        "exam": "Name the question idea again in fresh words."
      },
      {
        "term": "integrated comparison",
        "answer": "Comparison that discusses texts or ideas together rather than separately.",
        "example": "Use connectives like similarly, however and by contrast.",
        "exam": "Compare ideas, not just techniques."
      },
      {
        "term": "context",
        "answer": "The circumstances influencing a composer or text.",
        "example": "Context can include historical, social and personal factors.",
        "exam": "Only include context when it helps answer the question."
      },
      {
        "term": "module rubric language",
        "answer": "Key syllabus terms that frame expected responses.",
        "example": "Words like representation, human experience and perspective can guide essays.",
        "exam": "Use rubric language naturally, not as a forced checklist."
      }
    ]
  },
  {
    "subject": "HSC PDHPE",
    "topic": "Core 1 Better Health for Individuals",
    "aliases": [
      "pdhpe core 1",
      "better health for individuals",
      "health promotion",
      "ottawa charter"
    ],
    "concepts": [
      {
        "term": "health",
        "answer": "A state of physical, social, mental, emotional and spiritual wellbeing, not just absence of disease.",
        "example": "Health is dynamic and can change across life stages.",
        "exam": "Use dimensions of health in extended responses."
      },
      {
        "term": "determinants of health",
        "answer": "Factors that influence health, including individual, sociocultural, socioeconomic and environmental factors.",
        "example": "Income, education and access to services affect health outcomes.",
        "exam": "Link determinants to specific groups."
      },
      {
        "term": "health promotion",
        "answer": "Actions that enable people to increase control over their health.",
        "example": "Anti-smoking campaigns are health promotion strategies.",
        "exam": "Use Ottawa Charter action areas for depth."
      },
      {
        "term": "Ottawa Charter",
        "answer": "A framework for health promotion with five action areas.",
        "example": "Building healthy public policy is one action area.",
        "exam": "Apply action areas to real examples."
      },
      {
        "term": "social justice principles",
        "answer": "Equity, diversity and supportive environments in health.",
        "example": "Equity targets resources to those who need them most.",
        "exam": "Use social justice principles to evaluate health initiatives."
      },
      {
        "term": "priority population groups",
        "answer": "Groups experiencing poorer health outcomes or inequitable access.",
        "example": "Aboriginal and Torres Strait Islander peoples are often discussed as a priority group.",
        "exam": "Use data and determinants to justify priority status."
      },
      {
        "term": "preventive health",
        "answer": "Strategies that reduce risk before illness or injury occurs.",
        "example": "Vaccination and screening are preventive approaches.",
        "exam": "Prevention is often cheaper and more effective than treatment."
      },
      {
        "term": "epidemiology",
        "answer": "Study of disease patterns in populations.",
        "example": "Mortality and morbidity data guide health priorities.",
        "exam": "Epidemiology does not show every individual experience."
      }
    ]
  },
  {
    "subject": "HSC PDHPE",
    "topic": "Core 2 The Body in Motion",
    "aliases": [
      "pdhpe core 2",
      "body in motion",
      "biomechanics",
      "energy systems"
    ],
    "concepts": [
      {
        "term": "aerobic energy system",
        "answer": "Energy system using oxygen for long-duration, lower-intensity activity.",
        "example": "Distance running relies heavily on aerobic metabolism.",
        "exam": "Produces ATP slowly but can last a long time."
      },
      {
        "term": "anaerobic glycolysis",
        "answer": "Energy system producing ATP without oxygen for moderate-high intensity efforts.",
        "example": "A 400 m sprint uses anaerobic glycolysis strongly.",
        "exam": "Can produce lactate and fatigue."
      },
      {
        "term": "ATP-PC system",
        "answer": "Immediate energy system using stored ATP and phosphocreatine.",
        "example": "A short explosive jump uses ATP-PC.",
        "exam": "Fast but lasts only around 10 seconds."
      },
      {
        "term": "biomechanics",
        "answer": "Study of forces and motion in the body.",
        "example": "Technique analysis uses biomechanical principles.",
        "exam": "Apply force, motion, balance and fluid mechanics."
      },
      {
        "term": "force",
        "answer": "A push or pull that can change motion.",
        "example": "Greater force can increase acceleration.",
        "exam": "Force production depends on technique and muscle action."
      },
      {
        "term": "levers in the body",
        "answer": "Bones act as levers, joints as pivots, muscles as force producers.",
        "example": "The elbow can act as a lever system.",
        "exam": "Lever type affects speed and force advantage."
      },
      {
        "term": "balance and stability",
        "answer": "Ability to maintain control of body position.",
        "example": "A lower centre of gravity increases stability.",
        "exam": "Base of support affects balance."
      },
      {
        "term": "skill acquisition",
        "answer": "Process of learning and improving movement skills.",
        "example": "Feedback improves technique.",
        "exam": "Practice type should match learner stage."
      }
    ]
  },
  {
    "subject": "HSC PDHPE",
    "topic": "Options Sports Medicine and Improving Performance",
    "aliases": [
      "sports medicine",
      "improving performance",
      "pdhpe option",
      "training principles"
    ],
    "concepts": [
      {
        "term": "soft tissue injury",
        "answer": "Damage to muscles, tendons or ligaments.",
        "example": "A sprain damages ligaments.",
        "exam": "Use RICER early for many soft tissue injuries."
      },
      {
        "term": "RICER",
        "answer": "Rest, ice, compression, elevation and referral.",
        "example": "RICER manages acute soft tissue injury.",
        "exam": "Do not use heat early after acute injury."
      },
      {
        "term": "overuse injury",
        "answer": "Injury caused by repeated stress without enough recovery.",
        "example": "Shin splints can result from training overload.",
        "exam": "Prevention uses progressive load and recovery."
      },
      {
        "term": "training specificity",
        "answer": "Training adaptations match the type of training performed.",
        "example": "A sprinter must train speed and power.",
        "exam": "Training should match the energy systems and movements of the sport."
      },
      {
        "term": "progressive overload",
        "answer": "Gradually increasing training stress to improve performance.",
        "example": "Increasing running volume too quickly raises injury risk.",
        "exam": "Overload must be balanced with recovery."
      },
      {
        "term": "periodisation",
        "answer": "Planned variation of training over time.",
        "example": "A season can include preparation, competition and transition phases.",
        "exam": "Periodisation aims to peak at the right time."
      },
      {
        "term": "recovery strategies",
        "answer": "Methods used to restore performance after training.",
        "example": "Sleep, hydration and nutrition support recovery.",
        "exam": "Choose strategies based on fatigue type and sport demands."
      },
      {
        "term": "psychological strategies",
        "answer": "Mental techniques supporting performance.",
        "example": "Goal setting, imagery and self-talk can improve focus.",
        "exam": "Match strategy to athlete needs."
      }
    ]
  },
  {
    "subject": "HSC Economics",
    "topic": "Economic Concepts and Policy",
    "aliases": [
      "economics",
      "hsc economics",
      "gdp",
      "inflation",
      "unemployment",
      "monetary policy",
      "fiscal policy",
      "globalisation",
      "trade"
    ],
    "concepts": [
      {
        "term": "GDP",
        "answer": "The total market value of final goods and services produced in an economy over a period.",
        "example": "Real GDP adjusts for inflation.",
        "exam": "GDP measures output, not quality of life perfectly."
      },
      {
        "term": "inflation",
        "answer": "A sustained increase in the general price level.",
        "example": "High inflation reduces purchasing power.",
        "exam": "Common measures include CPI."
      },
      {
        "term": "unemployment",
        "answer": "People willing and able to work who are actively seeking work but do not have a job.",
        "example": "Cyclical unemployment rises in downturns.",
        "exam": "The unemployment rate does not include discouraged workers."
      },
      {
        "term": "balance of payments",
        "answer": "A record of transactions between residents and the rest of the world.",
        "example": "It includes current, capital and financial accounts.",
        "exam": "A current account deficit is financed through the capital and financial account."
      },
      {
        "term": "exchange rate",
        "answer": "The price of one currency in terms of another.",
        "example": "A depreciation makes exports cheaper and imports dearer.",
        "exam": "Floating exchange rates are influenced by demand and supply."
      },
      {
        "term": "fiscal policy",
        "answer": "Government use of spending and taxation to influence the economy.",
        "example": "Expansionary fiscal policy can stimulate aggregate demand.",
        "exam": "Budget deficits can support growth but increase public debt."
      },
      {
        "term": "monetary policy",
        "answer": "Central bank actions influencing interest rates and money conditions.",
        "example": "Higher interest rates can reduce borrowing and spending.",
        "exam": "In Australia, the RBA targets inflation through the cash rate."
      },
      {
        "term": "globalisation",
        "answer": "Increasing integration between economies through trade, investment, finance, technology and labour flows.",
        "example": "Global supply chains show economic integration.",
        "exam": "Globalisation creates benefits and risks."
      },
      {
        "term": "protection",
        "answer": "Government actions that shield domestic industries from foreign competition.",
        "example": "Tariffs raise prices of imported goods.",
        "exam": "Protection may help jobs but reduces efficiency."
      },
      {
        "term": "terms of trade",
        "answer": "Ratio of export prices to import prices.",
        "example": "A rise in terms of trade increases purchasing power from exports.",
        "exam": "Commodity prices strongly affect Australia's terms of trade."
      }
    ]
  },
  {
    "subject": "HSC Legal Studies",
    "topic": "Legal Studies Core and Options",
    "aliases": [
      "legal studies",
      "law",
      "crime",
      "human rights",
      "family law",
      "world order"
    ],
    "concepts": [
      {
        "term": "rule of law",
        "answer": "The principle that everyone is subject to the law and laws should be fair, known and applied equally.",
        "example": "Rule of law limits arbitrary power.",
        "exam": "Use it to judge legal effectiveness."
      },
      {
        "term": "justice",
        "answer": "A concept involving fairness, equality, access, timeliness and enforceability.",
        "example": "A delayed trial can weaken justice.",
        "exam": "Assess justice using criteria, not feelings."
      },
      {
        "term": "law reform",
        "answer": "The process of changing law to improve justice or respond to society.",
        "example": "Changing technology can drive law reform.",
        "exam": "Reform may come from courts, parliament or agencies."
      },
      {
        "term": "criminal liability",
        "answer": "Legal responsibility for committing a crime.",
        "example": "Mens rea and actus reus are often required.",
        "exam": "Some offences are strict liability."
      },
      {
        "term": "mens rea",
        "answer": "The guilty mind or fault element of a crime.",
        "example": "Intent or recklessness can form mens rea.",
        "exam": "Not every offence requires full mens rea."
      },
      {
        "term": "actus reus",
        "answer": "The guilty act or physical element of a crime.",
        "example": "Stealing property is an actus reus element of larceny.",
        "exam": "The prosecution must prove required elements beyond reasonable doubt."
      },
      {
        "term": "human rights",
        "answer": "Basic rights and freedoms considered inherent to all people.",
        "example": "Freedom from slavery is a human right.",
        "exam": "Human rights protection can be domestic and international."
      },
      {
        "term": "family law",
        "answer": "Law governing family relationships, marriage, divorce, children and property.",
        "example": "Best interests of the child is a key principle.",
        "exam": "Evaluate law using responsiveness and effectiveness."
      },
      {
        "term": "world order",
        "answer": "The maintenance of peace and security between states.",
        "example": "The UN Security Council is central to world order.",
        "exam": "State sovereignty can limit enforcement."
      },
      {
        "term": "legal effectiveness",
        "answer": "How well law achieves justice and meets society's needs.",
        "example": "Cost, access, enforceability and responsiveness affect effectiveness.",
        "exam": "Always support evaluation with examples."
      }
    ]
  },
  {
    "subject": "University Fundamentals",
    "topic": "Calculus",
    "aliases": [
      "university calculus",
      "calculus",
      "derivatives",
      "integrals",
      "limits",
      "differential equations"
    ],
    "concepts": [
      {
        "term": "limit",
        "answer": "The value a function approaches as input approaches a point.",
        "example": "Limits define derivatives and continuity.",
        "exam": "A function can have a limit even if it is not defined at the point."
      },
      {
        "term": "continuity",
        "answer": "A function is continuous if there are no breaks, jumps or holes.",
        "example": "Polynomials are continuous for all real x.",
        "exam": "Check function value equals the limit."
      },
      {
        "term": "derivative",
        "answer": "Instantaneous rate of change.",
        "example": "Derivative of x^2 is 2x.",
        "exam": "Use derivatives for slopes, optimisation and motion."
      },
      {
        "term": "chain rule",
        "answer": "Rule for differentiating composite functions.",
        "example": "d/dx sin(x^2)=2x cos(x^2).",
        "exam": "Differentiate the outside then multiply by derivative of inside."
      },
      {
        "term": "product rule",
        "answer": "Rule for differentiating products of functions.",
        "example": "(uv)' = u'v + uv'.",
        "exam": "Use when two variable expressions multiply."
      },
      {
        "term": "integral",
        "answer": "Accumulation or area under a curve.",
        "example": "Integral of 2x is x^2 + C.",
        "exam": "Definite integrals give signed area."
      },
      {
        "term": "integration by substitution",
        "answer": "A technique reversing the chain rule.",
        "example": "Let u be the inside function.",
        "exam": "Change dx and limits if using definite integrals."
      },
      {
        "term": "differential equation",
        "answer": "An equation involving derivatives of an unknown function.",
        "example": "dy/dx = ky models exponential growth.",
        "exam": "Solutions are functions, not just numbers."
      },
      {
        "term": "gradient field",
        "answer": "A diagram showing slopes for a differential equation.",
        "example": "Each small line shows local derivative.",
        "exam": "Solutions follow the field direction."
      },
      {
        "term": "Taylor series",
        "answer": "A polynomial approximation of a function around a point.",
        "example": "e^x = 1 + x + x^2/2! + ...",
        "exam": "More terms usually improve local approximation."
      }
    ]
  },
  {
    "subject": "University Fundamentals",
    "topic": "Statistics",
    "aliases": [
      "university statistics",
      "statistics",
      "probability",
      "distributions",
      "hypothesis testing",
      "confidence intervals"
    ],
    "concepts": [
      {
        "term": "probability",
        "answer": "A measure from 0 to 1 of how likely an event is.",
        "example": "P(A)=0 means impossible, P(A)=1 means certain.",
        "exam": "Use complement rules where easier."
      },
      {
        "term": "conditional probability",
        "answer": "Probability of one event given another has occurred.",
        "example": "P(A|B)=P(A and B)/P(B).",
        "exam": "Do not confuse P(A|B) with P(B|A)."
      },
      {
        "term": "random variable",
        "answer": "A variable whose values depend on chance.",
        "example": "Number of heads in coin flips is a random variable.",
        "exam": "Can be discrete or continuous."
      },
      {
        "term": "normal distribution",
        "answer": "A bell-shaped continuous distribution.",
        "example": "Mean and standard deviation determine its shape and position.",
        "exam": "Use z-scores for standard normal calculations."
      },
      {
        "term": "binomial distribution",
        "answer": "Distribution for the number of successes in fixed independent trials.",
        "example": "Number of heads in 10 coin tosses can be binomial.",
        "exam": "Conditions: fixed n, two outcomes, constant p, independent trials."
      },
      {
        "term": "hypothesis test",
        "answer": "A procedure for deciding whether sample evidence supports a claim.",
        "example": "A small p-value suggests evidence against the null hypothesis.",
        "exam": "State hypotheses clearly."
      },
      {
        "term": "p-value",
        "answer": "Probability of results at least as extreme assuming the null hypothesis is true.",
        "example": "A p-value below significance level leads to rejection of H0.",
        "exam": "It is not the probability that H0 is true."
      },
      {
        "term": "confidence interval",
        "answer": "A range of plausible values for a population parameter.",
        "example": "A 95% interval reflects long-run capture rate over repeated sampling.",
        "exam": "Wider intervals show more uncertainty."
      },
      {
        "term": "Type I error",
        "answer": "Rejecting a true null hypothesis.",
        "example": "False positive is another name for Type I error.",
        "exam": "Significance level controls Type I error risk."
      },
      {
        "term": "correlation",
        "answer": "A measure of strength and direction of linear association.",
        "example": "Correlation near 1 is strong positive association.",
        "exam": "Correlation does not prove causation."
      }
    ]
  },
  {
    "subject": "University Fundamentals",
    "topic": "Organic Chemistry Beyond HSC",
    "aliases": [
      "university organic chemistry",
      "reaction mechanisms",
      "stereochemistry",
      "spectroscopy",
      "organic mechanisms"
    ],
    "concepts": [
      {
        "term": "nucleophile",
        "answer": "An electron-rich species that donates an electron pair.",
        "example": "OH- can act as a nucleophile.",
        "exam": "Nucleophiles attack electron-poor centres."
      },
      {
        "term": "electrophile",
        "answer": "An electron-poor species that accepts an electron pair.",
        "example": "Carbocations are electrophiles.",
        "exam": "Electrophiles are attacked by nucleophiles."
      },
      {
        "term": "SN1 reaction",
        "answer": "A substitution reaction proceeding through a carbocation intermediate.",
        "example": "Tertiary haloalkanes often favour SN1.",
        "exam": "Rate depends mainly on substrate concentration."
      },
      {
        "term": "SN2 reaction",
        "answer": "A one-step substitution reaction with backside attack.",
        "example": "Primary haloalkanes often favour SN2.",
        "exam": "Rate depends on substrate and nucleophile."
      },
      {
        "term": "E1 reaction",
        "answer": "An elimination reaction through a carbocation intermediate.",
        "example": "E1 competes with SN1.",
        "exam": "More substituted alkenes may be favoured."
      },
      {
        "term": "E2 reaction",
        "answer": "A one-step elimination requiring base and anti-periplanar geometry.",
        "example": "Strong bases can promote E2.",
        "exam": "Rate depends on substrate and base."
      },
      {
        "term": "chirality",
        "answer": "A property where a molecule is not superimposable on its mirror image.",
        "example": "A carbon bonded to four different groups can be chiral.",
        "exam": "Enantiomers can interact differently with biological systems."
      },
      {
        "term": "IR spectroscopy",
        "answer": "Spectroscopy identifying functional groups by bond vibrations.",
        "example": "A broad O-H stretch suggests alcohol or acid.",
        "exam": "IR gives functional group clues, not full structure alone."
      },
      {
        "term": "NMR spectroscopy",
        "answer": "Spectroscopy showing chemically different nuclear environments.",
        "example": "1H NMR can show number and types of hydrogens.",
        "exam": "Use chemical shift, integration and splitting together."
      },
      {
        "term": "mass spectrometry",
        "answer": "Technique measuring mass-to-charge ratio of ions.",
        "example": "Molecular ion peak estimates molecular mass.",
        "exam": "Fragment peaks support structural clues."
      }
    ]
  },
  {
    "subject": "University Fundamentals",
    "topic": "Psychology Fundamentals",
    "aliases": [
      "psychology",
      "memory",
      "cognition",
      "development",
      "disorders"
    ],
    "concepts": [
      {
        "term": "working memory",
        "answer": "A limited-capacity system for temporarily holding and manipulating information.",
        "example": "Mental arithmetic uses working memory.",
        "exam": "Working memory capacity affects learning and problem solving."
      },
      {
        "term": "long-term memory",
        "answer": "Relatively durable storage of information over time.",
        "example": "Semantic and episodic memory are forms of long-term memory.",
        "exam": "Retrieval practice strengthens access to long-term memories."
      },
      {
        "term": "classical conditioning",
        "answer": "Learning by association between stimuli.",
        "example": "Pavlov's dogs associated a bell with food.",
        "exam": "It explains some automatic responses."
      },
      {
        "term": "operant conditioning",
        "answer": "Learning shaped by consequences.",
        "example": "Rewards can increase behaviour.",
        "exam": "Reinforcement increases behaviour; punishment reduces it."
      },
      {
        "term": "cognitive bias",
        "answer": "A systematic pattern of thinking that can distort judgement.",
        "example": "Confirmation bias favours information that supports existing beliefs.",
        "exam": "Biases can affect decisions without awareness."
      },
      {
        "term": "developmental stages",
        "answer": "Patterns of change across the lifespan.",
        "example": "Children's thinking changes with age and experience.",
        "exam": "Development is influenced by biology and environment."
      },
      {
        "term": "attachment",
        "answer": "An emotional bond between infant and caregiver.",
        "example": "Secure attachment supports exploration.",
        "exam": "Attachment can affect later relationships."
      },
      {
        "term": "mental disorder",
        "answer": "A pattern of thoughts, feelings or behaviours causing distress or impairment.",
        "example": "Diagnosis considers symptoms, duration and impact.",
        "exam": "Avoid reducing people to labels."
      },
      {
        "term": "neuroplasticity",
        "answer": "The brain's ability to change with experience.",
        "example": "Practice can strengthen neural pathways.",
        "exam": "Plasticity supports learning and recovery."
      },
      {
        "term": "research ethics",
        "answer": "Principles protecting participants in psychological research.",
        "example": "Informed consent and confidentiality are key.",
        "exam": "Ethics balance knowledge with participant welfare."
      }
    ]
  },
  {
    "subject": "University Fundamentals",
    "topic": "Economics Fundamentals",
    "aliases": [
      "microeconomics",
      "macroeconomics",
      "economics fundamentals",
      "supply demand"
    ],
    "concepts": [
      {
        "term": "scarcity",
        "answer": "Unlimited wants with limited resources.",
        "example": "Scarcity forces choices and opportunity costs.",
        "exam": "Economics studies allocation under scarcity."
      },
      {
        "term": "opportunity cost",
        "answer": "The value of the next best alternative forgone.",
        "example": "Studying has an opportunity cost of leisure time.",
        "exam": "Good economic choices compare benefits and costs."
      },
      {
        "term": "demand",
        "answer": "Quantity consumers are willing and able to buy at different prices.",
        "example": "Demand usually falls as price rises.",
        "exam": "Demand shifts when non-price factors change."
      },
      {
        "term": "supply",
        "answer": "Quantity producers are willing and able to sell at different prices.",
        "example": "Supply usually rises as price rises.",
        "exam": "Costs, technology and taxes can shift supply."
      },
      {
        "term": "market equilibrium",
        "answer": "Price and quantity where demand equals supply.",
        "example": "Shortages push prices up; surpluses push prices down.",
        "exam": "Equilibrium changes when demand or supply shifts."
      },
      {
        "term": "elasticity",
        "answer": "Responsiveness of quantity to a change in price or income.",
        "example": "Necessities often have inelastic demand.",
        "exam": "Elasticity affects tax burden and revenue."
      },
      {
        "term": "externality",
        "answer": "A cost or benefit affecting third parties outside a market transaction.",
        "example": "Pollution is a negative externality.",
        "exam": "Externalities can justify government intervention."
      },
      {
        "term": "monopoly",
        "answer": "A market with one dominant seller and high barriers to entry.",
        "example": "A monopoly can restrict output and raise prices.",
        "exam": "Regulation may reduce market power harms."
      },
      {
        "term": "aggregate demand",
        "answer": "Total spending on domestic goods and services.",
        "example": "AD = C + I + G + net exports.",
        "exam": "Changes in AD affect output, employment and inflation."
      },
      {
        "term": "business cycle",
        "answer": "Fluctuations in economic activity over time.",
        "example": "Booms and recessions are phases of the cycle.",
        "exam": "Policy can smooth but not fully remove cycles."
      }
    ]
  }
];



const EXPANDED_FLASHCARD_TOPIC_BANKS: FlashcardTopicBank[] = [
  {
    subject: 'HSC Studies of Religion I',
    topic: 'Religion and Belief Systems in Australia post-1945',
    aliases: ['studies of religion', 'studies of religion 1', 'sor', 'sor1', 'religion and belief systems in australia', 'post-1945', 'aboriginal spiritualities', 'multicultural', 'multifaith'],
    concepts: [
      { term: 'religious landscape after 1945', answer: 'Australia became more religiously diverse after 1945 because migration, changing social attitudes and global connections increased the presence of non-Christian traditions.', example: 'Post-war migration increased Catholic, Orthodox, Buddhist, Hindu, Muslim and Jewish communities.', exam: 'Use census-style language carefully: change over time, denominational switching, immigration and secularisation are separate causes.' },
      { term: 'secularisation', answer: 'Secularisation is the reduced influence of religion on public life, institutions and personal identity.', example: 'Rising “No Religion” responses show a shift in religious affiliation, not proof that all belief has disappeared.', exam: 'Avoid saying Australia is simply “not religious”. Explain the tension between declining affiliation and continuing religious diversity.' },
      { term: 'denominational switching', answer: 'Denominational switching occurs when people move between Christian denominations or religious groups.', example: 'A person may move from Anglican to Pentecostal worship because of family, community or worship style.', exam: 'Link switching to personal choice, community appeal and changes in religious practice.' },
      { term: 'Aboriginal spiritualities', answer: 'Aboriginal spiritualities are deeply connected to Country, kinship, Dreaming, ceremony and custodial responsibility.', example: 'The Dreaming shapes law, identity and connection to land.', exam: 'Never reduce Aboriginal spiritualities to “beliefs only”; link land, identity, law and lived responsibility.' },
      { term: 'religious expression in a multicultural society', answer: 'Religious expression refers to how traditions are practised publicly and privately through worship, festivals, ethics, buildings, clothing and community service.', example: 'Temples, mosques, churches, synagogues and gurdwaras show visible religious diversity.', exam: 'Use examples of both diversity and social cohesion.' }
    ]
  },
  {
    subject: 'HSC Studies of Religion I',
    topic: 'Religious Tradition Depth Study',
    aliases: ['religious tradition depth study', 'buddhism', 'christianity', 'hinduism', 'islam', 'judaism', 'significant person', 'ethics', 'practice'],
    concepts: [
      { term: 'significant person or school of thought', answer: 'A significant person or school of thought shapes the development and expression of a tradition through teaching, reform, leadership or interpretation.', example: 'Examples depend on the tradition studied, such as a reformer, theologian, scholar, activist or school.', exam: 'Explain both contribution and continuing impact. Do not just retell a biography.' },
      { term: 'ethical teaching', answer: 'Ethical teachings guide adherents on moral choices using sacred texts, authority, tradition and lived practice.', example: 'Bioethics, environmental ethics or sexual ethics may be linked to core beliefs about human dignity, creation or compassion.', exam: 'Connect the ethical teaching to a core belief and then to an adherent’s action.' },
      { term: 'significant practice', answer: 'A significant practice expresses belief through ritual, symbol, community and lived religious identity.', example: 'Baptism, Hajj, Wesak, Shabbat or marriage rituals can show belief through action.', exam: 'Analyse the practice, symbols and meaning. Do not just list steps.' },
      { term: 'sacred texts and authority', answer: 'Sacred texts and religious authorities help preserve, interpret and apply core beliefs across time.', example: 'Interpretation can affect ethical decision-making and religious practice.', exam: 'Name the source of authority and explain how it shapes behaviour.' },
      { term: 'impact on adherents', answer: 'Impact means how a teaching, person or practice changes the beliefs, actions, identity or community life of followers.', example: 'A practice may strengthen belonging, discipline, moral responsibility or connection to God/the sacred.', exam: 'Use verbs like shapes, guides, strengthens and challenges.' }
    ]
  },
  {
    subject: 'HSC Studies of Religion I',
    topic: 'Religion and Peace',
    aliases: ['religion and peace', 'inner peace', 'world peace', 'peace', 'religious peace teaching'],
    concepts: [
      { term: 'inner peace', answer: 'Inner peace is personal spiritual harmony, often developed through prayer, meditation, worship, moral living or discipline.', example: 'A tradition may teach inner peace through submission to God, compassion, mindfulness, covenant or devotion.', exam: 'Do not write vague “peace is good” answers. Link peace to specific teachings and practices.' },
      { term: 'world peace', answer: 'World peace involves social harmony, justice, reconciliation and the reduction of violence between people and nations.', example: 'Religious teachings may promote forgiveness, justice, non-violence, stewardship or human dignity.', exam: 'Use a named teaching or text and explain how it moves from belief to action.' },
      { term: 'sacred texts on peace', answer: 'Sacred texts provide authority for peace teachings by grounding them in core beliefs about human life, justice and the sacred.', example: 'Relevant texts vary by tradition and must be connected to the form of peace being discussed.', exam: 'Quote or paraphrase briefly, then explain the effect on adherents.' },
      { term: 'relationship between inner and world peace', answer: 'Many traditions connect inner peace with world peace because personal transformation can shape ethical action and social responsibility.', example: 'A calm, disciplined adherent may be more likely to act with compassion and justice.', exam: 'Show the link both ways: personal belief affects public action, and public injustice can disturb inner peace.' }
    ]
  },
  {
    subject: 'HSC Studies of Religion I',
    topic: 'Religion and Non-Religion',
    aliases: ['religion and non religion', 'non-religion', 'atheism', 'agnosticism', 'humanism', 'new age', 'spirituality'],
    concepts: [
      { term: 'non-religion', answer: 'Non-religion includes worldviews that do not centre life around organised religious belief or practice.', example: 'Atheism, agnosticism and secular humanism are different forms of non-religious worldview.', exam: 'Define the worldview precisely before comparing it to religion.' },
      { term: 'atheism', answer: 'Atheism is the absence of belief in God or gods.', example: 'An atheist may still hold strong ethical views based on reason, human wellbeing or social responsibility.', exam: 'Do not claim atheism means no morals. Explain the source of ethical authority.' },
      { term: 'agnosticism', answer: 'Agnosticism is the view that the existence of God, gods or ultimate reality is unknown or unknowable.', example: 'An agnostic may suspend judgement rather than reject belief completely.', exam: 'Contrast agnosticism with atheism clearly.' },
      { term: 'secular humanism', answer: 'Secular humanism centres human reason, dignity, ethics and wellbeing without relying on supernatural authority.', example: 'Ethical decisions may be based on harm reduction, rights and human flourishing.', exam: 'Compare source of authority: reason and human welfare versus sacred text, tradition or divine command.' },
      { term: 'new religious expression', answer: 'New religious expressions and personal spiritualities can blend practices, self-development and alternative beliefs outside traditional institutions.', example: 'Some people identify as spiritual but not religious.', exam: 'Explain why this challenges simple categories of religion and non-religion.' }
    ]
  },
  {
    subject: 'HSC Mathematics Advanced',
    topic: 'Functions, Graphs and Modelling',
    aliases: ['maths advanced', 'mathematics advanced', 'advanced maths', 'functions', 'graphs', 'modelling'],
    concepts: [
      { term: 'domain and range', answer: 'Domain is the set of allowed input values. Range is the set of output values produced by the function.', example: 'For a square root function, the expression inside the root must be non-negative.', exam: 'State restrictions before sketching or solving.' },
      { term: 'transformations of functions', answer: 'Transformations move or change a graph through translations, reflections, dilations and stretches.', example: 'y = f(x - 2) + 3 moves the graph right 2 and up 3.', exam: 'Horizontal transformations often feel opposite because they affect the input before the function acts.' },
      { term: 'inverse functions', answer: 'An inverse function reverses the mapping of the original function, usually found by swapping x and y then solving for y.', example: 'A one-to-one restriction may be needed before an inverse exists as a function.', exam: 'Check domain/range and use y = x symmetry.' },
      { term: 'modelling with functions', answer: 'Modelling uses functions to represent real situations, then interprets features like intercepts, turning points and rate of change.', example: 'A cost model may use a fixed intercept and a variable rate per item.', exam: 'Always explain what the mathematical result means in the context.' }
    ]
  },
  {
    subject: 'HSC Mathematics Advanced',
    topic: 'Trigonometric Functions and Calculus',
    aliases: ['maths advanced', 'trig', 'trigonometry', 'calculus', 'differentiation', 'integration', 'exponential', 'logarithm'],
    concepts: [
      { term: 'trigonometric equation', answer: 'A trigonometric equation is solved by finding all angles in the required domain that satisfy the ratio or function value.', example: 'Use the unit circle or graph to find related angles.', exam: 'Write all solutions in the given interval, not only the first calculator answer.' },
      { term: 'derivative as rate of change', answer: 'The derivative gives the instantaneous rate of change or gradient of a curve at a point.', example: 'Velocity is the derivative of displacement with respect to time.', exam: 'Include units when the derivative represents a real rate.' },
      { term: 'second derivative', answer: 'The second derivative describes concavity and helps classify stationary points.', example: 'Positive second derivative suggests concave up and a local minimum.', exam: 'State the test you are using before drawing a conclusion.' },
      { term: 'definite integral', answer: 'A definite integral gives signed area under a curve over an interval.', example: 'Displacement can be found from the area under a velocity-time graph.', exam: 'Area below the x-axis is negative unless the question asks for total area.' },
      { term: 'exponential and logarithmic functions', answer: 'Exponential and logarithmic functions are inverse relationships used for growth, decay and solving variable exponents.', example: 'Logs can linearise exponential relationships.', exam: 'Check base restrictions and use exact values where possible.' }
    ]
  },
  {
    subject: 'HSC Mathematics Extension 1',
    topic: 'Proof, Vectors, Trigonometry and Calculus',
    aliases: ['maths extension 1', 'mathematics extension 1', 'ext1', 'ext 1', 'mx1', 'proof', 'vectors', 'rates of change'],
    concepts: [
      { term: 'mathematical induction', answer: 'Mathematical induction proves a statement for all positive integers by proving a base case and an inductive step.', example: 'Assume true for n = k, then prove true for n = k + 1.', exam: 'Do not forget the conclusion: since base and step are true, the result follows for all required integers.' },
      { term: 'binomial theorem', answer: 'The binomial theorem expands powers of a binomial using combinations as coefficients.', example: 'The general term helps find a specific coefficient without expanding everything.', exam: 'Watch signs and powers. The powers of the two terms must add to n.' },
      { term: 'scalar product', answer: 'The scalar product measures how much one vector acts in the direction of another and returns a scalar.', example: 'a · b = |a||b|cosθ.', exam: 'Use it for angles, perpendicularity and projection questions.' },
      { term: 'related rates', answer: 'Related rates problems connect variables that change with time using differentiation and a known relationship.', example: 'Differentiate the equation with respect to time, then substitute known values.', exam: 'Do not substitute too early if variables are changing.' },
      { term: 'harder trigonometric identities', answer: 'Harder trig identities are proved by transforming one side using exact identities, compound angle results and algebra.', example: 'Start with the more complicated side.', exam: 'Do not divide by an expression that could be zero unless justified.' }
    ]
  },
  {
    subject: 'HSC Mathematics Extension 2',
    topic: 'Complex Numbers, Vectors, Integration and Mechanics',
    aliases: ['maths extension 2', 'mathematics extension 2', 'ext2', 'ext 2', 'mx2', 'complex numbers', 'mechanics', 'harder integration'],
    concepts: [
      { term: 'complex numbers', answer: 'Complex numbers have real and imaginary parts and can be represented algebraically or on the Argand diagram.', example: 'Modulus gives distance from the origin and argument gives direction.', exam: 'State argument ranges clearly and draw the locus when useful.' },
      { term: 'de Moivre theorem', answer: 'de Moivre’s theorem connects powers and roots of complex numbers in polar form.', example: '(r cis θ)^n = r^n cis(nθ).', exam: 'For roots, include all arguments separated by 2π/n.' },
      { term: 'vectors in three dimensions', answer: '3D vectors describe position, direction, lines and planes using components and scalar products.', example: 'Use dot product for angles and perpendicularity.', exam: 'Set up vector equations before solving components.' },
      { term: 'integration techniques', answer: 'Extension 2 integration includes substitution, integration by parts, partial fractions and trigonometric forms.', example: 'Choose the technique based on structure, not habit.', exam: 'Check derivative of the substitution and include constants in indefinite integrals.' },
      { term: 'mechanics', answer: 'Mechanics uses calculus and vectors to model motion, forces, momentum and connected particles.', example: 'Acceleration is the derivative of velocity or the second derivative of displacement.', exam: 'Draw a force diagram and define direction before forming equations.' }
    ]
  },
  {
    subject: 'HSC English Advanced',
    topic: 'Common Module, Modules A, B and C',
    aliases: ['english advanced', 'advanced english', 'common module', 'module a', 'module b', 'module c', 'texts and human experiences', 'critical study', 'craft of writing'],
    concepts: [
      { term: 'human experiences', answer: 'Human experiences are individual and collective moments that reveal emotions, conflict, memory, identity and connection.', example: 'Texts may show how people respond to pressure, loss, joy, uncertainty or change.', exam: 'Do not retell the plot. Show how language makes the experience feel real.' },
      { term: 'textual conversations', answer: 'Textual conversations occur when texts echo, challenge or reshape ideas from another text or context.', example: 'A later text may reframe values from an earlier text for a new audience.', exam: 'Compare ideas, values and form. Avoid separate mini-essays.' },
      { term: 'critical study', answer: 'Critical study asks you to judge how a text’s construction creates lasting value and meaning.', example: 'Close analysis of form, language and structure is central.', exam: 'Use a confident judgement, not just praise.' },
      { term: 'craft of writing', answer: 'Craft of Writing focuses on how writers deliberately shape voice, structure, imagery, rhythm and perspective.', example: 'A short sentence can create pressure while sensory imagery can make memory feel physical.', exam: 'When reflecting, name the choice and explain its intended effect.' },
      { term: 'quote analysis', answer: 'Quote analysis links technique to meaning and then back to the question.', example: 'Technique without effect is just labelling.', exam: 'Use short quotes and make the explanation do the heavy lifting.' }
    ]
  }
];

const OFFLINE_HSC_STYLE_TOPIC_BANKS: FlashcardTopicBank[] = [
  {
    subject: 'HSC Chemistry',
    topic: 'Module 5 Equilibrium and Acid Reactions exam bank',
    aliases: ['chemistry module 5', 'chem mod 5', 'equilibrium', 'acid reactions', 'le chatelier', 'keq', 'ksp', 'science ready chemistry module 5', 'past paper equilibrium'],
    concepts: [
      { term: 'dynamic equilibrium evidence', answer: 'At dynamic equilibrium the forward and reverse rates are equal, so macroscopic properties stay constant even though particles continue reacting.', example: 'A colour intensity that stops changing can indicate constant concentrations, not that reactions have stopped.', exam: 'For explanation questions, state rate equality and constant concentration separately.' },
      { term: 'Le Chatelier pressure shift', answer: 'Increasing pressure in a gaseous equilibrium favours the side with fewer gas moles; decreasing pressure favours more gas moles.', example: 'A system with 4 gas moles on the left and 2 on the right shifts right when pressure increases.', exam: 'Only use this shortcut for gases. It does not apply to solids or aqueous species.' },
      { term: 'temperature and K value', answer: 'Only temperature changes the value of K for a given equilibrium.', example: 'Adding more reactant changes Q first and the position shifts until Q = K again.', exam: 'If the question says temperature is constant, do not claim K changes.' },
      { term: 'reaction quotient Q', answer: 'Q has the same expression as K but uses current concentrations before the system has reached equilibrium.', example: 'If Q < K, the forward reaction is favoured until equilibrium is restored.', exam: 'Compare Q with K before describing the shift.' },
      { term: 'solubility product Ksp setup', answer: 'Ksp is written from the balanced dissolution equation using ion concentrations raised to their stoichiometric powers.', example: 'For M2X3(s) ⇌ 2M3+(aq) + 3X2-(aq), Ksp = [M3+]^2[X2-]^3.', exam: 'The biggest trap is forgetting coefficients become powers and also affect concentration ratios.' },
      { term: 'weak acid equilibrium', answer: 'Weak acids partially ionise, so an equilibrium exists between the acid molecule and its ions.', example: 'A lower Ka means the acid remains mostly unionised at equilibrium.', exam: 'Do not treat weak acids like strong acids unless the question explicitly allows an approximation.' },
      { term: 'colourimetry equilibrium method', answer: 'Colourimetry can estimate concentration by comparing absorbance to a calibration curve, then substituting into an equilibrium expression.', example: 'The coloured ion concentration is read from the calibration graph before calculating K.', exam: 'Mention calibration standards, absorbance, interpolation and validity of the concentration reading.' },
      { term: 'HSC equilibrium response structure', answer: 'A strong response identifies the disturbance, explains the system response, then states the effect on concentration, colour, yield or K.', example: 'Temperature, pressure and concentration disturbances need different reasoning.', exam: 'Use a three-link chain: change -> shift -> observable/result.' }
    ]
  },
  {
    subject: 'HSC Chemistry',
    topic: 'Modules 6-8 acid-base, organic and analysis exam bank',
    aliases: ['chemistry module 6', 'chemistry module 7', 'chemistry module 8', 'acid base', 'organic chemistry', 'applying chemical ideas', 'spectroscopy', 'titration', 'analysis', 'hsc chemistry'],
    concepts: [
      { term: 'indicator choice', answer: 'An indicator is suitable when its colour-change range falls within the steep section near the equivalence point.', example: 'Strong acid-strong base titrations have a steep curve around pH 7, while weak acid-strong base equivalence is above pH 7.', exam: 'Explain endpoint, equivalence point and pH range, not just the indicator name.' },
      { term: 'titration calculation chain', answer: 'Titration calculations follow concentration to moles, mole ratio from the balanced equation, then concentration or mass of the unknown.', example: 'n = cV must use litres, then the balanced equation converts to the analyte amount.', exam: 'Write the balanced equation before using ratios.' },
      { term: 'conductivity during titration', answer: 'Conductivity changes because ions are consumed, formed or diluted during the reaction.', example: 'A minimum can occur when highly mobile ions have been neutralised before excess titrant increases ion concentration again.', exam: 'Name the ions responsible for the change rather than saying conductivity “just decreases”.' },
      { term: 'organic reaction pathway', answer: 'Reaction pathways link functional groups through reagents and conditions.', example: 'An alkene can form an alcohol by hydration, then oxidise to an aldehyde, ketone or carboxylic acid depending on structure and conditions.', exam: 'State the reagent, condition and structural change.' },
      { term: 'polymerisation evidence', answer: 'Addition polymerisation consumes C=C bonds, while condensation polymerisation releases small molecules and forms repeating linkages.', example: 'IR evidence may show disappearance of alkene C=C or appearance of ester/amide features.', exam: 'Draw the repeating unit clearly with continuation bonds.' },
      { term: 'spectroscopy cross-checking', answer: 'Reliable organic identification uses several pieces of evidence together rather than one spectrum peak alone.', example: 'Mass spectrum gives molar mass clues, IR identifies functional groups, and proton NMR gives hydrogen environments.', exam: 'For high-mark questions, explain how each data set supports or rules out a structure.' },
      { term: 'calibration curve validity', answer: 'A calibration curve is valid when standards bracket the unknown concentration and the measured response is linear for the method.', example: 'Dilute an unknown if its absorbance is outside the calibration range.', exam: 'Use the words validity, reliability and accuracy precisely.' },
      { term: 'qualitative ion testing trap', answer: 'Sequential ion tests can remove ions before later tests, so the order of precipitation and filtration matters.', example: 'If an ion precipitates early and is filtered off, it cannot react in a later confirmation step.', exam: 'Track what remains in the filtrate after each step.' }
    ]
  },
  {
    subject: 'HSC Physics',
    topic: 'Modules 5-8 Physics exam bank',
    aliases: ['physics module 5', 'physics module 6', 'physics module 7', 'physics module 8', 'advanced mechanics', 'electromagnetism', 'nature of light', 'universe to atom', 'thsc physics', 'hsc physics'],
    concepts: [
      { term: 'centripetal force identity', answer: 'Centripetal force is the net inward force causing circular motion, not an extra force by itself.', example: 'Tension, gravity, friction or magnetic force can provide the centripetal force depending on the situation.', exam: 'Name the real force and then set it equal to mv²/r.' },
      { term: 'orbital radius trap', answer: 'Orbital calculations use distance from the centre of the planet, not altitude above the surface alone.', example: 'For a satellite, r = Earth radius + altitude.', exam: 'This is one of the quickest ways to lose a calculation mark.' },
      { term: 'magnetic force direction', answer: 'The direction of magnetic force depends on velocity or current direction and magnetic field direction.', example: 'Use the right-hand rule consistently for positive charges or conventional current.', exam: 'For electrons, reverse the direction found for a positive charge.' },
      { term: 'Lenz law energy argument', answer: 'Lenz’s law says the induced current opposes the change in magnetic flux that caused it, which conserves energy.', example: 'A falling magnet through a conducting tube is slowed because the induced field opposes the motion.', exam: 'State the change in flux first, then the opposing induced effect.' },
      { term: 'transformer limitation', answer: 'Real transformers lose energy through heating, eddy currents, flux leakage and hysteresis.', example: 'Laminated iron cores reduce eddy current losses.', exam: 'Ideal transformer equations need AC and assume negligible losses.' },
      { term: 'photoelectric evidence', answer: 'The photoelectric effect supports the photon model because electrons are emitted only when photon frequency exceeds a threshold.', example: 'Increasing intensity below threshold does not eject electrons.', exam: 'Separate frequency effects from intensity effects.' },
      { term: 'spectral line evidence', answer: 'Discrete spectral lines show that atomic energy levels are quantised.', example: 'Emission lines occur when electrons transition to lower energy levels and emit photons.', exam: 'Link energy difference to photon frequency using E = hf.' },
      { term: 'mass defect', answer: 'Mass defect is the difference between the mass of separate nucleons and the nucleus; the missing mass corresponds to binding energy.', example: 'E = mc² converts mass defect into released or required energy.', exam: 'Use consistent units and explain binding energy as stability, not just “lost mass”.' },
      { term: 'Hubble evidence', answer: 'Redshift data supports an expanding universe because distant galaxies show wavelength shifts related to recession.', example: 'Hubble’s law connects recession velocity and distance.', exam: 'Do not describe galaxies expanding into empty space; space itself is expanding in the model.' }
    ]
  },
  {
    subject: 'HSC Mathematics',
    topic: 'HSC mathematics exam method bank',
    aliases: ['maths advanced', 'mathematics advanced', 'extension 1', 'extension 2', 'hsc maths', 'past paper maths', 'exam method'],
    concepts: [
      { term: 'item difficulty sequence', answer: 'HSC mathematics questions usually become less scaffolded and more decision-heavy later in the paper.', example: 'A later calculus item may require selecting the method before doing any algebra.', exam: 'Write the method first so your working is easy to follow.' },
      { term: 'domain before inverse', answer: 'Inverse function questions require domain and range control before or after finding the inverse rule.', example: 'Restrict a parabola to one branch if the inverse needs to be a function.', exam: 'The algebra is not enough; state the restricted domain.' },
      { term: 'calculus optimisation setup', answer: 'Optimisation begins by defining variables, writing the quantity to optimise, applying constraints, then differentiating.', example: 'Area or volume formulas often need one variable eliminated before differentiation.', exam: 'Mark allocations usually reward setup, derivative, stationary point test and conclusion.' },
      { term: 'proof communication', answer: 'Proof marks come from valid logical links, not only reaching the final expression.', example: 'Induction needs the base case, assumption, inductive step and conclusion.', exam: 'Avoid “obvious” jumps; write the reason.' },
      { term: 'vector geometry plan', answer: 'Vector geometry becomes cleaner when points, direction vectors and dot products are defined before solving.', example: 'Use dot product for angles or perpendicularity, and scalar multiples for parallel lines.', exam: 'A labelled diagram often prevents sign errors.' }
    ]
  }
];


function buildFlashcardAnswer(concept: FlashcardConcept) {
  const parts = [concept.answer];
  if (concept.example) parts.push(`Example: ${concept.example}`);
  if (concept.exam) parts.push(`Exam move: ${concept.exam}`);
  return parts.filter(Boolean).join(' ');
}

function makeCoreFlashcardQuestion(subject: string, topic: string, term: string) {
  const lowerSubject = subject.toLowerCase();
  if (lowerSubject.includes('english')) return `How does ${term} shape meaning in an English Advanced response?`;
  if (lowerSubject.includes('mathematics') || lowerSubject.includes('maths')) return `When should you use ${term}, and what is the key rule?`;
  if (lowerSubject.includes('religion')) return `Explain the significance of ${term} in ${topic}.`;
  return `Explain ${term} in the context of ${topic}.`;
}

function makeApplicationFlashcardQuestion(subject: string, topic: string, term: string) {
  const lowerSubject = subject.toLowerCase();
  if (lowerSubject.includes('english')) return `Write a sharp HSC analysis point using ${term}.`;
  if (lowerSubject.includes('mathematics') || lowerSubject.includes('maths')) return `How would ${term} appear in a harder exam question?`;
  if (lowerSubject.includes('religion')) return `How could ${term} be used in a Studies of Religion extended response?`;
  if (lowerSubject.includes('chemistry') || lowerSubject.includes('physics')) return `How would you apply ${term} in an HSC calculation or explanation?`;
  return `Apply ${term} to a likely HSC-style question.`;
}

function makeTrapFlashcardQuestion(subject: string, topic: string, term: string) {
  const lowerSubject = subject.toLowerCase();
  if (lowerSubject.includes('mathematics') || lowerSubject.includes('maths')) return `What mistake should you avoid when using ${term}?`;
  if (lowerSubject.includes('english')) return `What makes a weak paragraph on ${term}, and how do you fix it?`;
  return `What examiner trap should you avoid with ${term} in ${topic}?`;
}

function buildFlashcardKnowledgeBank(): FlashcardBankEntry[] {
  const entries: FlashcardBankEntry[] = [];
  const seen = new Set<string>();

  function addEntry(subject: string, topic: string, aliases: string[], concept: FlashcardConcept, front: string, back: string, extraTags: string[] = []) {
    const key = `${topic}|${front}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({
      subject,
      topic,
      front,
      back,
      tags: Array.from(new Set([
        subject,
        topic,
        ...aliases,
        concept.term,
        ...(concept.tags || []),
        ...extraTags
      ].map((item) => normaliseSearchText(item)).filter(Boolean)))
    });
  }

  for (const bank of [...FLASHCARD_TOPIC_BANKS, ...EXPANDED_FLASHCARD_TOPIC_BANKS, ...OFFLINE_HSC_STYLE_TOPIC_BANKS]) {
    for (const concept of bank.concepts) {
      addEntry(bank.subject, bank.topic, bank.aliases, concept, concept.q || makeCoreFlashcardQuestion(bank.subject, bank.topic, concept.term), buildFlashcardAnswer(concept));
      addEntry(
        bank.subject,
        bank.topic,
        bank.aliases,
        concept,
        makeApplicationFlashcardQuestion(bank.subject, bank.topic, concept.term),
        concept.example ? `${concept.example}${concept.exam ? ` Exam move: ${concept.exam}` : ''}` : buildFlashcardAnswer(concept),
        ['application', 'hsc', 'exam']
      );
      addEntry(
        bank.subject,
        bank.topic,
        bank.aliases,
        concept,
        makeTrapFlashcardQuestion(bank.subject, bank.topic, concept.term),
        concept.exam || concept.contrast || concept.example || concept.answer,
        ['exam', 'avoid mistakes', 'hsc']
      );
      if (concept.contrast) {
        addEntry(bank.subject, bank.topic, bank.aliases, concept, `Compare ${concept.term} with a related idea in ${bank.topic}.`, concept.contrast, ['difference', 'compare']);
      }
    }
  }

  return entries;
}

const FLASHCARD_KNOWLEDGE_BANK: FlashcardBankEntry[] = buildFlashcardKnowledgeBank();

const FLASHCARD_STOPWORDS = new Set([
  'generate', 'questions', 'question', 'cards', 'card', 'flashcards', 'flashcard', 'from', 'module', 'hsc', 'covering', 'about', 'with', 'for', 'the', 'and', 'or', 'give', 'make', 'create', 'please', 'revision', 'study', 'notes', 'exam', 'exams', 'topic', 'topics', 'principle', 'principles', 'what', 'when', 'where', 'why', 'how', 'into'
]);

function smartTitleCase(value: string) {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normaliseSearchText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s+-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractFlashcardCount(prompt: string) {
  const match = prompt.match(/(\d{1,2})\s*(?:flashcards?|cards?|questions?)/i) || prompt.match(/(?:generate|create|make)\s*(\d{1,2})/i);
  const count = match ? Number(match[1]) : 10;
  return clamp(Number.isFinite(count) ? count : 10, 3, 40);
}

function extractFlashcardTopics(prompt: string): string[] {
  const cleaned = prompt
    .replace(/[\n\r]+/g, ' ')
    .replace(/\b\d{1,2}\s*(?:flashcards?|cards?|questions?)\b/gi, ' ')
    .replace(/[^a-zA-Z0-9'\s,&/-]/g, ' ');
  const explicit = cleaned.match(/(?:covering|on|about|for)\s+(.+)$/i)?.[1] || cleaned;
  const chunks = explicit
    .split(/,|;|\band\b|\bplus\b|&/i)
    .map((item) => item.trim())
    .filter(Boolean);
  const candidates: string[] = [];

  for (const chunk of chunks) {
    const words = chunk.split(/\s+/).filter((word) => {
      const clean = word.toLowerCase().replace(/[^a-z0-9']/g, '');
      return clean.length > 2 && !FLASHCARD_STOPWORDS.has(clean);
    });
    if (words.length) candidates.push(smartTitleCase(words.slice(0, 5).join(' ')));
  }

  const unique = Array.from(new Set(candidates.map((item) => item.replace(/\s+/g, ' ').trim()).filter(Boolean)));
  return unique.length ? unique : ['Key Concept', 'Main Idea', 'Important Process'];
}

function promptModuleNumbers(prompt: string) {
  const cleanPrompt = normaliseSearchText(prompt);
  const numbers = new Set<number>();
  const regex = /\b(?:module|mod)\s*(\d)\b/g;
  let match = regex.exec(cleanPrompt);
  while (match) {
    const value = Number(match[1]);
    if (value >= 1 && value <= 8) numbers.add(value);
    match = regex.exec(cleanPrompt);
  }
  return numbers;
}

function scoreFlashcardBankEntry(entry: FlashcardBankEntry, prompt: string) {
  const cleanPrompt = normaliseSearchText(prompt)
    .replace(/\bext\s*1\b/g, 'extension 1')
    .replace(/\bext\s*2\b/g, 'extension 2')
    .replace(/\bmx1\b/g, 'extension 1')
    .replace(/\bmx2\b/g, 'extension 2');
  const searchable = normaliseSearchText([entry.subject, entry.topic, entry.front, entry.back, ...entry.tags].join(' '));
  let score = 0;

  for (const tag of entry.tags) {
    const cleanTag = normaliseSearchText(tag);
    if (!cleanTag) continue;
    if (cleanPrompt.includes(cleanTag)) score += cleanTag.length > 12 ? 18 : cleanTag.length > 8 ? 10 : 5;
  }

  const modules = promptModuleNumbers(cleanPrompt);
  modules.forEach((moduleNumber) => {
    if (searchable.includes(`module ${moduleNumber}`) || searchable.includes(`mod ${moduleNumber}`)) score += 24;
  });

  const subjectBoosts: Array<[string, string[]]> = [
    ['chemistry', ['chemistry', 'chem']],
    ['physics', ['physics']],
    ['biology', ['biology', 'bio']],
    ['math', ['math', 'maths', 'mathematics']],
    ['english', ['english']],
    ['pdhpe', ['pdhpe', 'health', 'sports medicine']],
    ['economics', ['economics', 'eco']],
    ['legal studies', ['legal', 'law', 'crime', 'human rights']],
    ['psychology', ['psychology', 'cognition', 'memory']],
    ['studies of religion', ['studies of religion', 'sor', 'sor1', 'religion']],
    ['mathematics advanced', ['maths advanced', 'mathematics advanced', 'advanced maths']],
    ['mathematics extension 1', ['extension 1', 'ext 1', 'ext1', 'mx1']],
    ['mathematics extension 2', ['extension 2', 'ext 2', 'ext2', 'mx2']],
    ['english advanced', ['english advanced', 'advanced english']]
  ];
  for (const [needle, variants] of subjectBoosts) {
    if (variants.some((variant) => cleanPrompt.includes(variant)) && searchable.includes(needle)) score += 10;
  }

  if (cleanPrompt.includes('organic') && searchable.includes('organic')) score += 30;
  if (cleanPrompt.includes('acid') && searchable.includes('acid')) score += 16;
  if (cleanPrompt.includes('equilibrium') && searchable.includes('equilibrium')) score += 18;
  if (cleanPrompt.includes('extension 2') && searchable.includes('extension 2')) score += 30;
  if (cleanPrompt.includes('extension 1') && searchable.includes('extension 1')) score += 30;
  if (cleanPrompt.includes('standard') && searchable.includes('standard')) score += 20;
  if (cleanPrompt.includes('advanced') && searchable.includes('advanced')) score += 20;

  for (const word of cleanPrompt.split(' ')) {
    if (word.length > 3 && !FLASHCARD_STOPWORDS.has(word) && searchable.includes(word)) score += 2;
  }
  return score;
}

function sampleFlashcardEntries(entries: FlashcardBankEntry[], count: number) {
  const used = new Set<string>();
  const output: FlashcardBankEntry[] = [];
  for (const entry of entries) {
    const conceptKey = normaliseSearchText(`${entry.subject} ${entry.topic} ${entry.front.replace(/^(explain|apply|compare|write|what|when|how)\b/i, '')}`);
    if (used.has(conceptKey)) continue;
    used.add(conceptKey);
    output.push(entry);
    if (output.length >= count) break;
  }
  return output;
}

function getFlashcardBankMatches(prompt: string, count: number) {
  const ranked = FLASHCARD_KNOWLEDGE_BANK
    .map((entry, index) => ({ entry, index, score: scoreFlashcardBankEntry(entry, prompt) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const highQuality = ranked.filter((item) => item.score >= 14);
  const source = highQuality.length ? highQuality : ranked;
  if (!source.length) return [];

  const bestScore = source[0]?.score || 0;
  const relevantPool = source
    .filter((item) => item.score >= Math.max(8, Math.floor(bestScore * 0.45)))
    .map((item) => item.entry);
  return sampleFlashcardEntries(relevantPool.length ? relevantPool : source.map((item) => item.entry), count);
}

function generateFallbackFlashcardPreviews(prompt: string, deck: string, count: number): GeneratedFlashcardPreview[] {
  const topics = extractFlashcardTopics(prompt);
  const templates = [
    (topic: string) => ({ front: `What is the key idea behind ${topic}?`, back: `Use your notes to write a clear definition of ${topic}, then add one example.` }),
    (topic: string) => ({ front: `Explain ${topic} in a HSC-style answer.`, back: `Write a 2-3 sentence answer using syllabus language, a cause/effect link, and one specific detail.` }),
    (topic: string) => ({ front: `What evidence or example could support an answer on ${topic}?`, back: `Add a concrete example, diagram point, equation, quote, or case study from your notes.` }),
    (topic: string) => ({ front: `What is a common mistake students make with ${topic}?`, back: `Write the mistake, then correct it in your own words.` }),
    (topic: string) => ({ front: `How does ${topic} connect to another syllabus idea?`, back: `Name the connected idea and explain the relationship clearly.` })
  ];
  return Array.from({ length: count }, (_, index) => {
    const topic = topics[index % topics.length];
    const made = templates[index % templates.length](topic);
    return { id: makeId(), deck, front: made.front, back: made.back };
  });
}

function generateExamStyleFlashcardFillers(prompt: string, deck: string, count: number, matches: FlashcardBankEntry[]): GeneratedFlashcardPreview[] {
  if (count <= 0) return [];
  const topics = matches.length
    ? Array.from(new Set(matches.map((entry) => entry.topic).filter(Boolean)))
    : extractFlashcardTopics(prompt);
  const templates = [
    (topic: string) => ({
      front: `Original HSC-style drill: explain one cause-and-effect relationship in ${topic}.`,
      back: 'Structure the answer as: definition -> cause/effect link -> example, equation, diagram feature or data reference -> final judgement if asked.'
    }),
    (topic: string) => ({
      front: `What would a marker expect in a 4-mark ${topic} response?`,
      back: 'Aim for four clear pieces of evidence: correct concept, accurate process or calculation, specific supporting detail, and a conclusion that answers the command word.'
    }),
    (topic: string) => ({
      front: `Create a mini mistake-check for ${topic}.`,
      back: 'Check units, definitions, assumptions, sign/direction, and whether the response uses the stimulus rather than generic memorised notes.'
    }),
    (topic: string) => ({
      front: `How could ${topic} be tested with unfamiliar stimulus?`,
      back: 'Identify the syllabus concept behind the stimulus first, then translate the diagram/data/table into the rule, equation, trend or evidence required.'
    })
  ];
  return Array.from({ length: count }, (_, index) => {
    const topic = topics[index % topics.length] || 'this topic';
    const made = templates[index % templates.length](topic);
    return { id: makeId(), deck, front: made.front, back: made.back };
  });
}

function generateLocalFlashcardSet(prompt: string, deck: string): { cards: GeneratedFlashcardPreview[]; warning: string } {
  const count = extractFlashcardCount(prompt);
  const matches = getFlashcardBankMatches(prompt, count);
  if (matches.length) {
    const coreCards = matches.map((entry) => ({ id: makeId(), deck, front: entry.front, back: entry.back }));
    const fillerCards = generateExamStyleFlashcardFillers(prompt, deck, count - coreCards.length, matches);
    return {
      cards: [...coreCards, ...fillerCards].slice(0, count),
      warning: matches.length < count
        ? `${matches.length} direct bank cards found, then Dux filled the rest with original HSC-style practice prompts.`
        : 'Generated locally from the built-in HSC-style bank.'
    };
  }
  return {
    cards: generateFallbackFlashcardPreviews(prompt, deck, count),
    warning: "This exact topic is not in the built-in bank yet, so Dux made scaffolded HSC-style prompts. Check them against your class notes before saving."
  };
}


type DuxAiGuide = {
  subject: string;
  title: string;
  keys: string[];
  overview: string;
  keyPoints: string[];
  examMoves: string[];
  formulas?: string[];
};

const DUX_AI_GUIDES: DuxAiGuide[] = [
  {
    subject: 'HSC Chemistry',
    title: 'Module 1: Properties and Structure of Matter',
    keys: ['chemistry module 1', 'chem mod 1', 'properties and structure of matter', 'atomic structure', 'bonding', 'isotopes', 'periodic table', 'intermolecular forces'],
    overview: 'Module 1 is about how atomic structure, bonding and intermolecular forces explain the physical and chemical properties of substances.',
    keyPoints: ['Isotopes have the same proton number but different neutron numbers.', 'Ionic, covalent and metallic bonding create different structures and properties.', 'Electronegativity and molecular shape affect polarity.', 'Intermolecular forces explain boiling point, solubility and volatility trends.'],
    examMoves: ['Link structure directly to property, do not just name the bond.', 'Use correct terms: lattice, delocalised electrons, dipole, hydrogen bonding.', 'For trends, state the trend and then explain it using forces or electron structure.'],
    formulas: ['Relative atomic mass = sum(isotopic mass x fractional abundance)']
  },
  {
    subject: 'HSC Chemistry',
    title: 'Module 2: Introduction to Quantitative Chemistry',
    keys: ['chemistry module 2', 'chem mod 2', 'quantitative chemistry', 'mole', 'stoichiometry', 'limiting reagent', 'concentration', 'gas laws'],
    overview: 'Module 2 is the calculation engine of chemistry: moles, concentration, equations, gases and yields.',
    keyPoints: ['Balanced equations give mole ratios.', 'Limiting reagents cap the maximum product yield.', 'Concentration links amount of substance to solution volume.', 'Gas calculations depend on conditions and the model used.'],
    examMoves: ['Write known values with units first.', 'Convert mass to moles before using ratios.', 'Check whether volume is in L or mL.', 'Keep sig figs reasonable and include units.'],
    formulas: ['n = m/M', 'c = n/V', 'PV = nRT', 'percentage yield = actual/theoretical x 100']
  },
  {
    subject: 'HSC Chemistry',
    title: 'Module 3: Reactive Chemistry',
    keys: ['chemistry module 3', 'chem mod 3', 'reactive chemistry', 'redox', 'precipitation', 'acid reactions', 'combustion', 'activity series'],
    overview: 'Module 3 focuses on reaction types, evidence of reaction, redox, metal reactivity and ionic equations.',
    keyPoints: ['Oxidation is loss of electrons and reduction is gain of electrons.', 'Activity series predicts metal displacement reactions.', 'Precipitation occurs when ions form an insoluble compound.', 'Net ionic equations show only reacting species.'],
    examMoves: ['Assign oxidation numbers carefully.', 'Remove spectator ions in ionic equations.', 'Use solubility rules for precipitates.', 'State observations as evidence.']
  },
  {
    subject: 'HSC Chemistry',
    title: 'Module 4: Drivers of Reactions',
    keys: ['chemistry module 4', 'chem mod 4', 'drivers of reactions', 'enthalpy', 'entropy', 'gibbs', 'collision theory', 'activation energy', 'catalyst'],
    overview: 'Module 4 explains why reactions occur and how energy, entropy, Gibbs free energy and collision theory affect reaction behaviour.',
    keyPoints: ['Exothermic reactions release heat and endothermic reactions absorb heat.', 'Entropy describes energy dispersal and disorder.', 'Gibbs free energy predicts spontaneity under given conditions.', 'Catalysts lower activation energy but are not consumed.'],
    examMoves: ['Connect energy profile diagrams to activation energy and enthalpy change.', 'For rate, mention collision frequency, energy and orientation.', 'For spontaneity, use both enthalpy and entropy where relevant.'],
    formulas: ['delta G = delta H - T delta S']
  },
  {
    subject: 'HSC Chemistry',
    title: 'Module 5: Equilibrium and Acid Reactions',
    keys: ['chemistry module 5', 'chem mod 5', 'equilibrium', 'le chatelier', 'keq', 'reaction quotient', 'weak acid', 'buffer', 'haber'],
    overview: 'Module 5 is about dynamic equilibrium and how systems shift when concentration, temperature or pressure changes.',
    keyPoints: ['At equilibrium, forward and reverse reaction rates are equal.', 'Le Chatelier’s principle predicts the direction of shift after a disturbance.', 'K describes the equilibrium position at a particular temperature.', 'Weak acids establish equilibrium rather than fully ionising.'],
    examMoves: ['Always state the imposed change, the system response, and the effect on yield.', 'Temperature changes K, while concentration and pressure usually change position, not K.', 'For gases, compare moles of gas on each side.'],
    formulas: ['K = products/reactants using equilibrium concentrations', 'Ka = [H+][A-]/[HA]']
  },
  {
    subject: 'HSC Chemistry',
    title: 'Module 6: Acid/Base Reactions',
    keys: ['chemistry module 6', 'chem mod 6', 'acid base', 'ph', 'titration', 'ka', 'indicator', 'neutralisation', 'buffer'],
    overview: 'Module 6 covers acid-base models, strong and weak acids, pH, titrations, indicators and calculations.',
    keyPoints: ['Bronsted-Lowry acids donate protons and bases accept protons.', 'Strong acids fully ionise; weak acids partially ionise.', 'Equivalence point and endpoint are not the same thing.', 'Indicators must be chosen to match the titration curve.'],
    examMoves: ['Use stoichiometry at equivalence point.', 'Do not treat weak acids as fully ionised.', 'Show dilution and neutralisation steps separately.', 'State indicator suitability using pH range.'],
    formulas: ['pH = -log[H+]', '[H+] = 10^-pH', 'Ka = [H+][A-]/[HA]']
  },
  {
    subject: 'HSC Chemistry',
    title: 'Module 7: Organic Chemistry',
    keys: ['chemistry module 7', 'chem mod 7', 'organic', 'alkane', 'alkene', 'alcohol', 'carboxylic acid', 'ester', 'polymer', 'condensation', 'addition', 'functional group', 'nomenclature'],
    overview: 'Module 7 studies carbon compounds, functional groups, naming, reaction pathways, polymers and the relationship between structure and properties.',
    keyPoints: ['Homologous series share a functional group and general formula.', 'Functional groups control chemical behaviour.', 'Alkenes undergo addition reactions because of the C=C double bond.', 'Esters form from alcohols and carboxylic acids through esterification.', 'Addition polymers form without small molecule loss; condensation polymers release small molecules.'],
    examMoves: ['Name the longest carbon chain first, then functional group and substituent positions.', 'Draw structural formulae clearly.', 'State reagents and conditions in reaction pathways.', 'Link boiling point and solubility to polarity and hydrogen bonding.'],
    formulas: ['Alkanes: CnH2n+2', 'Alkenes: CnH2n', 'Alkynes: CnH2n-2']
  },
  {
    subject: 'HSC Chemistry',
    title: 'Module 8: Applying Chemical Ideas',
    keys: ['chemistry module 8', 'chem mod 8', 'applying chemical ideas', 'analysis', 'aas', 'uv-vis', 'ir', 'nmr', 'mass spectrometry', 'chromatography', 'validity', 'reliability'],
    overview: 'Module 8 is about qualitative and quantitative chemical analysis, instrumental techniques and judging evidence quality.',
    keyPoints: ['Qualitative analysis identifies what is present.', 'Quantitative analysis measures how much is present.', 'AAS and UV-vis often use calibration curves.', 'IR, NMR and mass spectrometry help identify organic structures.', 'Validity, reliability and accuracy must be evaluated separately.'],
    examMoves: ['State what the technique measures, not just its name.', 'For calibration curves, explain standards and interpolation.', 'Use multiple pieces of evidence for structural identification.']
  },
  {
    subject: 'HSC Physics',
    title: 'Module 1: Kinematics',
    keys: ['physics module 1', 'phys mod 1', 'kinematics', 'motion', 'suvat', 'displacement', 'velocity', 'acceleration', 'projectile'],
    overview: 'Kinematics describes motion using displacement, velocity, acceleration and time without focusing on the cause of the motion.',
    keyPoints: ['Displacement is vector change in position.', 'Velocity-time graph area gives displacement.', 'Acceleration is the gradient of a velocity-time graph.', 'Projectile motion separates horizontal and vertical components.'],
    examMoves: ['Choose a sign convention and stick to it.', 'Split projectile problems into x and y components.', 'Use graph gradients and areas correctly.'],
    formulas: ['v = u + at', 's = ut + 1/2 at^2', 'v^2 = u^2 + 2as']
  },
  {
    subject: 'HSC Physics',
    title: 'Module 2: Dynamics',
    keys: ['physics module 2', 'phys mod 2', 'dynamics', 'forces', 'newton', 'friction', 'momentum', 'impulse'],
    overview: 'Dynamics explains why motion changes by analysing forces, Newton’s laws, momentum and impulse.',
    keyPoints: ['Net force causes acceleration.', 'Newton’s third law pairs act on different objects.', 'Momentum is conserved in isolated systems.', 'Impulse equals change in momentum.'],
    examMoves: ['Draw a force diagram first.', 'Separate action-reaction pairs from balanced forces.', 'Use vector directions for momentum.'],
    formulas: ['F = ma', 'p = mv', 'J = F delta t = delta p']
  },
  {
    subject: 'HSC Physics',
    title: 'Module 3: Waves and Thermodynamics',
    keys: ['physics module 3', 'phys mod 3', 'waves', 'thermodynamics', 'wave speed', 'frequency', 'period', 'sound', 'heat'],
    overview: 'This module links wave behaviour to energy transfer and introduces thermal ideas such as heat, temperature and energy transfer.',
    keyPoints: ['Wave speed depends on frequency and wavelength.', 'Reflection, refraction, diffraction and interference describe wave behaviour.', 'Temperature measures average kinetic energy.', 'Heat flows due to temperature difference.'],
    examMoves: ['Use diagrams for wavefronts and rays.', 'Distinguish heat from temperature.', 'State whether the wave is transverse or longitudinal.'],
    formulas: ['v = fλ', 'T = 1/f']
  },
  {
    subject: 'HSC Physics',
    title: 'Module 4: Electricity and Magnetism',
    keys: ['physics module 4', 'phys mod 4', 'electricity', 'magnetism', 'circuits', 'ohm', 'resistance', 'fields'],
    overview: 'This module covers electric circuits, resistance, fields and the relationship between electric and magnetic effects.',
    keyPoints: ['Voltage is energy per unit charge.', 'Current is rate of charge flow.', 'Series circuits share current; parallel circuits share voltage.', 'Magnetic fields act around moving charges and magnets.'],
    examMoves: ['Label series and parallel sections clearly.', 'Use equivalent resistance before total current.', 'Use field line direction conventions.'],
    formulas: ['V = IR', 'P = VI', 'E = V/d']
  },
  {
    subject: 'HSC Physics',
    title: 'Module 5: Advanced Mechanics',
    keys: ['physics module 5', 'phys mod 5', 'advanced mechanics', 'circular motion', 'gravity', 'orbital', 'energy', 'satellite'],
    overview: 'Advanced Mechanics extends forces and motion to circular motion, gravitational fields, energy and orbital systems.',
    keyPoints: ['Centripetal force points toward the centre of circular motion.', 'Gravitational field strength weakens with distance squared.', 'Satellites are continuously falling around Earth.', 'Energy methods can simplify orbital and projectile problems.'],
    examMoves: ['Do not call centripetal force a new force; identify the real force causing it.', 'Use radius from the centre of the planet, not height above surface alone.'],
    formulas: ['F = mv^2/r', 'F = Gm1m2/r^2', 'g = GM/r^2']
  },
  {
    subject: 'HSC Physics',
    title: 'Module 6: Electromagnetism',
    keys: ['physics module 6', 'phys mod 6', 'electromagnetism', 'motor effect', 'induction', 'faraday', 'lenz', 'transformer', 'generator'],
    overview: 'Electromagnetism focuses on forces on moving charges and current-carrying conductors, induction and energy transfer in generators and transformers.',
    keyPoints: ['Current in a magnetic field can experience a force.', 'Changing magnetic flux induces an emf.', 'Lenz’s law says the induced effect opposes the change causing it.', 'Transformers change AC voltage using electromagnetic induction.'],
    examMoves: ['Use right-hand rules carefully.', 'Explain induced current direction using opposition to flux change.', 'Mention AC for transformer operation.'],
    formulas: ['F = BIL sinθ', 'F = qvB sinθ', 'emf = -N delta flux / delta t', 'Vp/Vs = Np/Ns']
  },
  {
    subject: 'HSC Physics',
    title: 'Module 7: The Nature of Light',
    keys: ['physics module 7', 'phys mod 7', 'nature of light', 'light', 'photoelectric', 'interference', 'diffraction', 'spectra', 'black body'],
    overview: 'This module examines evidence for wave and particle models of light, including interference, diffraction, spectra and the photoelectric effect.',
    keyPoints: ['Interference and diffraction support the wave model.', 'The photoelectric effect supports photon energy packets.', 'Emission and absorption spectra reveal atomic energy levels.', 'Black body radiation challenged classical physics.'],
    examMoves: ['Match each experiment to the model it supports.', 'Use threshold frequency and work function correctly.', 'For spectra, link lines to electron transitions.'],
    formulas: ['E = hf', 'c = fλ', 'Kmax = hf - Φ']
  },
  {
    subject: 'HSC Physics',
    title: 'Module 8: From the Universe to the Atom',
    keys: ['physics module 8', 'phys mod 8', 'universe to atom', 'relativity', 'nuclear', 'standard model', 'hubble', 'atom', 'radioactivity'],
    overview: 'Module 8 links cosmology, relativity, atomic models, nuclear physics and particle physics.',
    keyPoints: ['Special relativity changes ideas of time, length and simultaneity.', 'Spectral evidence helps understand stars and galaxies.', 'Nuclear reactions involve mass-energy conversion.', 'The Standard Model classifies fundamental particles.'],
    examMoves: ['Use evidence when discussing models.', 'Distinguish fusion, fission and radioactive decay.', 'Avoid vague “energy is released” answers: explain mass defect where relevant.'],
    formulas: ['E = mc^2', 'v = H0 d']
  },
  {
    subject: 'HSC Mathematics Advanced',
    title: 'Functions, graphs and modelling',
    keys: ['maths advanced', 'mathematics advanced', 'functions', 'graphs', 'domain', 'range', 'transformations', 'modelling'],
    overview: 'Advanced Maths functions work is about understanding rules, graphs, transformations, domains, ranges and modelling relationships.',
    keyPoints: ['Domain is allowed input; range is possible output.', 'Transformations shift, stretch or reflect graphs.', 'Composite and inverse functions require careful domain handling.', 'Modelling requires interpreting parameters in context.'],
    examMoves: ['State restrictions clearly.', 'Sketch key features before solving graphically.', 'Check inverse functions by swapping x and y.']
  },
  {
    subject: 'HSC Mathematics Advanced',
    title: 'Trigonometry',
    keys: ['maths advanced', 'trigonometry', 'trig', 'sine', 'cosine', 'tan', 'radians', 'exact values'],
    overview: 'Trigonometry in Advanced Maths uses exact values, identities, radians and periodic functions to solve geometric and modelling problems.',
    keyPoints: ['Radians connect arc length to angle.', 'Sine and cosine are periodic.', 'Identities simplify equations and expressions.', 'General solutions must account for periodicity.'],
    examMoves: ['Check quadrant signs.', 'Use exact values where possible.', 'Give all solutions in the requested domain.'],
    formulas: ['sin^2 x + cos^2 x = 1', 'arc length = rθ']
  },
  {
    subject: 'HSC Mathematics Advanced',
    title: 'Calculus, exponentials and logarithms',
    keys: ['maths advanced', 'calculus', 'differentiation', 'integration', 'exponential', 'logarithm', 'rates of change', 'area under curve'],
    overview: 'Calculus studies rates of change and accumulation. Exponential and logarithmic functions model growth, decay and inverse relationships.',
    keyPoints: ['Derivative means instantaneous rate of change.', 'Integral can represent area or accumulated change.', 'e^x differentiates to itself.', 'ln x is the inverse of e^x.'],
    examMoves: ['Show working for product, quotient and chain rules.', 'Use derivative sign to justify increasing/decreasing.', 'Include +C for indefinite integrals.'],
    formulas: ['d/dx(x^n)=nx^(n-1)', '∫x^n dx = x^(n+1)/(n+1)+C', 'd/dx(e^x)=e^x', 'd/dx(ln x)=1/x']
  },
  {
    subject: 'HSC Mathematics Extension 1',
    title: 'Extension 1 core methods',
    keys: ['extension 1', 'ext 1', 'mx1', 'maths extension 1', 'binomial', 'combinatorics', 'vectors', 'trig equations', 'proof', 'calculus'],
    overview: 'Extension 1 pushes Advanced concepts further with proof, combinatorics, vectors, harder trigonometry and more advanced calculus.',
    keyPoints: ['Combinatorics needs careful counting without double-counting.', 'Vectors represent magnitude and direction.', 'Binomial theorem expands powers efficiently.', 'Proof questions require a clear logical chain.'],
    examMoves: ['Define variables before proof.', 'Use diagrams for vector geometry.', 'Check whether order matters in counting questions.'],
    formulas: ['nCr = n!/(r!(n-r)!)', '(a+b)^n = sum nCr a^(n-r)b^r']
  },
  {
    subject: 'HSC Mathematics Extension 2',
    title: 'Extension 2 core methods',
    keys: ['extension 2', 'ext 2', 'mx2', 'maths extension 2', 'complex numbers', 'proof', 'mechanics', 'vectors', 'integration techniques'],
    overview: 'Extension 2 builds high-level mathematical reasoning through complex numbers, proof, mechanics, vectors and advanced integration.',
    keyPoints: ['Complex numbers have algebraic, geometric and polar forms.', 'Proof needs tight justification, not just examples.', 'Mechanics uses differential equations and vector reasoning.', 'Integration often needs substitution, parts or partial fractions.'],
    examMoves: ['Draw Argand diagrams for complex problems.', 'State domain and restrictions.', 'For mechanics, define positive direction and initial conditions.'],
    formulas: ['z = r(cosθ + i sinθ)', 'e^(iθ)=cosθ+i sinθ', '∫u dv = uv - ∫v du']
  },
  {
    subject: 'HSC English Advanced',
    title: 'Common Module: Texts and Human Experiences',
    keys: ['english advanced', 'common module', 'texts and human experiences', 'human experience', 'essay', 'thesis'],
    overview: 'The Common Module is about how texts represent individual and collective human experiences, emotions, anomalies, paradoxes and inconsistencies.',
    keyPoints: ['Strong responses connect human experience to composer choices.', 'A thesis must answer the question, not just name the text.', 'Analysis should explain how technique shapes meaning.', 'Examples need to be embedded smoothly.'],
    examMoves: ['Use the question wording in your thesis.', 'Do not technique-dump.', 'Link every paragraph back to human experience.']
  },
  {
    subject: 'HSC English Advanced',
    title: 'Modules A, B and C',
    keys: ['english advanced', 'module a', 'module b', 'module c', 'textual conversations', 'critical study', 'craft of writing'],
    overview: 'Advanced English modules focus on textual conversations, critical study of literature and deliberate writing craft.',
    keyPoints: ['Module A compares how texts converse across context, values and form.', 'Module B requires close critical appreciation of a text’s integrity.', 'Module C focuses on how writers make deliberate choices for purpose and effect.'],
    examMoves: ['For Module A, compare, do not write two separate mini essays.', 'For Module B, use close language analysis.', 'For Module C, imitate craft deliberately and reflect on choices.']
  },
  {
    subject: 'HSC Economics',
    title: 'Core Economics',
    keys: ['economics', 'eco', 'gdp', 'inflation', 'unemployment', 'exchange rate', 'balance of payments', 'fiscal policy', 'monetary policy', 'globalisation', 'trade'],
    overview: 'HSC Economics explains how households, firms, governments and global forces affect output, inflation, employment, trade and living standards.',
    keyPoints: ['GDP measures production and income in the economy.', 'Inflation is a sustained rise in the general price level.', 'Unemployment measures people willing and able to work but without a job.', 'Fiscal policy uses government spending and taxation.', 'Monetary policy uses interest rates and money conditions.'],
    examMoves: ['Use chains of cause and effect.', 'Include statistics or trends where possible.', 'Evaluate policy using goals, conflicts, time lags and distributional effects.'],
    formulas: ['GDP = C + I + G + (X - M)', 'Real interest rate = nominal interest rate - inflation rate']
  },
  {
    subject: 'HSC Software Engineering',
    title: 'Software Engineering project and technical concepts',
    keys: ['software engineering', '12sen', 'programming for the web', 'project management', 'data structures', 'algorithms', 'testing', 'html', 'css', 'javascript', 'python', 'flask', 'sqlite', 'database', 'agile'],
    overview: 'Software Engineering combines problem solving, programming, data handling, testing, project management and communication of design decisions.',
    keyPoints: ['Good projects define requirements before coding.', 'Data structures store information in a form suited to the task.', 'Testing should cover normal, boundary and invalid cases.', 'Databases need clear tables, keys and relationships.', 'Web apps separate structure, style, behaviour and storage.'],
    examMoves: ['Justify design choices using requirements.', 'Use diagrams for data flow or system structure.', 'Explain testing evidence rather than saying “it works”.', 'For projects, link sprint work to feedback and refinement.']
  }
];



const EXPANDED_DUX_AI_GUIDES: DuxAiGuide[] = [
  {
    subject: 'HSC Studies of Religion I',
    title: 'Religion and Belief Systems in Australia post-1945',
    keys: ['studies of religion', 'sor', 'sor1', 'religion and belief systems in australia', 'post-1945', 'aboriginal spiritualities', 'secularisation', 'multicultural', 'multifaith'],
    overview: 'This area explains how Australia’s religious landscape changed after 1945 through migration, secularisation, denominational switching, interfaith contact and the continuing importance of Aboriginal spiritualities.',
    keyPoints: ['Migration increased religious diversity after 1945.', 'Secularisation means religion has less public and institutional influence, but it does not erase belief.', 'Aboriginal spiritualities connect Country, Dreaming, kinship, law and identity.', 'Multiculturalism has shaped visible religious expression in Australia.', 'Census-style trends need careful cause-and-effect explanation.'],
    examMoves: ['Use precise trend language: increased, decreased, diversified, shifted.', 'Separate migration, secularisation and denominational switching.', 'For Aboriginal spiritualities, always link belief to Country and lived responsibility.']
  },
  {
    subject: 'HSC Studies of Religion I',
    title: 'Religious Tradition Depth Study',
    keys: ['religious tradition depth study', 'buddhism', 'christianity', 'hinduism', 'islam', 'judaism', 'significant person', 'ethics', 'practice', 'sacred texts'],
    overview: 'The depth study asks how one religious tradition expresses belief through significant people or schools, ethical teachings, sacred texts and significant practices.',
    keyPoints: ['Significant people or schools shape the tradition through teaching, reform or interpretation.', 'Ethical teachings guide adherents through sacred texts and authority.', 'Practices express belief through ritual, symbol, community and identity.', 'The best responses explain continuing impact on adherents.', 'Examples must be tradition-specific.'],
    examMoves: ['Do not retell a biography. Explain contribution and impact.', 'For ethics, link belief to action.', 'For practice, analyse symbol, ritual action and meaning.']
  },
  {
    subject: 'HSC Studies of Religion I',
    title: 'Religion and Peace',
    keys: ['religion and peace', 'inner peace', 'world peace', 'sacred texts peace', 'peace teaching'],
    overview: 'Religion and Peace explores how traditions understand inner peace and world peace, and how sacred texts and teachings move adherents toward peace-making.',
    keyPoints: ['Inner peace is personal spiritual harmony.', 'World peace involves justice, reconciliation and non-violence.', 'Sacred texts provide authority for peace teachings.', 'Many traditions connect personal transformation with social responsibility.'],
    examMoves: ['Name the tradition and the form of peace.', 'Use a teaching or text, then explain how it shapes action.', 'Avoid vague phrases like “religion teaches peace” without evidence.']
  },
  {
    subject: 'HSC Studies of Religion I',
    title: 'Religion and Non-Religion',
    keys: ['religion and non-religion', 'non religion', 'atheism', 'agnosticism', 'secular humanism', 'new age', 'spiritual but not religious'],
    overview: 'This area compares religious and non-religious worldviews, including how people form meaning, ethics and identity outside traditional religious institutions.',
    keyPoints: ['Atheism is absence of belief in God or gods.', 'Agnosticism holds that ultimate truth may be unknown or unknowable.', 'Secular humanism grounds ethics in reason, dignity and human wellbeing.', 'Personal spirituality can sit outside organised religion.', 'Comparison questions need source of authority, ethics and meaning.'],
    examMoves: ['Define the worldview before comparing it.', 'Do not claim non-religion means no morals.', 'Compare authority: sacred text and tradition versus reason, experience or human wellbeing.']
  },
  {
    subject: 'HSC Mathematics Advanced',
    title: 'Functions, Trigonometry, Calculus and Modelling',
    keys: ['maths advanced', 'mathematics advanced', 'advanced maths', 'functions', 'trigonometry', 'calculus', 'modelling', 'exponential', 'logarithm', 'statistics'],
    overview: 'Mathematics Advanced rewards clear method: identify the topic, write the rule, substitute carefully, then interpret the answer if the question is modelled in context.',
    keyPoints: ['Functions require domain, range and transformation awareness.', 'Trig questions often need all solutions in a set interval.', 'Calculus links gradient, rate of change, area and optimisation.', 'Exponential and log models need base and domain checks.', 'Statistics questions require context, not just numbers.'],
    examMoves: ['Write the rule before the calculation.', 'Check domains and intervals.', 'Explain the answer in words when the question has context.'],
    formulas: ['d/dx(x^n) = nx^(n-1)', '∫x^n dx = x^(n+1)/(n+1) + C', 'a · b = |a||b|cosθ']
  },
  {
    subject: 'HSC Mathematics Extension 1',
    title: 'Proof, Vectors, Trig, Calculus and Harder Applications',
    keys: ['extension 1', 'ext1', 'ext 1', 'mx1', 'mathematical induction', 'binomial theorem', 'vectors', 'scalar product', 'related rates', 'inverse trig'],
    overview: 'Extension 1 questions usually test method selection and proof quality. The marks sit in setup, restrictions, reasoning and clean algebra.',
    keyPoints: ['Induction needs base case, assumption, inductive step and conclusion.', 'The binomial theorem uses the general term to target coefficients.', 'Scalar product handles angle, perpendicularity and projection.', 'Related rates need a relationship before differentiating with respect to time.', 'Harder trig often needs identities and interval control.'],
    examMoves: ['Do not skip the proof conclusion.', 'For vectors, define what each vector represents.', 'For rates, avoid substituting variable values too early.'],
    formulas: ['(a+b)^n = Σ nCr a^(n-r)b^r', 'a · b = |a||b|cosθ']
  },
  {
    subject: 'HSC Mathematics Extension 2',
    title: 'Complex Numbers, Integration, Vectors, Proof and Mechanics',
    keys: ['extension 2', 'ext2', 'ext 2', 'mx2', 'complex numbers', 'de moivre', 'harder integration', 'mechanics', '3d vectors', 'proof'],
    overview: 'Extension 2 rewards control under pressure: set the structure first, use exact notation, and keep diagrams or definitions close to the algebra.',
    keyPoints: ['Complex numbers can be written algebraically, geometrically or in polar form.', 'de Moivre’s theorem handles powers and roots cleanly.', 'Harder integration depends on choosing the right technique.', '3D vectors require clear position and direction definitions.', 'Mechanics starts with a force diagram and direction convention.'],
    examMoves: ['State argument ranges in complex questions.', 'For roots, include all solutions.', 'For mechanics, draw forces before equations.'],
    formulas: ['z = r(cosθ + i sinθ)', '(r cis θ)^n = r^n cis(nθ)', 'F = ma']
  },
  {
    subject: 'HSC English Advanced',
    title: 'Common Module, Module A, Module B and Module C',
    keys: ['english advanced', 'advanced english', 'common module', 'texts and human experiences', 'module a', 'textual conversations', 'module b', 'critical study', 'module c', 'craft of writing', 'essay'],
    overview: 'English Advanced is not a memory dump. It is argument, evidence and control. The strongest responses explain how language, form and structure create meaning for the question.',
    keyPoints: ['Common Module focuses on individual and collective human experiences.', 'Module A compares how texts speak to each other across context.', 'Module B needs a strong judgement about textual value and construction.', 'Module C rewards deliberate craft choices and reflection.', 'Quotes must be short enough to analyse tightly.'],
    examMoves: ['Answer the question in every topic sentence.', 'Technique must lead to effect, not sit there like a label.', 'Use form and structure, not only word-level techniques.']
  }
];

const OFFLINE_DUX_AI_GUIDES: DuxAiGuide[] = [
  {
    subject: 'HSC Chemistry',
    title: 'Offline HSC Chemistry exam coach',
    keys: ['chemistry past paper', 'chemistry trial', 'chemistry exam', 'chemistry practice', 'chemistry offline', 'thsc chemistry', 'science ready chemistry', 'hsc chem questions'],
    overview: 'This offline guide builds original Chemistry practice from the same recurring HSC skills: equilibrium reasoning, acid-base calculations, organic pathways, spectroscopy and validity of analytical methods.',
    keyPoints: [
      'Equilibrium responses need the disturbance, the system response and the observable or yield effect.',
      'Acid-base questions often reward balanced equations, mole ratios, pH logic and indicator justification.',
      'Organic pathway questions reward functional group changes, reagents, conditions and structural evidence.',
      'Analysis questions reward using several data sources together and evaluating validity, reliability and accuracy.'
    ],
    examMoves: [
      'For 3-4 mark explain questions, write a cause-and-effect chain rather than isolated facts.',
      'For calculations, start with the balanced equation and keep volumes in litres.',
      'For spectroscopy, make each data point rule something in or out.'
    ],
    formulas: ['pH = -log[H+]', 'Ksp from balanced dissolution equation', 'K = products/reactants at equilibrium']
  },
  {
    subject: 'HSC Physics',
    title: 'Offline HSC Physics exam coach',
    keys: ['physics past paper', 'physics trial', 'physics exam', 'physics practice', 'physics offline', 'thsc physics', 'science ready physics', 'hsc physics questions'],
    overview: 'This offline guide creates Physics help around the common HSC pattern: model the situation, choose the law, use units, then connect the result back to the physical effect.',
    keyPoints: [
      'Mechanics questions often hide radius, direction or net-force assumptions.',
      'Electromagnetism questions reward correct field/force direction and energy reasoning through Lenz’s law.',
      'Light questions ask for evidence behind models, not only formulas.',
      'Universe-to-atom questions reward linking observations to models such as spectra, redshift, nuclear stability and quantisation.'
    ],
    examMoves: [
      'Draw the force, field, ray or energy diagram before calculating.',
      'Name the real force providing centripetal acceleration.',
      'For induction, state the change in flux before the induced opposition.'
    ],
    formulas: ['F = mv^2/r', 'F = BIL sinθ', 'emf = -NΔΦ/Δt', 'E = hf', 'E = mc^2']
  },
  {
    subject: 'HSC Mathematics',
    title: 'Offline HSC Maths exam coach',
    keys: ['maths past paper', 'mathematics past paper', 'maths trial', 'maths exam', 'maths practice', 'extension 1 practice', 'extension 2 practice'],
    overview: 'This offline guide focuses on method selection and communication: identify the topic, set up clearly, show the rule, then finish with the requested form.',
    keyPoints: [
      'Later HSC items often require deciding the method with less scaffolding.',
      'Function and inverse questions need domains and restrictions.',
      'Calculus questions reward setup, derivative/integral work, testing and interpretation.',
      'Proof and vectors reward clear definitions before algebra.'
    ],
    examMoves: [
      'Write the rule or theorem before substituting.',
      'Use diagrams for vectors and geometry.',
      'For optimisation, define variables and constraints before differentiating.'
    ],
    formulas: ['d/dx(x^n) = nx^(n-1)', '∫u dv = uv - ∫v du', 'a · b = |a||b|cosθ']
  }
];

const DUX_AI_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'what', 'when', 'where', 'why', 'how', 'can', 'you', 'please', 'explain', 'tell', 'about', 'help', 'hsc', 'module', 'study', 'notes', 'question', 'answer'
]);

function scoreDuxAiGuide(guide: DuxAiGuide, prompt: string) {
  const cleanPrompt = normaliseSearchText(prompt)
    .replace(/\bext\s*1\b/g, 'extension 1')
    .replace(/\bext\s*2\b/g, 'extension 2')
    .replace(/\bmx1\b/g, 'extension 1')
    .replace(/\bmx2\b/g, 'extension 2')
    .replace(/\bmod\s*(\d)\b/g, 'module $1');
  const haystack = normaliseSearchText([guide.subject, guide.title, guide.overview, ...guide.keys, ...guide.keyPoints, ...guide.examMoves, ...(guide.formulas || [])].join(' '));
  let score = 0;

  for (const key of guide.keys) {
    const cleanKey = normaliseSearchText(key);
    if (cleanKey && cleanPrompt.includes(cleanKey)) score += cleanKey.length > 12 ? 24 : cleanKey.length > 7 ? 14 : 8;
  }

  const modules = promptModuleNumbers(cleanPrompt);
  modules.forEach((moduleNumber) => {
    if (haystack.includes(`module ${moduleNumber}`)) score += 30;
  });

  const subjectPairs: Array<[string, string[]]> = [
    ['chemistry', ['chemistry', 'chem']],
    ['physics', ['physics', 'phys']],
    ['mathematics advanced', ['maths advanced', 'mathematics advanced', 'advanced maths']],
    ['extension 1', ['extension 1', 'ext 1', 'mx1']],
    ['extension 2', ['extension 2', 'ext 2', 'mx2']],
    ['english advanced', ['english advanced', 'advanced english']],
    ['economics', ['economics', 'eco']],
    ['software engineering', ['software engineering', 'software', '12sen', 'programming']],
    ['studies of religion', ['studies of religion', 'sor', 'sor1', 'religion']],
    ['religion and peace', ['religion and peace', 'inner peace', 'world peace']],
    ['religion and non-religion', ['religion and non-religion', 'non religion', 'atheism', 'agnosticism']]
  ];
  for (const [needle, variants] of subjectPairs) {
    if (variants.some((variant) => cleanPrompt.includes(variant)) && haystack.includes(needle)) score += 18;
  }

  for (const word of cleanPrompt.split(' ')) {
    if (word.length > 3 && !DUX_AI_STOPWORDS.has(word) && haystack.includes(word)) score += 3;
  }
  return score;
}

function getDuxAiGuideMatches(prompt: string, limit = 3) {
  return [...DUX_AI_GUIDES, ...EXPANDED_DUX_AI_GUIDES, ...OFFLINE_DUX_AI_GUIDES]
    .map((guide, index) => ({ guide, index, score: scoreDuxAiGuide(guide, prompt) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit);
}

function getDuxAiBankMatches(prompt: string, limit = 6) {
  return FLASHCARD_KNOWLEDGE_BANK
    .map((entry, index) => ({ entry, index, score: scoreFlashcardBankEntry(entry, prompt) }))
    .filter((item) => item.score >= 10)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit);
}

function formatDuxAiGuideAnswer(matches: Array<{ guide: DuxAiGuide; score: number }>, bankMatches: Array<{ entry: FlashcardBankEntry; score: number }>) {
  const main = matches[0]?.guide;
  if (!main) return '';
  const lines: string[] = [];
  lines.push(`${main.subject} - ${main.title}`);
  lines.push('');
  lines.push(main.overview);
  lines.push('');
  lines.push('Key points:');
  main.keyPoints.slice(0, 5).forEach((point, index) => lines.push(`${index + 1}. ${point}`));
  if (main.formulas?.length) {
    lines.push('');
    lines.push('Useful formulas:');
    main.formulas.slice(0, 4).forEach((formula) => lines.push(`- ${formula}`));
  }
  lines.push('');
  lines.push('Exam move:');
  main.examMoves.slice(0, 3).forEach((move) => lines.push(`- ${move}`));

  const usefulCards = bankMatches.filter((match) => match.score >= Math.max(12, bankMatches[0]?.score * 0.45));
  if (usefulCards.length) {
    lines.push('');
    lines.push('Quick recall:');
    usefulCards.slice(0, 4).forEach((match) => lines.push(`- ${match.entry.front} ${match.entry.back}`));
  }

  if (matches.length > 1) {
    lines.push('');
    lines.push(`Related areas: ${matches.slice(1).map((match) => match.guide.title).join(', ')}.`);
  }
  return lines.join('\n');
}

function buildTargetedBankAnswer(bankMatches: Array<{ entry: FlashcardBankEntry; score: number }>) {
  if (!bankMatches.length) return '';
  const topScore = bankMatches[0].score;
  const selected = bankMatches.filter((match) => match.score >= Math.max(14, topScore * 0.5)).slice(0, 5);
  if (!selected.length) return '';
  const subject = selected[0].entry.subject;
  const topic = selected[0].entry.topic;
  const lines = [`${subject} - ${topic}`, ''];
  selected.forEach((match, index) => {
    lines.push(`${index + 1}. ${match.entry.front}`);
    lines.push(`   ${match.entry.back}`);
  });
  lines.push('');
  lines.push('Exam tip: turn each point into a one-line definition, then add one example or equation so the answer does not feel generic.');
  return lines.join('\n');
}

function buildOfflineHscPracticeSet(question: string, guideMatches: Array<{ guide: DuxAiGuide; score: number }>, bankMatches: Array<{ entry: FlashcardBankEntry; score: number }>) {
  if (!/\b(past paper|trial|practice|exam style|exam-style|questions?|quiz|drill|test me)\b/i.test(question)) return '';
  const guide = guideMatches[0]?.guide;
  const bank = bankMatches.slice(0, 6);
  if (!guide && !bank.length) return '';

  const subject = guide?.subject || bank[0]?.entry.subject || 'HSC';
  const title = guide?.title || bank[0]?.entry.topic || 'practice';
  const lines = [`${subject} - offline HSC-style practice`, ''];
  lines.push(`I cannot pull live papers offline, so this creates original questions from the built-in syllabus and exam-pattern bank for ${title}.`);
  lines.push('');
  lines.push('Practice set:');

  if (bank.length) {
    bank.forEach((match, index) => {
      const markValue = index % 3 === 0 ? 4 : index % 3 === 1 ? 3 : 2;
      lines.push(`${index + 1}. (${markValue} marks) ${match.entry.front}`);
      lines.push(`   Marking focus: ${match.entry.back}`);
    });
  } else if (guide) {
    guide.keyPoints.slice(0, 5).forEach((point, index) => {
      const command = index % 2 === 0 ? 'Explain' : 'Analyse';
      lines.push(`${index + 1}. (3 marks) ${command} this idea in a HSC response: ${point}`);
      lines.push(`   Marking focus: define the concept, connect the cause/effect, and use one precise example or formula.`);
    });
  }

  lines.push('');
  lines.push('How to mark yourself:');
  lines.push('1. Circle the command word and underline the syllabus idea.');
  lines.push('2. Give one mark to each clear, correct point that directly answers the question.');
  lines.push('3. Do not reward vague memory dumps. Use the stimulus, equation, diagram, data or example.');
  lines.push('4. Rewrite the weakest answer in half the words with twice the precision.');
  return lines.join('\n');
}

function readAiChatMemory(): ChatMessage[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(AI_CHAT_MEMORY_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((message): message is ChatMessage => (
        Boolean(message) &&
        typeof message.id === 'string' &&
        (message.role === 'user' || message.role === 'assistant') &&
        typeof message.text === 'string'
      ))
      .slice(-AI_CHAT_MEMORY_LIMIT);
  } catch {
    return [];
  }
}

function getDuxAiEndpoint() {
  const configured = import.meta.env.VITE_DUX_AI_API_URL?.trim();
  return configured || '/api/dux-ai';
}

async function requestDuxAiAnswer(messages: ChatMessage[], context: Record<string, unknown>): Promise<string> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(getDuxAiEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: messages.slice(-AI_CHAT_MEMORY_LIMIT).map((message) => ({
          role: message.role,
          text: message.text
        })),
        context
      }),
      signal: controller.signal
    });

    let data: { answer?: string; error?: string } = {};
    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok || !data.answer) {
      throw new Error(data.error || `Dux AI request failed with status ${response.status}`);
    }

    return data.answer.trim();
  } finally {
    window.clearTimeout(timeout);
  }
}


type DuxStudyScheduleResponse = {
  items?: AiScheduleItem[];
  summary?: string;
  error?: string;
};

type DuxFlashcardResponse = {
  cards?: Array<{ front: string; back: string }>;
  warning?: string;
  error?: string;
};

async function requestDuxStudySchedule(payload: {
  prompt: string;
  startDate: string;
  endDate: string;
  subjects: string[];
  windows: StudyAvailabilityWindow[];
  sessionMinutes: number;
  breakMinutes: number;
}): Promise<DuxStudyScheduleResponse> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 35000);
  try {
    const response = await fetch(getDuxAiEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task: 'study-schedule', ...payload }),
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || 'Study schedule generator failed.');
    return data as DuxStudyScheduleResponse;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function requestDuxFlashcards(payload: {
  prompt: string;
  deck: string;
  count: number;
}): Promise<DuxFlashcardResponse> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 35000);
  try {
    const response = await fetch(getDuxAiEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task: 'flashcards', ...payload }),
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || 'Flashcard generator failed.');
    return data as DuxFlashcardResponse;
  } finally {
    window.clearTimeout(timeout);
  }
}


function tidyAiMathText(value: string) {
  const stripLatexWrapper = (raw: string) => raw
    .replace(/\$\$([\s\S]*?)\$\$/g, '$1')
    .replace(/\$([^$\n]+?)\$/g, '$1')
    .replace(/\\\((.*?)\\\)/g, '$1')
    .replace(/\\\[([\s\S]*?)\\\]/g, '$1');

  const unwrapLatexGroups = (raw: string) => {
    let output = raw
      .replace(/\\hat\{\\mathbf\{([^{}]+)\}\}/g, '$1̂')
      .replace(/\\vec\{\\mathbf\{([^{}]+)\}\}/g, '$1⃗')
      .replace(/\\hat\{([^{}]+)\}/g, '$1̂')
      .replace(/\\vec\{([^{}]+)\}/g, '$1⃗');
    for (let i = 0; i < 4; i += 1) {
      output = output
        .replace(/\\(?:mathbf|mathrm|mathit|textbf|boldsymbol|vec|hat|overline)\{([^{}]+)\}/g, '$1')
        .replace(/\\text\{([^{}]+)\}/g, '$1')
        .replace(/\\left|\\right/g, '')
        .replace(/\\,/g, ' ');
    }
    return output;
  };

  const convertPowers = (raw: string) => raw
    .replace(/\^\{2\}/g, '²')
    .replace(/\^\{3\}/g, '³')
    .replace(/\^2\b/g, '²')
    .replace(/\^3\b/g, '³');

  return convertPowers(unwrapLatexGroups(stripLatexWrapper(value)))
    .replace(/\\int/g, '∫')
    .replace(/\\sum/g, 'Σ')
    .replace(/\\times|\\cdot/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\leq?/g, '≤')
    .replace(/\\geq?/g, '≥')
    .replace(/\\neq/g, '≠')
    .replace(/\\approx/g, '≈')
    .replace(/\\pm/g, '±')
    .replace(/\\pi/g, 'π')
    .replace(/\\theta/g, 'θ')
    .replace(/\\alpha/g, 'α')
    .replace(/\\beta/g, 'β')
    .replace(/\\gamma/g, 'γ')
    .replace(/\\Delta/g, 'Δ')
    .replace(/\\delta/g, 'δ')
    .replace(/\\sqrt\{([^{}]+)\}/g, '√($1)')
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
    .replace(/\\[a-zA-Z]+/g, '')
    .replace(/[{}]/g, '')
    .replace(/\+-/g, '±')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function renderInlineAiText(raw: string, keyPrefix: string): ReactNode[] {
  const text = tidyAiMathText(raw);
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let partIndex = 0;

  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined) continue;
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith('**')) {
      nodes.push(<strong key={`${keyPrefix}-b-${partIndex}`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`')) {
      nodes.push(<code key={`${keyPrefix}-c-${partIndex}`}>{token.slice(1, -1)}</code>);
    }
    partIndex += 1;
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function AiMessageText({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const rendered: ReactNode[] = [];

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) {
      rendered.push(<div key={`gap-${index}`} className="ai-message-gap" />);
      return;
    }

    const heading = line.match(/^#{1,4}\s+(.+)$/);
    if (heading) {
      rendered.push(<div key={`heading-${index}`} className="ai-message-heading">{renderInlineAiText(heading[1], `heading-${index}`)}</div>);
      return;
    }

    const numbered = line.match(/^(\d+)\.\s+(.+)$/);
    if (numbered) {
      rendered.push(
        <div key={`number-${index}`} className="ai-message-list-row numbered">
          <span>{numbered[1]}.</span>
          <p>{renderInlineAiText(numbered[2], `number-${index}`)}</p>
        </div>
      );
      return;
    }

    const bullet = line.match(/^(?:[-•*])\s+(.+)$/);
    if (bullet) {
      rendered.push(
        <div key={`bullet-${index}`} className="ai-message-list-row">
          <span>•</span>
          <p>{renderInlineAiText(bullet[1], `bullet-${index}`)}</p>
        </div>
      );
      return;
    }

    rendered.push(<p key={`p-${index}`}>{renderInlineAiText(line, `p-${index}`)}</p>);
  });

  return <div className="ai-message-text">{rendered}</div>;
}


function looksLikeGreetingOnly(question: string) {
  return /^(hi|hii|hey|hello|yo|sup|what'?s up|how are you|how r u|how are u|how you going|how's it going|good morning|good afternoon|good evening|gday|g'day)[!.?\s]*$/i.test(question.trim());
}

function buildStudyCompanionFallback(question: string) {
  const clean = question.trim();
  const inferred = inferHscSubject(clean);
  const lines = [
    inferred ? `${inferred}: I can work with this.` : 'I can work with this.',
    '',
    `Your prompt: “${clean.slice(0, 180)}${clean.length > 180 ? '...' : ''}”`,
    '',
    'Best next move:',
    '1. If this is a question, send the exact wording and I’ll break it into marks.',
    '2. If this is your answer, say “mark this” and I’ll check what is strong, weak and missing.',
    '3. If this is a topic, ask “explain”, “quiz me”, or “make this Band 6”.',
    '',
    'I will not just say I cannot understand. I’ll either answer directly or give you the exact missing piece.'
  ];
  return lines.join('\n');
}


type DuxKnowledgeSnippet = {
  title: string;
  keys: string[];
  answer: string;
  hscLink?: string;
};

const DUX_GENERAL_KNOWLEDGE: DuxKnowledgeSnippet[] = [
  {
    title: 'GeoGuessr',
    keys: ['geoguessr', 'geo guesser', 'geo guessr'],
    answer: 'GeoGuessr is a geography game where you are dropped into a random Google Street View location and you guess where you are on a map. Good players read clues like road signs, lane markings, vegetation, car plates, driving side, architecture, language, sun position and landscape. The closer your guess is to the real location, the more points you score.',
    hscLink: 'Study move: it is basically evidence-based reasoning. You collect clues, test possible locations, then make the best supported judgement.'
  },
  {
    title: 'Vector magnitude',
    keys: ['magnitude of a vector', 'vector magnitude', 'magnitude vector', 'length of a vector', 'modulus of a vector'],
    answer: 'The magnitude of a vector is its length. For a 2D vector with horizontal component x and vertical component y, square both components, add them, then square root the result: |v| = √(x² + y²). For a 3D vector, use |v| = √(x² + y² + z²).',
    hscLink: 'Exam move: magnitude has no direction. Keep the vector direction separate from the vector length.'
  },
  {
    title: 'Scalar product',
    keys: ['scalar product', 'dot product', 'a dot b'],
    answer: 'The scalar product, also called the dot product, takes two vectors and returns a number. You can calculate it with components, a · b = x1x2 + y1y2, or with angle, a · b = |a||b|cosθ. It is useful for finding angles, checking perpendicular vectors and finding projections.',
    hscLink: 'Exam move: if a · b = 0, the vectors are perpendicular, as long as neither vector is the zero vector.'
  },
  {
    title: 'Derivative',
    keys: ['derivative', 'differentiate', 'differentiation', 'gradient function'],
    answer: 'A derivative tells you the instantaneous rate of change of a function. In graph terms, it gives the gradient of the tangent at a point. For y = x², the derivative is 2x, meaning the gradient changes as x changes.',
    hscLink: 'HSC move: link derivatives to gradient, velocity, rate of change, increasing/decreasing intervals and turning points.'
  },
  {
    title: 'Integral',
    keys: ['integral', 'integrate', 'integration', 'antiderivative', 'primitive'],
    answer: 'An integral reverses differentiation. An indefinite integral gives a family of functions, so you add + C. A definite integral gives accumulated area or total change over an interval.',
    hscLink: 'HSC move: for ∫xⁿ dx, increase the power by 1, divide by the new power, then add + C when there are no limits.'
  },
  {
    title: 'Equilibrium',
    keys: ['equilibrium', 'le chatelier', 'le chatelier principle', 'keq'],
    answer: 'Chemical equilibrium is when the forward and reverse reactions keep happening at the same rate, so the concentrations stay constant. Le Chatelier’s principle says that if a system at equilibrium is disturbed, it shifts to reduce the disturbance.',
    hscLink: 'HSC move: always write the change, the shift, and the effect on yield or concentration.'
  },
  {
    title: 'pH',
    keys: ['ph', 'poh', 'hydrogen ion concentration'],
    answer: 'pH measures hydrogen ion concentration. Lower pH means higher H+ concentration and a more acidic solution. The key formula is pH = -log10[H+], and [H+] = 10^-pH.',
    hscLink: 'Exam move: check whether concentration is in mol L^-1 and whether the acid is strong or weak before calculating.'
  },
  {
    title: 'Photoelectric effect',
    keys: ['photoelectric effect', 'threshold frequency', 'work function'],
    answer: 'The photoelectric effect happens when light hits a metal and ejects electrons. It supports the particle model of light because electrons are only emitted when each photon has enough energy. Increasing intensity increases the number of emitted electrons only if the frequency is above the threshold.',
    hscLink: 'HSC move: frequency controls electron energy; intensity controls electron count after the threshold is met.'
  },
  {
    title: 'Human experiences',
    keys: ['human experiences', 'common module', 'texts and human experiences'],
    answer: 'Human experiences are the shared and individual parts of being human, like memory, loss, ambition, fear, connection, conflict and change. In English Advanced, you are not just naming an experience. You explain how the composer uses language, form and structure to represent it.',
    hscLink: 'Band 6 move: make a judgement about what the text reveals about people, not just what happens in the plot.'
  },
  {
    title: 'Studies of Religion',
    keys: ['studies of religion', 'sor', 'religion and peace', 'religious tradition'],
    answer: 'Studies of Religion looks at how religious beliefs, practices, ethics and sacred texts shape adherents and communities. Strong answers name the tradition, define the belief or practice, then explain its effect on adherents.',
    hscLink: 'Exam move: use specific examples. Vague lines like “religion helps people” are too weak.'
  }
];

function buildKnownTopicResponse(question: string): string {
  const q = normaliseSearchText(question);
  const hit = DUX_GENERAL_KNOWLEDGE.find((item) => item.keys.some((key) => q.includes(normaliseSearchText(key))));
  if (!hit) return '';
  const wantsRunThrough = /\b(explain|run through|rundown|teach|summary|summarise|what is|what are|how does|how do|why)\b/i.test(question);
  if (!wantsRunThrough && q.split(' ').length > 12) return '';
  return [
    hit.title,
    '',
    hit.answer,
    '',
    hit.hscLink || 'Study move: define the idea, show how it works, then apply it to the question.',
    '',
    'Quick check: can you explain it in one sentence without looking at your notes? If not, turn it into a flashcard.'
  ].join('\n');
}

function buildVectorMagnitudeResponse(question: string): string {
  const q = normaliseSearchText(question);
  if (!/\b(vector|magnitude|modulus|length)\b/.test(q)) return '';
  const tuple = q.match(/\(?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)(?:\s*,\s*(-?\d+(?:\.\d+)?))?\s*\)?/);
  if (tuple && /\b(vector|magnitude|modulus|length)\b/.test(q)) {
    const values = [Number(tuple[1]), Number(tuple[2]), tuple[3] !== undefined ? Number(tuple[3]) : null].filter((value): value is number => value !== null && Number.isFinite(value));
    const sumSquares = values.reduce((sum, value) => sum + value * value, 0);
    const working = values.map((value) => `${formatNumber(value)}²`).join(' + ');
    return `Vector magnitude\n\nFor vector (${values.map(formatNumber).join(', ')}):\n|v| = √(${working})\n|v| = √${formatNumber(sumSquares)}\n\nAnswer: **${formatNumber(Math.sqrt(sumSquares))}**.\n\nMeaning: this is the vector's length. It does not include direction.`;
  }
  if (q.includes('magnitude') && q.includes('vector')) {
    return buildKnownTopicResponse('magnitude of a vector');
  }
  return '';
}

function buildSimpleIntegralResponse(question: string): string {
  const q = normaliseSearchText(question).replace(/\s+/g, ' ');
  if (!/\b(integral|integrate|antiderivative|primitive)\b/.test(q)) return '';
  if (/\b(of\s+)?x\b/.test(q) && !/x\^|x\d/.test(q)) {
    return 'Integral of x\n\nUse the reverse power rule. Think of x as x¹.\n\n∫x dx = x²/2 + C\n\nWhy: when you differentiate x²/2, you get x. The + C is needed because constants disappear when differentiating.';
  }
  if (/\b(of\s+)?1\b/.test(q)) return 'Integral of 1\n\n∫1 dx = x + C.\n\nWhy: the derivative of x is 1.';
  if (/\b(sin\s*x|sinx)\b/.test(q)) return 'Integral of sin x\n\n∫sin x dx = -cos x + C.\n\nWhy: the derivative of -cos x is sin x.';
  if (/\b(cos\s*x|cosx)\b/.test(q)) return 'Integral of cos x\n\n∫cos x dx = sin x + C.\n\nWhy: the derivative of sin x is cos x.';
  return '';
}

function buildSimpleDerivativeResponse(question: string): string {
  const q = normaliseSearchText(question).replace(/\s+/g, ' ');
  if (!/\b(derivative|differentiate|differentiation|d\/dx)\b/.test(q)) return '';
  if (/\b(of\s+)?x\b/.test(q) && !/x\^|x\d/.test(q)) return 'Derivative of x\n\nd/dx(x) = 1.\n\nWhy: y = x is a straight line with gradient 1 everywhere.';
  if (/\b(sin\s*x|sinx)\b/.test(q)) return 'Derivative of sin x\n\nd/dx(sin x) = cos x.';
  if (/\b(cos\s*x|cosx)\b/.test(q)) return 'Derivative of cos x\n\nd/dx(cos x) = -sin x.';
  return '';
}

function buildMiniRunThrough(question: string, guideMatches: Array<{ guide: DuxAiGuide; score: number }>, bankMatches: Array<{ entry: FlashcardBankEntry; score: number }>): string {
  const wants = /\b(explain|run through|rundown|teach me|teach|summary|summarise|mini|overview|what is|what are|how does|how do)\b/i.test(question);
  if (!wants) return '';
  const guide = guideMatches[0]?.guide;
  if (!guide || guideMatches[0].score < 8) return '';
  const lines = [`${guide.subject} - ${guide.title}`, '', guide.overview, '', 'Mini run-through:'];
  guide.keyPoints.slice(0, 5).forEach((point, index) => lines.push(`${index + 1}. ${point}`));
  if (guide.formulas?.length) {
    lines.push('', 'Useful formulas:');
    guide.formulas.slice(0, 4).forEach((formula) => lines.push(`- ${formula}`));
  }
  const recall = bankMatches.slice(0, 3);
  if (recall.length) {
    lines.push('', 'Quick examples to remember:');
    recall.forEach((match) => lines.push(`- ${match.entry.front} ${match.entry.back}`));
  }
  lines.push('', 'How to answer it in an exam:', 'Define the idea, show the mechanism or formula, then apply it to the exact wording of the question.');
  return lines.join('\n');
}

function buildGeneralQuestionFallback(question: string): string {
  const clean = question.trim();
  const q = normaliseSearchText(clean);
  const whatIs = clean.match(/^(?:what is|what are|who is|who are|define|explain)\s+(.+?)\??$/i);
  if (whatIs) {
    const term = whatIs[1].trim().replace(/[?.!]+$/, '');
    return [
      `${term}`,
      '',
      `I do not have live internet inside this local helper, but I can still help you work with the idea. A good answer should do three things:`,
      '',
      `1. Define **${term}** in one clean sentence.`,
      '2. Explain how it works or why it matters.',
      '3. Give one example so it is not just a vague definition.',
      '',
      `Send one more line of context, like “${term} in Chemistry” or “${term} for HSC English”, and I’ll make the answer much sharper.`
    ].join('\n');
  }
  if (/\b(can you answer|answer this|solve this|help with this)\b/.test(q)) {
    return 'Yes. Paste the exact question and any working you have. I’ll give you the answer, the steps, and the marks-style explanation.';
  }
  return '';
}

function inferHscSubject(text: string): string {
  const q = normaliseSearchText(text);
  const tests: Array<[string, string[]]> = [
    ['HSC Chemistry', ['chemistry', 'equilibrium', 'acid', 'base', 'titration', 'organic', 'ester', 'polymer', 'redox', 'mole', 'le chatelier', 'spectroscopy', 'nmr', 'aas']],
    ['HSC Physics', ['physics', 'projectile', 'motor', 'generator', 'induction', 'field', 'magnetic', 'electric', 'quantum', 'relativity', 'photoelectric', 'spectra', 'wave', 'doppler']],
    ['Maths Advanced', ['maths advanced', 'calculus', 'differentiate', 'integrate', 'trigonometry', 'probability', 'normal distribution', 'functions', 'rates of change']],
    ['Maths Extension 1', ['extension 1', 'ext1', 'mx1', 'vectors', 'scalar product', 'parametric', 'proof', 'induction', 'binomial', 'projectile motion']],
    ['Maths Extension 2', ['extension 2', 'ext2', 'mx2', 'complex numbers', 'integration by parts', 'mechanics', 'polynomial', 'conics', 'harder integration']],
    ['English Advanced', ['english', 'essay', 'thesis', 'quote', 'technique', 'module a', 'module b', 'module c', 'human experiences', 'eliot', 'prufrock']],
    ['Studies of Religion I', ['studies of religion', 'sor', 'sor1', 'religion and peace', 'islam', 'christianity', 'judaism', 'buddhism', 'hinduism', 'ethics', 'beliefs', 'adherents']]
  ];
  const hit = tests.find(([, keys]) => keys.some((key) => q.includes(key)));
  return hit?.[0] || '';
}

function commandContent(question: string): string {
  return question
    .replace(/\b(mark this|check my answer|check this|is this right|feedback|grade this|can you mark|please mark|rate this)\b[:\s-]*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildMarkingFeedback(question: string): string {
  const answer = commandContent(question);
  const subject = inferHscSubject(answer || question) || 'HSC response';
  const wordCount = answer.split(/\s+/).filter(Boolean).length;
  const hasEvidence = /["“”']|\bquote\b|\bevidence\b|\bequation\b|=|therefore|because|as a result|for example/i.test(answer);
  const hasStructure = /first|second|therefore|however|because|this shows|as a result|hence|thus/i.test(answer);
  const hasQuestionLink = /question|module|marks|assess|evaluate|explain|compare|analyse|impact|effect/i.test(answer);

  const strengths: string[] = [];
  const fixes: string[] = [];
  if (wordCount >= 80) strengths.push('There is enough writing here to judge structure, not just a single loose sentence.');
  if (hasEvidence) strengths.push('You have at least one sign of evidence, a quote, equation or example. That gives the marker something concrete.');
  if (hasStructure) strengths.push('The answer has some cause-and-effect language, so it does not read like random notes.');
  if (!hasEvidence) fixes.push('Add one precise piece of evidence: quote, equation, data point, named example, diagram feature or calculation step.');
  if (!hasStructure) fixes.push('Make the logic clearer. Use “because”, “therefore” and “this means” so the marker can follow the chain.');
  if (!hasQuestionLink) fixes.push('Link back to the exact wording of the question. Do not let the paragraph drift sideways.');
  if (wordCount < 45) fixes.push('This is too short to earn high marks unless it is a one-mark definition. Add explanation and an example.');

  const subjectAdvice = subject.includes('English')
    ? ['English fix: topic sentence must answer the question, then quote, technique, effect, and link. Technique without effect is dead weight.', 'Band 6 move: make a judgement about the text, not just a statement about a character or theme.']
    : subject.includes('Chemistry')
      ? ['Chemistry fix: include the relevant equation or species, then connect observation to particle-level explanation.', 'Band 6 move: mention conditions, assumptions and validity when the question asks about experiments.']
      : subject.includes('Physics')
        ? ['Physics fix: state the model or law first, then substitute values with units, then explain the physical meaning.', 'Band 6 move: connect the equation to the situation, not just the numbers.']
        : subject.includes('Maths')
          ? ['Maths fix: show the rule before the calculation. A correct answer with messy working is fragile.', 'Band 6 move: define variables, domain, units and final conclusion where relevant.']
          : subject.includes('Religion')
            ? ['SOR fix: name the tradition, belief or ethical teaching, then explain its effect on adherents.', 'Band 6 move: use specific examples, not vague “religion helps people” language.']
            : ['General fix: define the idea, explain the mechanism, then apply it to the question.', 'Band 6 move: use one precise example and one clear judgement.'];

  return [
    `${subject} marking check`,
    '',
    `Rough strength: ${wordCount >= 80 && hasEvidence && hasStructure ? 'strong base, now tighten it' : wordCount >= 45 ? 'middle range, needs sharper evidence and links' : 'too thin right now'}.`,
    '',
    'What works:',
    ...(strengths.length ? strengths : ['The answer has a starting point, but it needs more visible evidence and structure before it feels exam-ready.']).map((item) => `- ${item}`),
    '',
    'What to fix:',
    ...fixes.map((item) => `- ${item}`),
    ...subjectAdvice.map((item) => `- ${item}`),
    '',
    'Cleaner structure:',
    '1. Direct answer to the question.',
    '2. Evidence or calculation.',
    '3. Explanation of how/why it proves the point.',
    '4. Final link back to the command word.'
  ].join('\n');
}

function trySimpleCalculation(question: string): string {
  const cleaned = question
    .toLowerCase()
    .replace(/calculate|what is|work out|solve|=/g, ' ')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/\^/g, '**')
    .trim();
  const expressionMatch = cleaned.match(/[0-9+\-*/().\s*]{3,}/);
  if (!expressionMatch) return '';
  const expression = expressionMatch[0].trim();
  if (!expression || !/^[0-9+\-*/().\s]+$/.test(expression)) return '';
  if (!/[+\-*/]/.test(expression)) return '';
  try {
    const value = Function(`"use strict"; return (${expression});`)();
    if (typeof value !== 'number' || !Number.isFinite(value)) return '';
    return `Calculation:\n${expression.replace(/\*\*/g, '^')} = **${formatNumber(value)}**`;
  } catch {
    return '';
  }
}

function buildExamCommandResponse(question: string, guideMatches: Array<{ guide: DuxAiGuide; score: number }>, bankMatches: Array<{ entry: FlashcardBankEntry; score: number }>) {
  const q = question.toLowerCase();
  const command = q.includes('evaluate') || q.includes('assess') ? 'judgement' : q.includes('compare') ? 'comparison' : q.includes('explain') ? 'explanation' : q.includes('analyse') ? 'analysis' : q.includes('describe') ? 'description' : '';
  if (!command && !guideMatches.length && !bankMatches.length) return '';
  const subject = guideMatches[0]?.guide.subject || bankMatches[0]?.entry.subject || inferHscSubject(question) || 'HSC';
  const topic = guideMatches[0]?.guide.title || bankMatches[0]?.entry.topic || 'the topic';
  const evidence = bankMatches.slice(0, 3).map((match) => `- ${match.entry.front} ${match.entry.back}`);
  const moves = guideMatches[0]?.guide.examMoves?.slice(0, 3).map((move) => `- ${move}`) || [];
  return [
    `${subject} - ${topic}`,
    '',
    command ? `Command word: ${command}. That means you need more than a definition.` : 'Use this as an exam response frame.',
    '',
    'Direct answer frame:',
    '1. Define the key term in one clean sentence.',
    '2. Apply it to the exact situation in the question.',
    '3. Add evidence: equation, quote, example, experiment, case study or diagram feature.',
    '4. Finish with the impact, consequence or judgement.',
    '',
    evidence.length ? 'Useful content:' : 'Useful content move:',
    ...(evidence.length ? evidence : ['- Name the concept, show how it works, then link it back to the wording of the question.']),
    '',
    moves.length ? 'Exam traps to avoid:' : 'Exam trap:',
    ...(moves.length ? moves : ['- Do not dump notes. The marker needs a clear link between your evidence and your conclusion.'])
  ].join('\n');
}

function buildQuizResponse(question: string, bankMatches: Array<{ entry: FlashcardBankEntry; score: number }>) {
  if (!/\b(quiz me|test me|ask me|practice questions?)\b/i.test(question)) return '';
  const cards = bankMatches.slice(0, 5);
  if (!cards.length) {
    return 'Quiz mode: send a subject and topic, for example “quiz me on Chemistry Module 5 equilibrium” or “test me on English Module B”. I’ll make short answer questions and traps.';
  }
  return ['Quiz mode. Try these without notes:', '', ...cards.map((match, index) => `${index + 1}. ${match.entry.front}`), '', 'After you answer, paste your responses and say “mark this”.'].join('\n');
}

function buildFlashcardIdeasResponse(question: string, bankMatches: Array<{ entry: FlashcardBankEntry; score: number }>) {
  if (!/\b(make|create|generate).{0,20}flashcards?\b/i.test(question)) return '';
  const cards = bankMatches.slice(0, 6);
  if (!cards.length) return 'I can make flashcard ideas, but give me the subject and topic first. Example: “make flashcards for Physics motors and generators”.';
  return ['Flashcard ideas:', '', ...cards.map((match, index) => `${index + 1}. Front: ${match.entry.front}\n   Back: ${match.entry.back}`)].join('\n');
}

function parseLinearEquation(question: string) {
  const normalised = question.toLowerCase().replace(/−/g, '-').replace(/\s+/g, '');
  const match = normalised.match(/(?:solve)?([+-]?\d*)x([+-]\d+)?=([+-]?\d+)/);
  if (!match) return null;
  const aRaw = match[1];
  const a = aRaw === '' || aRaw === '+' ? 1 : aRaw === '-' ? -1 : Number(aRaw);
  const b = Number(match[2] || 0);
  const c = Number(match[3]);
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c) || a === 0) return null;
  const x = (c - b) / a;
  return { a, b, c, x };
}

function parseQuadraticEquation(question: string) {
  const normalised = question.toLowerCase().replace(/−/g, '-').replace(/²/g, '^2').replace(/\s+/g, '');
  const match = normalised.match(/(?:solve)?([+-]?\d*)x\^?2([+-]\d*)x([+-]\d+)=0/);
  if (!match) return null;
  const aRaw = match[1];
  const bRaw = match[2];
  const cRaw = match[3];
  const a = aRaw === '' || aRaw === '+' ? 1 : aRaw === '-' ? -1 : Number(aRaw);
  const b = bRaw === '+' ? 1 : bRaw === '-' ? -1 : Number(bRaw);
  const c = Number(cRaw);
  if (![a, b, c].every(Number.isFinite) || a === 0) return null;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return { a, b, c, discriminant, roots: [] as number[] };
  const sqrt = Math.sqrt(discriminant);
  return { a, b, c, discriminant, roots: [(-b + sqrt) / (2 * a), (-b - sqrt) / (2 * a)] };
}

function formatNumber(value: number) {
  if (Number.isInteger(value)) return String(value);
  return Number(value.toFixed(4)).toString();
}

function isValidIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(toDateFromIso(value).getTime());
}

function isValidTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}


type StudyAvailabilityWindow = {
  dayType: 'weekday' | 'weekend' | 'daily' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
  start: string;
  end: string;
  subject?: string;
};

const COMMON_STUDY_SUBJECTS = [
  'Physics',
  'Chemistry',
  'Maths',
  'Mathematics',
  'Maths Advanced',
  'Maths Extension 1',
  'Maths Extension 2',
  'Mathematics Advanced',
  'English Advanced',
  'Studies of Religion I',
  'SOR1',
  'Biology',
  'English',
  'Software Engineering',
  'Software',
  'History',
  'Business Studies',
  'Economics',
  'Legal Studies',
  'Geography',
  'PDHPE',
  'Religion',
  'Art',
  'Music',
  'Engineering',
  'Science'
];

function titleCaseSubject(value: string) {
  const clean = value
    .replace(/\b(and|or|exam|exams|test|tests|assessment|assessments|assignment|assignments|study|revision|revise|prac|practice|for|my|the|a|an|i|have)\b/gi, ' ')
    .replace(/[^a-z0-9& /-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return '';
  const lower = clean.toLowerCase();
  if (['math', 'maths', 'mathematics'].includes(lower)) return 'Maths';
  if (['maths advanced', 'mathematics advanced', 'advanced maths'].includes(lower)) return 'Maths Advanced';
  if (['maths extension 1', 'mathematics extension 1', 'ext1', 'ext 1', 'mx1'].includes(lower)) return 'Maths Extension 1';
  if (['maths extension 2', 'mathematics extension 2', 'ext2', 'ext 2', 'mx2'].includes(lower)) return 'Maths Extension 2';
  if (['english advanced', 'advanced english'].includes(lower)) return 'English Advanced';
  if (['studies of religion', 'studies of religion i', 'studies of religion 1', 'sor', 'sor1'].includes(lower)) return 'Studies of Religion I';
  if (lower === 'pdhpe' || lower === 'pe') return 'PDHPE';
  return clean.split(' ').map((part) => part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : '').join(' ');
}

const STUDY_SUBJECT_ALIASES: Array<{ subject: string; pattern: RegExp }> = [
  { subject: 'Maths Extension 2', pattern: /\b(?:maths?|mathematics)\s*(?:extension|ext)\s*2\b|\bmx2\b/i },
  { subject: 'Maths Extension 1', pattern: /\b(?:maths?|mathematics)\s*(?:extension|ext)\s*1\b|\bmx1\b/i },
  { subject: 'Maths Advanced', pattern: /\b(?:maths?|mathematics)\s*advanced\b|\badvanced\s*(?:maths?|mathematics)\b/i },
  { subject: 'Maths', pattern: /\b(?:maths?|mathematics)\b/i },
  { subject: 'English Advanced', pattern: /\benglish\s*advanced\b|\badvanced\s*english\b/i },
  { subject: 'English', pattern: /\benglish\b/i },
  { subject: 'Chemistry', pattern: /\bchem(?:istry)?\b/i },
  { subject: 'Physics', pattern: /\bphysics\b/i },
  { subject: 'Studies of Religion I', pattern: /\b(?:studies of religion|sor\s*1?|religion)\b/i },
  { subject: 'Software Engineering', pattern: /\bsoftware(?:\s*engineering)?\b/i },
  { subject: 'Biology', pattern: /\bbiology\b/i },
  { subject: 'Business Studies', pattern: /\bbusiness\s*studies\b/i },
  { subject: 'Legal Studies', pattern: /\blegal\s*studies\b/i },
  { subject: 'Economics', pattern: /\beconomics\b/i },
  { subject: 'History', pattern: /\bhistory\b/i },
  { subject: 'Geography', pattern: /\bgeography\b/i },
  { subject: 'PDHPE', pattern: /\bpdhpe\b|\bpe\b/i }
];

function findStudySubjectInText(value: string) {
  const text = value || '';
  for (const alias of STUDY_SUBJECT_ALIASES) {
    if (alias.pattern.test(text)) return alias.subject;
  }
  return '';
}


function uniqueSubjects(values: string[]) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const subject = titleCaseSubject(value);
    if (!subject) continue;
    const key = subject.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(subject);
  }
  return output;
}

function extractSmartSubjects(prompt: string, folders: string[]) {
  const lower = prompt.toLowerCase();
  const found: string[] = [];
  for (const folder of folders) {
    if (folder && lower.includes(folder.toLowerCase())) found.push(folder);
  }
  for (const subject of COMMON_STUDY_SUBJECTS) {
    const key = subject.toLowerCase();
    if (new RegExp(`\\b${key.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i').test(prompt)) found.push(subject);
  }
  const subjectPhrase = prompt.match(/(?:i\s+have|subjects?|for)\s+(.{2,140}?)(?:\s+(?:exams?|tests?|assessments?|assignments?|coming up|due)\b|$)/i);
  if (subjectPhrase?.[1]) {
    found.push(...subjectPhrase[1].split(/,|\/|&|\band\b/gi).map((part) => part.trim()).filter(Boolean));
  }
  for (const alias of STUDY_SUBJECT_ALIASES) {
    if (alias.pattern.test(prompt)) found.push(alias.subject);
  }
  const unique = uniqueSubjects(found);
  if (unique.length) return unique;
  const cleanFolders = folders.filter((folder) => folder !== 'Unfiled' && folder !== 'All');
  return cleanFolders.length ? [cleanFolders[0]] : ['Study'];
}

function parseMeridiem(raw: string) {
  const match = raw.toLowerCase().match(/\b(am|pm)\b/);
  return match?.[1] || '';
}

function parseSmartTimeToMinutes(raw: string, fallbackMeridiem = '') {
  const match = raw.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] || '0');
  const meridiem = match[3] || fallbackMeridiem;
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute > 59) return null;
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  if (!meridiem && hour >= 0 && hour <= 7) hour += 12;
  if (hour > 23) return null;
  return hour * 60 + minute;
}

function dayTokenToType(label: string): StudyAvailabilityWindow['dayType'] | null {
  const lower = label.toLowerCase();
  if (lower.includes('weekday') || lower.includes('school')) return 'weekday';
  if (lower.includes('weekend')) return 'weekend';
  if (lower.includes('daily') || lower.includes('every day') || lower.includes('everyday')) return 'daily';
  if (lower.includes('monday') || /\bmon\b/.test(lower)) return 'monday';
  if (lower.includes('tuesday') || /\btue\b|\btues\b/.test(lower)) return 'tuesday';
  if (lower.includes('wednesday') || /\bwed\b|\bweds\b/.test(lower)) return 'wednesday';
  if (lower.includes('thursday') || /\bthu\b|\bthur\b|\bthurs\b/.test(lower)) return 'thursday';
  if (lower.includes('friday') || /\bfri\b/.test(lower)) return 'friday';
  if (lower.includes('saturday') || /\bsat\b/.test(lower)) return 'saturday';
  if (lower.includes('sunday') || /\bsun\b/.test(lower)) return 'sunday';
  return null;
}

function labelToDayTypes(label: string | undefined): StudyAvailabilityWindow['dayType'][] {
  if (!label) return ['daily'];
  const lower = label.toLowerCase();
  if (lower.includes('weekday') || lower.includes('school')) return ['weekday'];
  if (lower.includes('weekend')) return ['weekend'];
  if (lower.includes('daily') || lower.includes('every day') || lower.includes('everyday')) return ['daily'];

  const pieces = lower
    .split(/,|\/|&|\+|\band\b|\s+/gi)
    .map((part) => part.trim())
    .filter(Boolean);
  const days: StudyAvailabilityWindow['dayType'][] = [];
  for (const piece of pieces) {
    const day = dayTokenToType(piece);
    if (day && !days.includes(day)) days.push(day);
  }
  const whole = dayTokenToType(lower);
  if (whole && !days.includes(whole)) days.push(whole);
  return days.length ? days : ['daily'];
}

function extractAvailabilityWindows(prompt: string): StudyAvailabilityWindow[] {
  const windows: StudyAvailabilityWindow[] = [];
  const timePattern = String.raw`(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:to|-|until|–|—)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)`;
  const dayToken = String.raw`(?:weekdays?|school days?|weekends?|daily|every day|everyday|mondays?|mons?|tuesdays?|tues?|wednesdays?|weds?|thursdays?|thurs?|fridays?|fris?|saturdays?|sats?|sundays?|suns?)`;
  const dayPattern = String.raw`(${dayToken}(?:\s*(?:,|/|&|\+|and)\s*${dayToken})*)`;
  const dayFirst = new RegExp(`${dayPattern}[^0-9]{0,44}${timePattern}`, 'gi');
  const timeFirstWithDay = new RegExp(`${timePattern}\s*(?:on|for|during)?\s*${dayPattern}`, 'gi');
  const timeOnly = new RegExp(timePattern, 'gi');

  const inferSubject = (label: string | undefined, matchText: string, index: number) => {
    const before = prompt.slice(Math.max(0, index - 80), index);
    const afterLabelText = matchText
      .replace(new RegExp(dayToken, 'gi'), ' ')
      .replace(new RegExp(timePattern, 'gi'), ' ')
      .replace(/\b(every|on|for|during|and|to|until|am|pm)\b/gi, ' ');
    return findStudySubjectInText(afterLabelText) || findStudySubjectInText(before) || findStudySubjectInText(label || '');
  };

  const addWindow = (label: string | undefined, startRaw: string, endRaw: string, matchText = '', index = 0) => {
    const endMeridiem = parseMeridiem(endRaw);
    const start = parseSmartTimeToMinutes(startRaw, endMeridiem);
    const end = parseSmartTimeToMinutes(endRaw, parseMeridiem(startRaw));
    if (start === null || end === null || end <= start) return;

    const startText = minutesToTime(start);
    const endText = minutesToTime(end);
    const dayTypes = labelToDayTypes(label);
    const subject = inferSubject(label, matchText, index);

    for (const dayType of dayTypes) {
      const candidate = { dayType, start: startText, end: endText, subject: subject || undefined } as StudyAvailabilityWindow;
      const key = `${candidate.dayType}-${candidate.start}-${candidate.end}-${candidate.subject || ''}`;
      if (windows.some((item) => `${item.dayType}-${item.start}-${item.end}-${item.subject || ''}` === key)) continue;
      if (candidate.dayType === 'daily' && windows.some((item) => item.start === candidate.start && item.end === candidate.end && item.dayType !== 'daily')) continue;
      windows.push(candidate);
    }
  };

  for (const match of prompt.matchAll(dayFirst)) addWindow(match[1], match[2], match[3], match[0], match.index || 0);
  for (const match of prompt.matchAll(timeFirstWithDay)) addWindow(match[3], match[1], match[2], match[0], match.index || 0);

  if (!windows.length) {
    for (const match of prompt.matchAll(timeOnly)) addWindow(undefined, match[1], match[2], match[0], match.index || 0);
  }

  if (windows.length) return windows;
  return [
    { dayType: 'weekday', start: '16:00', end: '18:00' },
    { dayType: 'weekend', start: '10:00', end: '12:00' }
  ];
}

function extractSessionDuration(prompt: string) {
  const minuteMatch = prompt.match(/(\d{1,3})\s*(?:min|mins|minute|minutes)\s*(?:sessions?|blocks?)?/i);
  if (minuteMatch) return clamp(Number(minuteMatch[1]), 20, 180);
  const hourMatch = prompt.match(/(\d+(?:\.\d+)?)\s*(?:hour|hours)\s*(?:sessions?|blocks?)?/i);
  if (hourMatch) return clamp(Math.round(Number(hourMatch[1]) * 60), 20, 180);
  return 45;
}

function extractBreakMinutes(prompt: string) {
  const breakMatch = prompt.match(/(\d{1,2})\s*(?:min|mins|minute|minutes)\s*breaks?/i);
  if (breakMatch) return clamp(Number(breakMatch[1]), 0, 45);
  if (/break/i.test(prompt)) return 10;
  return 5;
}

function inferSmartEndDate(prompt: string, startIso: string, currentEndIso: string) {
  const start = toDateFromIso(startIso);
  const currentEnd = toDateFromIso(currentEndIso);
  if (currentEnd.getTime() > start.getTime()) return currentEndIso;
  const range = prompt.match(/(?:in|for|over|next)\s+(\d{1,2})\s*(weeks?|days?|months?)/i);
  if (range) {
    const amount = Number(range[1]);
    const unit = range[2].toLowerCase();
    const end = new Date(start);
    if (unit.startsWith('week')) end.setDate(start.getDate() + amount * 7);
    else if (unit.startsWith('month')) end.setMonth(start.getMonth() + amount);
    else end.setDate(start.getDate() + amount);
    return formatLocalIsoDate(end);
  }
  const defaultEnd = new Date(start);
  defaultEnd.setDate(start.getDate() + 14);
  return formatLocalIsoDate(defaultEnd);
}

function windowMatchesDate(windowItem: StudyAvailabilityWindow, date: Date) {
  const day = date.getDay();
  if (windowItem.dayType === 'daily') return true;
  if (windowItem.dayType === 'weekday') return day >= 1 && day <= 5;
  if (windowItem.dayType === 'weekend') return day === 0 || day === 6;
  const specificDays: Record<StudyAvailabilityWindow['dayType'], number | null> = {
    daily: null,
    weekday: null,
    weekend: null,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
    sunday: 0
  };
  const target = specificDays[windowItem.dayType];
  return target === null ? true : day === target;
}

function makeGeneratedSessionTitle(subject: string, index: number) {
  const activities = ['core notes', 'active recall', 'exam questions', 'past paper drill', 'mistake fix-up', 'quick review'];
  return `${subject} - ${activities[index % activities.length]}`;
}

function findMatchingFlashcardDeck(subject: string, deckNames: string[]) {
  const cleanSubject = normaliseSearchText(subject);
  if (!cleanSubject) return null;
  const exact = deckNames.find((deck) => normaliseSearchText(deck) === cleanSubject);
  if (exact) return exact;
  return deckNames.find((deck) => {
    const cleanDeck = normaliseSearchText(deck);
    return cleanDeck.length > 2 && (cleanDeck.includes(cleanSubject) || cleanSubject.includes(cleanDeck));
  }) || null;
}

function makeOfflineStudySession(subject: string, index: number, prompt: string, duration: number, breakMinutes: number, deckNames: string[]): AiScheduleItem {
  const activityCycle = [
    {
      title: 'syllabus map',
      note: 'Start with the syllabus dot points. Turn each heading into one recall question before opening your notes.'
    },
    {
      title: 'active recall',
      note: 'Close the notes and write what you remember first. Then patch gaps in a different colour so the weakness is visible.'
    },
    {
      title: 'HSC-style drill',
      note: 'Do short exam-style questions. Mark against command words: identify, explain, analyse, evaluate, justify.'
    },
    {
      title: 'mistake log',
      note: 'Choose the ugliest mistake from the last session and write the fix as a rule you can reuse.'
    },
    {
      title: 'flashcard review',
      note: 'Review due cards first, then add two new cards only for facts or traps you actually missed.'
    },
    {
      title: 'timed mixed set',
      note: 'Do a small timed set without notes. Spend the final five minutes writing exactly what cost marks.'
    }
  ];
  const activity = activityCycle[index % activityCycle.length];
  const deck = findMatchingFlashcardDeck(subject, deckNames);
  const urgency = /\b(trial|hsc|exam|test|assessment|tomorrow|next week|in \d+ days?)\b/i.test(prompt)
    ? ' Prioritise examinable content first.'
    : '';
  const deckNote = deck ? ` Linked flashcard deck: ${deck}.` : '';
  return {
    title: `${subject} - ${activity.title}`,
    date: '',
    startTime: '',
    endTime: '',
    subject,
    linkedDeck: deck,
    notes: `${activity.note}${urgency} Session length: ${duration} minutes, then ${breakMinutes} minutes break.${deckNote}`.trim()
  };
}

async function getBrowserFolderDb() {
  const idb = window.idb;
  if (!idb?.openDB) return null;
  return idb.openDB('local-notes-folder-handles', 1, {
    upgrade(db: any) {
      if (!db.objectStoreNames.contains('folders')) db.createObjectStore('folders');
    }
  });
}

async function saveBrowserDirectoryHandle(folderName: string, handle: any) {
  const db = await getBrowserFolderDb();
  if (!db) return;
  await db.put('folders', handle, folderName);
}

async function loadBrowserDirectoryHandle(folderName: string) {
  const db = await getBrowserFolderDb();
  if (!db) return null;
  return db.get('folders', folderName);
}

async function deleteBrowserDirectoryHandle(folderName: string) {
  const db = await getBrowserFolderDb();
  if (!db) return;
  await db.delete('folders', folderName);
}

function createPdfPages(count: number): NotebookPage[] {
  return Array.from({ length: count }, (_, index) => ({
    key: `pdf-${index + 1}-${makeId()}`,
    kind: 'pdf',
    sourcePage: index + 1,
    extraSpace: 0,
    spacers: [],
    crop: { top: 0, right: 0, bottom: 0, left: 0 }
  }));
}

function createBlankPage(template: BlankPageTemplate = 'ruled'): NotebookPage {
  return {
    key: `blank-${makeId()}`,
    kind: 'blank',
    width: DEFAULT_BLANK_WIDTH,
    height: DEFAULT_BLANK_HEIGHT,
    extraSpace: 0,
    spacers: [],
    template
  };
}

function cloneDocument(doc: DocumentRecord): DocumentRecord {
  return JSON.parse(JSON.stringify(doc));
}

function normaliseAnnotationZ(annotations: PageAnnotations): PageAnnotations {
  let z = 1;
  const used = new Set<number>();
  const nextNumber = (value: unknown) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      used.add(value);
      z = Math.max(z, value + 1);
      return value;
    }
    while (used.has(z)) z += 1;
    used.add(z);
    return z++;
  };

  return {
    imageBoxes: (annotations.imageBoxes || []).map((item) => ({ ...item, rotation: item.rotation || 0, locked: Boolean(item.locked), z: nextNumber(item.z) })),
    mathPlaneBoxes: (annotations.mathPlaneBoxes || []).map((item) => ({
      ...item,
      xMin: Number.isFinite(item.xMin) ? item.xMin : -10,
      xMax: Number.isFinite(item.xMax) && item.xMax !== item.xMin ? item.xMax : 10,
      yMin: Number.isFinite(item.yMin) ? item.yMin : -10,
      yMax: Number.isFinite(item.yMax) && item.yMax !== item.yMin ? item.yMax : 10,
      gridSpacing: Math.max(0.1, Number.isFinite(item.gridSpacing) ? item.gridSpacing : 1),
      gridStyle: item.gridStyle === 'dotted' || item.gridStyle === 'none' ? item.gridStyle : 'lines',
      showAxisLabels: item.showAxisLabels !== false,
      showTickMarks: item.showTickMarks !== false,
      axisColor: safeHexColour(item.axisColor, '#111827'),
      gridColor: safeHexColour(item.gridColor, '#CBD5E1'),
      z: nextNumber(item.z)
    })),
    strokes: (annotations.strokes || []).map((item) => ({ ...item, z: nextNumber(item.z) })),
    shapeBoxes: (annotations.shapeBoxes || []).map((item) => ({ ...item, z: nextNumber(item.z) })),
    textBoxes: (annotations.textBoxes || []).map((item) => ({ ...item, backgroundColor: item.backgroundColor || 'transparent', z: nextNumber(item.z) }))
  };
}

function nextZIndex(annotations: PageAnnotations): number {
  const values = [
    ...annotations.strokes.map((item) => item.z || 0),
    ...annotations.imageBoxes.map((item) => item.z || 0),
    ...annotations.mathPlaneBoxes.map((item) => item.z || 0),
    ...annotations.textBoxes.map((item) => item.z || 0),
    ...annotations.shapeBoxes.map((item) => item.z || 0)
  ];
  return Math.max(0, ...values) + 1;
}

function getPageAnnotations(doc: DocumentRecord, pageKey: string): PageAnnotations {
  const raw = doc.annotations?.[pageKey];
  if (!raw) return { strokes: [], textBoxes: [], imageBoxes: [], mathPlaneBoxes: [], shapeBoxes: [] };
  if (Array.isArray(raw)) return normaliseAnnotationZ({ strokes: raw, textBoxes: [], imageBoxes: [], mathPlaneBoxes: [], shapeBoxes: [] });
  return normaliseAnnotationZ({
    strokes: raw.strokes ?? [],
    textBoxes: raw.textBoxes ?? [],
    imageBoxes: raw.imageBoxes ?? [],
    mathPlaneBoxes: raw.mathPlaneBoxes ?? [],
    shapeBoxes: raw.shapeBoxes ?? []
  });
}

function setPageAnnotations(doc: DocumentRecord, pageKey: string, next: PageAnnotations) {
  doc.annotations = doc.annotations || {};
  doc.annotations[pageKey] = normaliseAnnotationZ({
    strokes: next.strokes || [],
    textBoxes: next.textBoxes || [],
    imageBoxes: next.imageBoxes || [],
    mathPlaneBoxes: next.mathPlaneBoxes || [],
    shapeBoxes: next.shapeBoxes || []
  });
}

function normaliseDocument(doc: DocumentRecord, fallbackThemeId: NoteThemeId = DEFAULT_THEME_ID): DocumentRecord {
  const next = cloneDocument(doc);
  next.pdfFileName = next.pdfFileName ?? null;
  next.themeId = typeof next.themeId === 'string' && next.themeId.trim() ? next.themeId.trim() : fallbackThemeId;
  next.folder = next.folder || '';
  next.tags = Array.isArray(next.tags) ? next.tags.filter(Boolean) : [];
  next.label = (next.label && LABEL_OPTIONS.some((item) => item.id === next.label)) ? next.label : null;
  next.deletedAt = next.deletedAt ?? null;
  next.thumbnailDataUrl = next.thumbnailDataUrl ?? null;
  next.pageTitles = next.pageTitles || {};
  next.bookmarks = next.bookmarks || {};
  next.pages = next.pages || [];
  next.annotations = next.annotations || {};

  for (const page of next.pages) {
    page.spacers = page.spacers || [];
    page.extraSpace = page.extraSpace || 0;
    if (page.kind === 'blank') page.template = page.template || 'ruled';
    if (page.kind === 'pdf') page.crop = page.crop || { top: 0, right: 0, bottom: 0, left: 0 };
    setPageAnnotations(next, page.key, getPageAnnotations(next, page.key));
  }

  return next;
}

function safePdfName(name: string) {
  const trimmed = (name || 'Untitled Notes').trim();
  return trimmed.toLowerCase().endsWith('.pdf') ? trimmed : `${trimmed}.pdf`;
}


function uint8ArrayToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...Array.from(chunk));
  }
  return btoa(binary);
}

function dataUrlToUint8Array(dataUrl: string) {
  const base64 = dataUrl.split(',')[1] || '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToTransferableBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function bytesToLocalNotesPayload(bytes: Uint8Array): ArrayBuffer | number[] {
  return window.localNotes?.runtime === 'electron' ? Array.from(bytes) : bytesToTransferableBuffer(bytes);
}

function downloadBrowserFile(fileName: string, data: BlobPart, type: string) {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}


function displayName(name: string) {
  return (name || 'Untitled Notes').replace(/\.pdf$/i, '');
}

function formatEdited(value: string | undefined | null) {
  if (!value) return 'Not saved yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not saved yet';
  return `Edited ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

function cleanTags(value: string) {
  return Array.from(new Set(value.split(',').map((item) => item.trim()).filter(Boolean))).slice(0, 8);
}

function getDocumentTheme(doc: DocumentRecord, customThemes: NoteTheme[] = []) {
  return customThemes.find((theme) => theme.id === doc.themeId) || NOTE_THEMES[doc.themeId || DEFAULT_THEME_ID] || NOTE_THEMES[DEFAULT_THEME_ID];
}

function getCanvasPointFromClient(clientX: number, clientY: number, canvas: HTMLCanvasElement, zoom: number, pressure = 0.5): Point {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left) / zoom,
    y: (clientY - rect.top) / zoom,
    pressure: pressure || 0.5
  };
}

function getCanvasPoint(event: ReactPointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement, zoom: number): Point {
  return getCanvasPointFromClient(event.clientX, event.clientY, canvas, zoom, event.pressure || 0.5);
}

function shouldKeepStrokePoint(points: Point[], point: Point, minDistance = 0.65): boolean {
  const last = points[points.length - 1];
  if (!last) return true;
  return Math.hypot(point.x - last.x, point.y - last.y) >= minDistance;
}

function smoothStrokePoints(points: Point[], strokeTool: Stroke['tool'] = 'pen'): Point[] {
  if (points.length < 4) return points;

  const minDistance = strokeTool === 'highlighter' ? 0.45 : 0.32;
  const cleaned = points.filter((point, index) => index === 0 || Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) > minDistance);
  if (cleaned.length < 4) return cleaned;

  const deJittered = cleaned.map((point, index) => {
    if (index === 0 || index === cleaned.length - 1) return point;
    const previous = cleaned[index - 1];
    const next = cleaned[index + 1];
    const centreWeight = strokeTool === 'highlighter' ? 0.58 : 0.48;
    const sideWeight = (1 - centreWeight) / 2;
    return {
      x: previous.x * sideWeight + point.x * centreWeight + next.x * sideWeight,
      y: previous.y * sideWeight + point.y * centreWeight + next.y * sideWeight,
      pressure: ((previous.pressure || 0.5) * sideWeight) + ((point.pressure || 0.5) * centreWeight) + ((next.pressure || 0.5) * sideWeight)
    };
  });

  const result: Point[] = [deJittered[0]];
  for (let i = 0; i < deJittered.length - 1; i += 1) {
    const a = deJittered[i];
    const b = deJittered[i + 1];
    result.push({
      x: a.x * 0.68 + b.x * 0.32,
      y: a.y * 0.68 + b.y * 0.32,
      pressure: ((a.pressure || 0.5) * 0.68) + ((b.pressure || 0.5) * 0.32)
    });
    result.push({
      x: a.x * 0.32 + b.x * 0.68,
      y: a.y * 0.32 + b.y * 0.68,
      pressure: ((a.pressure || 0.5) * 0.32) + ((b.pressure || 0.5) * 0.68)
    });
  }
  result.push(deJittered[deJittered.length - 1]);
  return result;
}

function distanceBetween(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy), 0, 1);
  const projection = { x: start.x + t * dx, y: start.y + t * dy };
  return Math.hypot(point.x - projection.x, point.y - projection.y);
}

function segmentToSegmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(
    distanceToSegment(a, c, d),
    distanceToSegment(b, c, d),
    distanceToSegment(c, a, b),
    distanceToSegment(d, a, b)
  );
}

function pointNearPath(point: Point, path: Point[], radius: number): boolean {
  if (path.length <= 1) return path.some((item) => distanceBetween(point, item) <= radius);
  for (let i = 0; i < path.length - 1; i += 1) {
    if (distanceToSegment(point, path[i], path[i + 1]) <= radius) return true;
  }
  return false;
}

function segmentNearPath(start: Point, end: Point, path: Point[], radius: number): boolean {
  if (path.length <= 1) return path.some((item) => distanceToSegment(item, start, end) <= radius);
  for (let i = 0; i < path.length - 1; i += 1) {
    if (segmentToSegmentDistance(start, end, path[i], path[i + 1]) <= radius) return true;
  }
  return false;
}

function strokeIsNearPoint(stroke: Stroke, point: Point, radius: number): boolean {
  if (stroke.points.length === 1) {
    return Math.hypot(stroke.points[0].x - point.x, stroke.points[0].y - point.y) <= radius;
  }

  for (let i = 0; i < stroke.points.length - 1; i += 1) {
    if (distanceToSegment(point, stroke.points[i], stroke.points[i + 1]) <= radius) {
      return true;
    }
  }
  return false;
}


type ElementKind = 'stroke' | 'text' | 'image' | 'shape' | 'mathPlane';
type LassoFilter = 'all' | 'handwriting' | 'images' | 'text' | 'shapes';
type LayerDirection = 'front' | 'back' | 'forward' | 'backward';
type SelectedElement = { kind: ElementKind; id: string };
type DocTabInsertSide = 'before' | 'after';

function elementKey(kind: ElementKind, id: string) {
  return `${kind}:${id}`;
}

function parseElementKey(key: string): SelectedElement | null {
  const [kind, id] = key.split(':');
  if (!id) return null;
  if (kind !== 'stroke' && kind !== 'text' && kind !== 'image' && kind !== 'shape' && kind !== 'mathPlane') return null;
  return { kind, id };
}

function appendOpenDocTab(tabs: string[], docId: string) {
  const cleanTabs = Array.from(new Set(tabs));
  if (cleanTabs.includes(docId)) return cleanTabs;
  const nextTabs = [...cleanTabs, docId];
  return nextTabs.length > 6 ? nextTabs.slice(nextTabs.length - 6) : nextTabs;
}

function reorderOpenDocTabs(tabs: string[], draggedId: string, targetId: string, side: DocTabInsertSide) {
  if (draggedId === targetId) return tabs;
  const withoutDragged = tabs.filter((id) => id !== draggedId);
  const targetIndex = withoutDragged.indexOf(targetId);
  if (targetIndex < 0) return tabs;
  const next = [...withoutDragged];
  next.splice(targetIndex + (side === 'after' ? 1 : 0), 0, draggedId);
  return next;
}

function normaliseRect(x: number, y: number, width: number, height: number) {
  const left = width < 0 ? x + width : x;
  const top = height < 0 ? y + height : y;
  return { x: left, y: top, width: Math.abs(width), height: Math.abs(height) };
}

function strokeBounds(stroke: Stroke) {
  if (!stroke.points.length) return { x: 0, y: 0, width: 0, height: 0 };
  const xs = stroke.points.map((point) => point.x);
  const ys = stroke.points.map((point) => point.y);
  const padding = Math.max(10, stroke.width + 6);
  const minX = Math.min(...xs) - padding;
  const minY = Math.min(...ys) - padding;
  const maxX = Math.max(...xs) + padding;
  const maxY = Math.max(...ys) + padding;
  return { x: minX, y: minY, width: Math.max(18, maxX - minX), height: Math.max(18, maxY - minY) };
}

function getElementBounds(annotations: PageAnnotations, key: string) {
  const parsed = parseElementKey(key);
  if (!parsed) return null;
  if (parsed.kind === 'stroke') {
    const stroke = annotations.strokes.find((item) => item.id === parsed.id);
    return stroke ? strokeBounds(stroke) : null;
  }
  if (parsed.kind === 'text') {
    const box = annotations.textBoxes.find((item) => item.id === parsed.id);
    return box ? { x: box.x, y: box.y, width: box.width, height: Math.max(box.minHeight, 40) } : null;
  }
  if (parsed.kind === 'shape') {
    const shape = annotations.shapeBoxes.find((item) => item.id === parsed.id);
    return shape ? normaliseRect(shape.x, shape.y, shape.width, shape.height) : null;
  }
  if (parsed.kind === 'mathPlane') {
    const plane = annotations.mathPlaneBoxes.find((item) => item.id === parsed.id);
    return plane ? { x: plane.x, y: plane.y, width: plane.width, height: plane.height } : null;
  }
  const image = annotations.imageBoxes.find((item) => item.id === parsed.id);
  return image ? { x: image.x, y: image.y, width: image.width, height: image.height } : null;
}

function hitTestElement(point: Point, annotations: PageAnnotations): SelectedElement | null {
  for (let i = annotations.imageBoxes.length - 1; i >= 0; i -= 1) {
    const box = annotations.imageBoxes[i];
    if (point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height) {
      return { kind: 'image', id: box.id };
    }
  }
  for (let i = annotations.mathPlaneBoxes.length - 1; i >= 0; i -= 1) {
    const plane = annotations.mathPlaneBoxes[i];
    if (point.x >= plane.x && point.x <= plane.x + plane.width && point.y >= plane.y && point.y <= plane.y + plane.height) {
      return { kind: 'mathPlane', id: plane.id };
    }
  }
  for (let i = annotations.textBoxes.length - 1; i >= 0; i -= 1) {
    const box = annotations.textBoxes[i];
    if (point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + Math.max(box.minHeight, 40)) {
      return { kind: 'text', id: box.id };
    }
  }
  for (let i = annotations.shapeBoxes.length - 1; i >= 0; i -= 1) {
    const shape = annotations.shapeBoxes[i];
    const bounds = normaliseRect(shape.x, shape.y, shape.width, shape.height);
    if (point.x >= bounds.x && point.x <= bounds.x + bounds.width && point.y >= bounds.y && point.y <= bounds.y + bounds.height) {
      return { kind: 'shape', id: shape.id };
    }
  }
  for (let i = annotations.strokes.length - 1; i >= 0; i -= 1) {
    const stroke = annotations.strokes[i];
    if (strokeIsNearPoint(stroke, point, Math.max(10, stroke.width + 6))) {
      return { kind: 'stroke', id: stroke.id };
    }
  }
  return null;
}

function moveElements(annotations: PageAnnotations, keys: string[], dx: number, dy: number, bounds: { width: number; totalHeight: number }): PageAnnotations {
  const selected = new Set(keys);
  return {
    strokes: annotations.strokes.map((stroke) => selected.has(elementKey('stroke', stroke.id))
      ? { ...stroke, points: stroke.points.map((point) => ({ ...point, x: clamp(point.x + dx, 0, bounds.width), y: clamp(point.y + dy, 0, bounds.totalHeight) })) }
      : stroke),
    textBoxes: annotations.textBoxes.map((box) => selected.has(elementKey('text', box.id))
      ? { ...box, x: clamp(box.x + dx, 0, Math.max(0, bounds.width - box.width)), y: clamp(box.y + dy, 0, Math.max(0, bounds.totalHeight - box.minHeight)) }
      : box),
    imageBoxes: annotations.imageBoxes.map((box) => selected.has(elementKey('image', box.id)) && !box.locked
      ? { ...box, x: clamp(box.x + dx, 0, Math.max(0, bounds.width - box.width)), y: clamp(box.y + dy, 0, Math.max(0, bounds.totalHeight - box.height)) }
      : box),
    mathPlaneBoxes: annotations.mathPlaneBoxes.map((plane) => selected.has(elementKey('mathPlane', plane.id))
      ? { ...plane, x: clamp(plane.x + dx, 0, Math.max(0, bounds.width - plane.width)), y: clamp(plane.y + dy, 0, Math.max(0, bounds.totalHeight - plane.height)) }
      : plane),
    shapeBoxes: annotations.shapeBoxes.map((shape) => selected.has(elementKey('shape', shape.id))
      ? { ...shape, x: clamp(shape.x + dx, -bounds.width, bounds.width), y: clamp(shape.y + dy, -bounds.totalHeight, bounds.totalHeight) }
      : shape)
  };
}

function drawStroke(context: CanvasRenderingContext2D, stroke: Stroke, options: { liveHighlighter?: boolean } = {}) {
  if (stroke.points.length === 0) return;

  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = stroke.color;
  context.lineWidth = stroke.width;
  context.globalAlpha = stroke.opacity ?? (stroke.tool === 'highlighter' ? 0.34 : 1);
  context.globalCompositeOperation = stroke.tool === 'highlighter' && !options.liveHighlighter ? 'multiply' : 'source-over';

  context.beginPath();
  context.moveTo(stroke.points[0].x, stroke.points[0].y);
  for (let i = 1; i < stroke.points.length; i += 1) {
    const previous = stroke.points[i - 1];
    const current = stroke.points[i];
    const midX = (previous.x + current.x) / 2;
    const midY = (previous.y + current.y) / 2;
    context.quadraticCurveTo(previous.x, previous.y, midX, midY);
  }
  if (stroke.points.length > 1) {
    const last = stroke.points[stroke.points.length - 1];
    context.lineTo(last.x, last.y);
  }
  context.stroke();
  context.restore();
}



function withRectTransform(context: CanvasRenderingContext2D, rect: { x: number; y: number; width: number; height: number }, rotation: number, draw: () => void) {
  context.save();
  context.translate(rect.x + rect.width / 2, rect.y + rect.height / 2);
  context.rotate(rotation);
  context.translate(-rect.width / 2, -rect.height / 2);
  draw();
  context.restore();
}

function pathPolygon(context: CanvasRenderingContext2D, points: Point[]) {
  if (!points.length) return;
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) context.lineTo(point.x, point.y);
  context.closePath();
}

function regularPolygon(rect: { x: number; y: number; width: number; height: number }, sides: number, rotation = -Math.PI / 2): Point[] {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const rx = rect.width / 2;
  const ry = rect.height / 2;
  return Array.from({ length: sides }, (_, index) => {
    const angle = rotation + (Math.PI * 2 * index) / sides;
    return { x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry };
  });
}

function starPolygon(rect: { x: number; y: number; width: number; height: number }, points: number, innerRatio = 0.45): Point[] {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const outerX = rect.width / 2;
  const outerY = rect.height / 2;
  const count = points * 2;
  return Array.from({ length: count }, (_, index) => {
    const radius = index % 2 === 0 ? 1 : innerRatio;
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count;
    return { x: cx + Math.cos(angle) * outerX * radius, y: cy + Math.sin(angle) * outerY * radius };
  });
}

function roundedRectPath(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

function strokeAndFill(context: CanvasRenderingContext2D, shape: ShapeBox) {
  if (shape.fillColor) context.fill();
  context.stroke();
}

function rightArrowPoints(w: number, h: number): Point[] {
  const head = Math.max(w * 0.28, 18);
  const shaft = h * 0.28;
  return [
    { x: 0, y: h / 2 - shaft },
    { x: w - head, y: h / 2 - shaft },
    { x: w - head, y: 0 },
    { x: w, y: h / 2 },
    { x: w - head, y: h },
    { x: w - head, y: h / 2 + shaft },
    { x: 0, y: h / 2 + shaft }
  ];
}

function drawRightArrow(context: CanvasRenderingContext2D, rect: { x: number; y: number; width: number; height: number }, rotation = 0) {
  withRectTransform(context, rect, rotation, () => {
    pathPolygon(context, rightArrowPoints(rect.width, rect.height));
  });
}

function drawDoubleArrowHorizontal(context: CanvasRenderingContext2D, rect: { x: number; y: number; width: number; height: number }, rotation = 0) {
  withRectTransform(context, rect, rotation, () => {
    const w = rect.width;
    const h = rect.height;
    const head = Math.max(w * 0.18, 14);
    const shaft = h * 0.28;
    pathPolygon(context, [
      { x: 0, y: h / 2 }, { x: head, y: 0 }, { x: head, y: h / 2 - shaft },
      { x: w - head, y: h / 2 - shaft }, { x: w - head, y: 0 }, { x: w, y: h / 2 },
      { x: w - head, y: h }, { x: w - head, y: h / 2 + shaft }, { x: head, y: h / 2 + shaft }, { x: head, y: h }
    ]);
  });
}

function drawShapeText(context: CanvasRenderingContext2D, rect: { x: number; y: number; width: number; height: number }, text: string, color: string) {
  context.save();
  context.fillStyle = color;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = `700 ${Math.max(20, Math.min(rect.width, rect.height) * 0.55)}px Arial, sans-serif`;
  context.fillText(text, rect.x + rect.width / 2, rect.y + rect.height / 2);
  context.restore();
}

function drawShape(context: CanvasRenderingContext2D, shape: ShapeBox) {
  const rect = normaliseRect(shape.x, shape.y, shape.width, shape.height);
  const w = rect.width;
  const h = rect.height;
  const kind = shape.kind || 'rectangle';
  context.save();
  context.strokeStyle = shape.color;
  context.fillStyle = shape.fillColor || 'rgba(255,255,255,0.01)';
  context.lineWidth = shape.strokeWidth;
  context.globalAlpha = shape.opacity;
  context.lineCap = 'round';
  context.lineJoin = 'round';

  const simpleStrokeAndFill = () => strokeAndFill(context, shape);
  const drawPolygon = (points: Point[]) => { pathPolygon(context, points); simpleStrokeAndFill(); };

  if (kind === 'line') {
    context.beginPath(); context.moveTo(shape.x, shape.y); context.lineTo(shape.x + shape.width, shape.y + shape.height); context.stroke(); context.restore(); return;
  }
  if (kind === 'line-arrow') {
    context.beginPath(); context.moveTo(shape.x, shape.y); context.lineTo(shape.x + shape.width, shape.y + shape.height); context.stroke();
    const angle = Math.atan2(shape.height, shape.width); const len = 14;
    const x = shape.x + shape.width; const y = shape.y + shape.height;
    context.beginPath(); context.moveTo(x, y); context.lineTo(x - len * Math.cos(angle - 0.55), y - len * Math.sin(angle - 0.55)); context.moveTo(x, y); context.lineTo(x - len * Math.cos(angle + 0.55), y - len * Math.sin(angle + 0.55)); context.stroke(); context.restore(); return;
  }
  if (kind === 'rectangle' || kind === 'flow-process') { if (shape.fillColor) context.fillRect(rect.x, rect.y, w, h); context.strokeRect(rect.x, rect.y, w, h); context.restore(); return; }
  if (kind === 'rounded-rectangle' || kind === 'flow-terminator') { roundedRectPath(context, rect.x, rect.y, w, h, h / 2); simpleStrokeAndFill(); context.restore(); return; }
  if (kind === 'ellipse' || kind === 'circle') { context.beginPath(); context.ellipse(rect.x + w / 2, rect.y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); simpleStrokeAndFill(); context.restore(); return; }
  if (kind === 'triangle-isosceles') { drawPolygon([{ x: rect.x + w / 2, y: rect.y }, { x: rect.x + w, y: rect.y + h }, { x: rect.x, y: rect.y + h }]); context.restore(); return; }
  if (kind === 'triangle-right') { drawPolygon([{ x: rect.x, y: rect.y }, { x: rect.x + w, y: rect.y + h }, { x: rect.x, y: rect.y + h }]); context.restore(); return; }
  if (kind === 'trapezoid') { drawPolygon([{ x: rect.x + w * 0.22, y: rect.y }, { x: rect.x + w * 0.78, y: rect.y }, { x: rect.x + w, y: rect.y + h }, { x: rect.x, y: rect.y + h }]); context.restore(); return; }
  if (kind === 'diamond' || kind === 'flow-decision') { drawPolygon([{ x: rect.x + w / 2, y: rect.y }, { x: rect.x + w, y: rect.y + h / 2 }, { x: rect.x + w / 2, y: rect.y + h }, { x: rect.x, y: rect.y + h / 2 }]); context.restore(); return; }
  const sideMap: Record<string, number> = { pentagon: 5, hexagon: 6, heptagon: 7, octagon: 8, decagon: 10, dodecagon: 12, 'flow-preparation': 6 };
  if (sideMap[kind]) { drawPolygon(regularPolygon(rect, sideMap[kind], kind === 'flow-preparation' ? 0 : -Math.PI / 2)); context.restore(); return; }

  if (kind.includes('snip') || kind.includes('round-single') || kind.includes('round-same')) {
    const cut = Math.min(w, h) * 0.22;
    context.beginPath();
    if (kind === 'snip-single-corner-rectangle') {
      context.moveTo(rect.x, rect.y); context.lineTo(rect.x + w - cut, rect.y); context.lineTo(rect.x + w, rect.y + cut); context.lineTo(rect.x + w, rect.y + h); context.lineTo(rect.x, rect.y + h); context.closePath();
    } else if (kind === 'snip-same-side-corner-rectangle') {
      context.moveTo(rect.x + cut, rect.y); context.lineTo(rect.x + w - cut, rect.y); context.lineTo(rect.x + w, rect.y + cut); context.lineTo(rect.x + w, rect.y + h - cut); context.lineTo(rect.x + w - cut, rect.y + h); context.lineTo(rect.x + cut, rect.y + h); context.lineTo(rect.x, rect.y + h - cut); context.lineTo(rect.x, rect.y + cut); context.closePath();
    } else if (kind === 'snip-diagonal-corner-rectangle') {
      context.moveTo(rect.x + cut, rect.y); context.lineTo(rect.x + w, rect.y); context.lineTo(rect.x + w, rect.y + h - cut); context.lineTo(rect.x + w - cut, rect.y + h); context.lineTo(rect.x, rect.y + h); context.lineTo(rect.x, rect.y + cut); context.closePath();
    } else {
      roundedRectPath(context, rect.x, rect.y, w, h, cut / 2);
    }
    simpleStrokeAndFill(); context.restore(); return;
  }

  if (kind === 'cube') {
    const d = Math.min(w, h) * 0.2;
    context.strokeRect(rect.x, rect.y + d, w - d, h - d); context.strokeRect(rect.x + d, rect.y, w - d, h - d);
    context.beginPath(); context.moveTo(rect.x, rect.y + d); context.lineTo(rect.x + d, rect.y); context.moveTo(rect.x + w - d, rect.y + d); context.lineTo(rect.x + w, rect.y); context.moveTo(rect.x + w - d, rect.y + h); context.lineTo(rect.x + w, rect.y + h - d); context.stroke(); context.restore(); return;
  }
  if (kind === 'cylinder') {
    const cx = rect.x + w / 2;
    const rx = w / 2;
    const ry = Math.min(h * 0.16, w * 0.18);
    const topY = rect.y + ry;
    const bottomY = rect.y + h - ry;
    if (shape.fillColor) {
      context.beginPath();
      context.moveTo(rect.x, topY);
      context.lineTo(rect.x, bottomY);
      context.ellipse(cx, bottomY, rx, ry, 0, Math.PI, 0, true);
      context.lineTo(rect.x + w, topY);
      context.ellipse(cx, topY, rx, ry, 0, 0, Math.PI, true);
      context.closePath();
      context.fill();
    }
    context.beginPath();
    context.moveTo(rect.x, topY);
    context.lineTo(rect.x, bottomY);
    context.moveTo(rect.x + w, topY);
    context.lineTo(rect.x + w, bottomY);
    context.stroke();
    context.beginPath();
    context.ellipse(cx, topY, rx, ry, 0, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.ellipse(cx, bottomY, rx, ry, 0, Math.PI, 0, true);
    context.stroke();
    context.save();
    context.globalAlpha *= 0.45;
    context.setLineDash([5, 5]);
    context.beginPath();
    context.ellipse(cx, bottomY, rx, ry, 0, Math.PI, 0, false);
    context.stroke();
    context.restore();
    context.restore(); return;
  }
  if (kind === 'plaque' || kind === 'bevel') { drawPolygon([{ x: rect.x + w*.12, y: rect.y }, { x: rect.x + w*.88, y: rect.y }, { x: rect.x + w, y: rect.y + h*.12 }, { x: rect.x + w, y: rect.y + h*.88 }, { x: rect.x + w*.88, y: rect.y + h }, { x: rect.x + w*.12, y: rect.y + h }, { x: rect.x, y: rect.y + h*.88 }, { x: rect.x, y: rect.y + h*.12 }]); context.restore(); return; }
  if (kind === 'frame' || kind === 'half-frame') { context.strokeRect(rect.x, rect.y, w, h); context.strokeRect(rect.x + w*.18, rect.y + h*.18, w*.64, h*.64); if (kind === 'half-frame') { context.clearRect(rect.x + w*.45, rect.y - 3, w*.55, h*.25); } context.restore(); return; }
  if (kind === 'folded-corner') { context.strokeRect(rect.x, rect.y, w, h); context.beginPath(); context.moveTo(rect.x + w*.72, rect.y); context.lineTo(rect.x + w, rect.y + h*.28); context.lineTo(rect.x + w*.72, rect.y + h*.28); context.closePath(); context.stroke(); context.restore(); return; }

  if (kind === 'donut') { context.beginPath(); context.ellipse(rect.x+w/2, rect.y+h/2, w/2, h/2, 0, 0, Math.PI*2); context.ellipse(rect.x+w/2, rect.y+h/2, w*.22, h*.22, 0, 0, Math.PI*2); context.stroke(); context.restore(); return; }
  if (kind === 'chord') { context.beginPath(); context.arc(rect.x+w/2, rect.y+h/2, Math.min(w,h)/2, Math.PI*.15, Math.PI*1.85); context.closePath(); simpleStrokeAndFill(); context.restore(); return; }
  if (kind === 'pie') { context.beginPath(); context.moveTo(rect.x+w/2, rect.y+h/2); context.arc(rect.x+w/2, rect.y+h/2, Math.min(w,h)/2, -Math.PI/2, Math.PI*.35); context.closePath(); simpleStrokeAndFill(); context.restore(); return; }
  if (kind === 'arc' || kind === 'block-arc') { context.beginPath(); context.arc(rect.x+w/2, rect.y+h/2, Math.min(w,h)*.42, Math.PI*.15, Math.PI*1.25); context.stroke(); context.restore(); return; }
  if (kind === 'smiley') { context.beginPath(); context.ellipse(rect.x+w/2, rect.y+h/2, w/2, h/2, 0, 0, Math.PI*2); context.stroke(); context.beginPath(); context.arc(rect.x+w*.35, rect.y+h*.4, Math.min(w,h)*.04, 0, Math.PI*2); context.arc(rect.x+w*.65, rect.y+h*.4, Math.min(w,h)*.04, 0, Math.PI*2); context.fill(); context.beginPath(); context.arc(rect.x+w*.5, rect.y+h*.55, Math.min(w,h)*.22, 0, Math.PI); context.stroke(); context.restore(); return; }
  if (kind === 'heart') { context.beginPath(); context.moveTo(rect.x+w*.5, rect.y+h*.88); context.bezierCurveTo(rect.x-w*.05, rect.y+h*.5, rect.x+w*.18, rect.y, rect.x+w*.5, rect.y+h*.25); context.bezierCurveTo(rect.x+w*.82, rect.y, rect.x+w*1.05, rect.y+h*.5, rect.x+w*.5, rect.y+h*.88); context.closePath(); simpleStrokeAndFill(); context.restore(); return; }
  if (kind === 'sun') { drawPolygon(starPolygon(rect, 12, .72)); context.restore(); return; }
  if (kind === 'moon') { context.beginPath(); context.arc(rect.x+w*.58, rect.y+h*.5, Math.min(w,h)*.42, Math.PI*.55, Math.PI*1.45); context.arc(rect.x+w*.42, rect.y+h*.5, Math.min(w,h)*.34, Math.PI*1.45, Math.PI*.55, true); context.closePath(); simpleStrokeAndFill(); context.restore(); return; }
  if (kind === 'cloud' || kind === 'thought-cloud') { context.beginPath(); context.arc(rect.x+w*.25, rect.y+h*.62, w*.18, 0, Math.PI*2); context.arc(rect.x+w*.43, rect.y+h*.42, w*.2, 0, Math.PI*2); context.arc(rect.x+w*.64, rect.y+h*.5, w*.23, 0, Math.PI*2); context.arc(rect.x+w*.78, rect.y+h*.66, w*.16, 0, Math.PI*2); context.stroke(); if (kind === 'thought-cloud') { context.beginPath(); context.arc(rect.x+w*.18, rect.y+h*.88, w*.04, 0, Math.PI*2); context.stroke(); } context.restore(); return; }
  if (kind === 'lightning') { drawPolygon([{x:rect.x+w*.58,y:rect.y},{x:rect.x+w*.25,y:rect.y+h*.55},{x:rect.x+w*.5,y:rect.y+h*.55},{x:rect.x+w*.38,y:rect.y+h},{x:rect.x+w*.76,y:rect.y+h*.42},{x:rect.x+w*.52,y:rect.y+h*.42}]); context.restore(); return; }
  if (kind === 'prohibited') { context.beginPath(); context.ellipse(rect.x+w/2, rect.y+h/2, w/2, h/2, 0, 0, Math.PI*2); context.stroke(); context.beginPath(); context.moveTo(rect.x+w*.22, rect.y+h*.78); context.lineTo(rect.x+w*.78, rect.y+h*.22); context.stroke(); context.restore(); return; }
  if (kind === 'l-shape') { drawPolygon([{x:rect.x,y:rect.y},{x:rect.x+w*.38,y:rect.y},{x:rect.x+w*.38,y:rect.y+h*.62},{x:rect.x+w,y:rect.y+h*.62},{x:rect.x+w,y:rect.y+h},{x:rect.x,y:rect.y+h}]); context.restore(); return; }
  if (kind === 'u-shape') { drawPolygon([{x:rect.x,y:rect.y},{x:rect.x+w*.3,y:rect.y},{x:rect.x+w*.3,y:rect.y+h*.7},{x:rect.x+w*.7,y:rect.y+h*.7},{x:rect.x+w*.7,y:rect.y},{x:rect.x+w,y:rect.y},{x:rect.x+w,y:rect.y+h},{x:rect.x,y:rect.y+h}]); context.restore(); return; }

  if (kind === 'flow-data') { drawPolygon([{x:rect.x+w*.18,y:rect.y},{x:rect.x+w,y:rect.y},{x:rect.x+w*.82,y:rect.y+h},{x:rect.x,y:rect.y+h}]); context.restore(); return; }
  if (kind === 'flow-document') { context.beginPath(); context.moveTo(rect.x, rect.y); context.lineTo(rect.x+w, rect.y); context.lineTo(rect.x+w, rect.y+h*.82); context.quadraticCurveTo(rect.x+w*.72, rect.y+h*1.08, rect.x+w*.5, rect.y+h*.86); context.quadraticCurveTo(rect.x+w*.28, rect.y+h*.64, rect.x, rect.y+h*.86); context.closePath(); simpleStrokeAndFill(); context.restore(); return; }
  if (kind === 'flow-multidocument') { context.strokeRect(rect.x+w*.07, rect.y, w*.86, h*.82); context.strokeRect(rect.x, rect.y+h*.12, w*.86, h*.82); context.restore(); return; }

  if (kind.startsWith('arrow-') || kind.startsWith('callout-')) {
    if (kind === 'arrow-left') drawRightArrow(context, rect, Math.PI);
    else if (kind === 'arrow-up') drawRightArrow(context, rect, -Math.PI/2);
    else if (kind === 'arrow-down') drawRightArrow(context, rect, Math.PI/2);
    else if (kind === 'arrow-left-right') drawDoubleArrowHorizontal(context, rect, 0);
    else if (kind === 'arrow-up-down') drawDoubleArrowHorizontal(context, rect, Math.PI/2);
    else if (kind === 'arrow-quad') drawPolygon(starPolygon(rect, 4, .35));
    else if (kind === 'arrow-bent') { context.beginPath(); context.moveTo(rect.x+w*.2, rect.y+h*.2); context.lineTo(rect.x+w*.2, rect.y+h*.65); context.lineTo(rect.x+w*.78, rect.y+h*.65); context.stroke(); drawShapeText(context,{...rect,width:w,height:h},'➜',shape.color); context.restore(); return; }
    else if (kind === 'arrow-uturn') { context.beginPath(); context.arc(rect.x+w*.45, rect.y+h*.55, Math.min(w,h)*.28, Math.PI*.15, Math.PI*1.7); context.stroke(); drawShapeText(context, rect, '↩', shape.color); context.restore(); return; }
    else if (kind === 'chevron') drawPolygon([{x:rect.x,y:rect.y+h*.15},{x:rect.x+w*.55,y:rect.y+h*.5},{x:rect.x,y:rect.y+h*.85},{x:rect.x+w*.35,y:rect.y+h*.85},{x:rect.x+w,y:rect.y+h*.5},{x:rect.x+w*.35,y:rect.y+h*.15}]);
    else if (kind === 'arrow-pentagon') drawPolygon([{x:rect.x,y:rect.y},{x:rect.x+w*.72,y:rect.y},{x:rect.x+w,y:rect.y+h*.5},{x:rect.x+w*.72,y:rect.y+h},{x:rect.x,y:rect.y+h}]);
    else if (kind === 'arrow-striped-right') { drawRightArrow(context, rect, 0); context.stroke(); context.beginPath(); context.moveTo(rect.x+w*.06, rect.y+h*.25); context.lineTo(rect.x+w*.16, rect.y+h*.25); context.moveTo(rect.x+w*.06, rect.y+h*.5); context.lineTo(rect.x+w*.18, rect.y+h*.5); context.moveTo(rect.x+w*.06, rect.y+h*.75); context.lineTo(rect.x+w*.16, rect.y+h*.75); }
    else if (kind.includes('curved')) { const symbol = kind.endsWith('left') ? '↶' : kind.endsWith('up') ? '⤴' : kind.endsWith('down') ? '⤵' : '↷'; drawShapeText(context, rect, symbol, shape.color); context.restore(); return; }
    else if (kind.startsWith('callout-') && ['callout-rect','callout-round','callout-oval'].includes(kind) === false) {
      roundedRectPath(context, rect.x, rect.y+h*.12, w*.68, h*.76, 10); context.stroke();
      const arrowKind = kind.replace('callout-', 'arrow-'); drawShape(context, { ...shape, kind: arrowKind, x: rect.x+w*.48, y: rect.y+h*.22, width: w*.5, height: h*.56 }); context.restore(); return;
    }
    else drawRightArrow(context, rect, 0);
    simpleStrokeAndFill(); context.restore(); return;
  }

  if (kind === 'callout-rect' || kind === 'callout-round') { roundedRectPath(context, rect.x, rect.y, w, h*.78, kind === 'callout-round' ? 18 : 3); context.moveTo(rect.x+w*.28, rect.y+h*.78); context.lineTo(rect.x+w*.18, rect.y+h); context.lineTo(rect.x+w*.44, rect.y+h*.78); simpleStrokeAndFill(); context.restore(); return; }
  if (kind === 'callout-oval') { context.beginPath(); context.ellipse(rect.x+w/2, rect.y+h*.42, w/2, h*.4, 0, 0, Math.PI*2); context.moveTo(rect.x+w*.3, rect.y+h*.72); context.lineTo(rect.x+w*.2, rect.y+h); context.lineTo(rect.x+w*.44, rect.y+h*.78); simpleStrokeAndFill(); context.restore(); return; }

  const starMatch = kind.match(/^star-(\d+)$/);
  if (starMatch) { drawPolygon(starPolygon(rect, Number(starMatch[1]), .45)); context.restore(); return; }
  if (kind === 'burst-1' || kind === 'burst-2') { drawPolygon(starPolygon(rect, kind === 'burst-1' ? 14 : 20, kind === 'burst-1' ? .55 : .35)); context.restore(); return; }
  if (kind === 'scroll-vertical' || kind === 'scroll-horizontal') { roundedRectPath(context, rect.x, rect.y, w, h, Math.min(w,h)*.15); context.stroke(); context.beginPath(); context.moveTo(rect.x+w*.2, rect.y+h*.18); context.lineTo(rect.x+w*.8, rect.y+h*.18); context.moveTo(rect.x+w*.2, rect.y+h*.82); context.lineTo(rect.x+w*.8, rect.y+h*.82); context.stroke(); context.restore(); return; }
  if (kind === 'ribbon-up' || kind === 'ribbon-down') { const notchY = kind === 'ribbon-up' ? rect.y : rect.y + h; drawPolygon([{x:rect.x,y:rect.y},{x:rect.x+w,y:rect.y},{x:rect.x+w,y:rect.y+h},{x:rect.x+w*.5,y:notchY === rect.y ? rect.y+h*.72 : rect.y+h*.28},{x:rect.x,y:rect.y+h}]); context.restore(); return; }
  const equationMap: Record<string, string> = { 'equation-plus': '+', 'equation-minus': '−', 'equation-multiply': '×', 'equation-divide': '÷', 'equation-equals': '=', 'equation-not-equal': '≠' };
  if (equationMap[kind]) { context.strokeRect(rect.x, rect.y, w, h); drawShapeText(context, rect, equationMap[kind], shape.color); context.restore(); return; }
  if (kind === 'elbow-connector') { context.beginPath(); context.moveTo(rect.x, rect.y); context.lineTo(rect.x+w*.5, rect.y); context.lineTo(rect.x+w*.5, rect.y+h); context.lineTo(rect.x+w, rect.y+h); context.stroke(); context.restore(); return; }
  if (kind === 'curved-connector' || kind === 'curve') { context.beginPath(); context.moveTo(rect.x, rect.y+h*.8); context.bezierCurveTo(rect.x+w*.25, rect.y, rect.x+w*.75, rect.y+h, rect.x+w, rect.y+h*.2); context.stroke(); context.restore(); return; }
  if (kind === 'polyline') { context.beginPath(); context.moveTo(rect.x, rect.y+h*.8); context.lineTo(rect.x+w*.35, rect.y+h*.25); context.lineTo(rect.x+w*.65, rect.y+h*.65); context.lineTo(rect.x+w, rect.y+h*.15); context.stroke(); context.restore(); return; }
  if (kind === 'scribble') { context.beginPath(); for (let i=0;i<24;i+=1) { const x=rect.x+(w*i/23); const y=rect.y+h*.5+Math.sin(i*1.45)*h*.22; if(i===0) context.moveTo(x,y); else context.lineTo(x,y);} context.stroke(); context.restore(); return; }

  context.strokeRect(rect.x, rect.y, w, h);
  context.restore();
}

type RenderableElement =
  | { type: 'image'; z: number; item: ImageBox }
  | { type: 'mathPlane'; z: number; item: MathPlaneBox }
  | { type: 'stroke'; z: number; item: Stroke }
  | { type: 'shape'; z: number; item: ShapeBox }
  | { type: 'text'; z: number; item: TextBox };

function orderedElements(annotations: PageAnnotations, includeText = true): RenderableElement[] {
  const items: RenderableElement[] = [
    ...annotations.imageBoxes.map((item) => ({ type: 'image' as const, z: item.z || 0, item })),
    ...annotations.mathPlaneBoxes.map((item) => ({ type: 'mathPlane' as const, z: item.z || 0, item })),
    ...annotations.strokes.map((item) => ({ type: 'stroke' as const, z: item.z || 0, item })),
    ...annotations.shapeBoxes.map((item) => ({ type: 'shape' as const, z: item.z || 0, item }))
  ];
  if (includeText) items.push(...annotations.textBoxes.map((item) => ({ type: 'text' as const, z: item.z || 0, item })));
  return items.sort((a, b) => a.z - b.z);
}

const imageElementCache = new Map<string, Promise<HTMLImageElement>>();

function getCachedImage(src: string): Promise<HTMLImageElement> {
  let cached = imageElementCache.get(src);
  if (!cached) {
    cached = loadImageElement(src);
    imageElementCache.set(src, cached);
  }
  return cached;
}

async function drawRetainedElements(
  context: CanvasRenderingContext2D,
  annotations: PageAnnotations,
  scale: number,
  options: { draftStroke?: Stroke | null; draftShape?: ShapeBox | null; includeText?: boolean } = {}
) {
  context.save();
  context.setTransform(scale, 0, 0, scale, 0, 0);

  const draftItems: RenderableElement[] = [];
  if (options.draftStroke) draftItems.push({ type: 'stroke', z: options.draftStroke.z || nextZIndex(annotations), item: options.draftStroke });
  if (options.draftShape) draftItems.push({ type: 'shape', z: options.draftShape.z || nextZIndex(annotations), item: options.draftShape });

  const items = [...orderedElements(annotations, options.includeText ?? false), ...draftItems].sort((a, b) => a.z - b.z);
  for (const entry of items) {
    if (entry.type === 'image') {
      try {
        const image = await getCachedImage(entry.item.dataUrl);
        drawImageBoxOnContext(context, image, entry.item);
      } catch (error) {
        console.warn('Could not draw image:', error);
      }
    } else if (entry.type === 'stroke') {
      drawStroke(context, entry.item);
    } else if (entry.type === 'mathPlane') {
      drawMathPlaneOnContext(context, entry.item);
    } else if (entry.type === 'shape') {
      drawShape(context, entry.item);
    } else if (entry.type === 'text') {
      drawSingleTextBox(context, entry.item);
    }
  }

  context.restore();
}

function drawImageBoxOnContext(context: CanvasRenderingContext2D, image: HTMLImageElement | HTMLCanvasElement, box: ImageBox) {
  const rotation = ((box.rotation || 0) % 360 + 360) % 360;
  context.save();
  if (rotation) {
    context.translate(box.x + box.width / 2, box.y + box.height / 2);
    context.rotate((rotation * Math.PI) / 180);
    context.drawImage(image, -box.width / 2, -box.height / 2, box.width, box.height);
  } else {
    context.drawImage(image, box.x, box.y, box.width, box.height);
  }
  context.restore();
}

function forEachMathPlaneGridValue(min: number, max: number, spacing: number, callback: (value: number) => void) {
  const safeSpacing = Math.max(0.1, Math.abs(spacing || 1));
  const start = Math.ceil(min / safeSpacing) * safeSpacing;
  for (let value = start; value <= max + safeSpacing * 0.001; value += safeSpacing) {
    callback(Number(value.toFixed(6)));
  }
}

function getMathPlaneCoordinate(plane: MathPlaneBox, x: number, y: number) {
  const xSpan = Math.max(0.0001, plane.xMax - plane.xMin);
  const ySpan = Math.max(0.0001, plane.yMax - plane.yMin);
  return {
    x: plane.x + ((x - plane.xMin) / xSpan) * plane.width,
    y: plane.y + plane.height - ((y - plane.yMin) / ySpan) * plane.height
  };
}

function drawMathPlaneOnContext(context: CanvasRenderingContext2D, plane: MathPlaneBox) {
  context.save();
  context.beginPath();
  context.rect(plane.x, plane.y, plane.width, plane.height);
  context.clip();

  context.strokeStyle = plane.gridColor;
  context.lineWidth = 1;
  if (plane.gridStyle !== 'none') {
    if (plane.gridStyle === 'dotted') context.setLineDash([1, 7]);
    forEachMathPlaneGridValue(plane.xMin, plane.xMax, plane.gridSpacing, (value) => {
      const point = getMathPlaneCoordinate(plane, value, plane.yMin);
      context.beginPath();
      context.moveTo(point.x, plane.y);
      context.lineTo(point.x, plane.y + plane.height);
      context.stroke();
    });
    forEachMathPlaneGridValue(plane.yMin, plane.yMax, plane.gridSpacing, (value) => {
      const point = getMathPlaneCoordinate(plane, plane.xMin, value);
      context.beginPath();
      context.moveTo(plane.x, point.y);
      context.lineTo(plane.x + plane.width, point.y);
      context.stroke();
    });
    context.setLineDash([]);
  }

  const origin = getMathPlaneCoordinate(plane, 0, 0);
  const xAxisY = clamp(origin.y, plane.y, plane.y + plane.height);
  const yAxisX = clamp(origin.x, plane.x, plane.x + plane.width);
  context.strokeStyle = plane.axisColor;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(plane.x, xAxisY);
  context.lineTo(plane.x + plane.width, xAxisY);
  context.moveTo(yAxisX, plane.y);
  context.lineTo(yAxisX, plane.y + plane.height);
  context.stroke();

  if (plane.showTickMarks || plane.showAxisLabels) {
    context.fillStyle = plane.axisColor;
    context.font = '11px Arial, sans-serif';
    context.textBaseline = 'top';
    forEachMathPlaneGridValue(plane.xMin, plane.xMax, plane.gridSpacing, (value) => {
      const point = getMathPlaneCoordinate(plane, value, 0);
      if (plane.showTickMarks) {
        context.beginPath();
        context.moveTo(point.x, xAxisY - 4);
        context.lineTo(point.x, xAxisY + 4);
        context.stroke();
      }
      if (plane.showAxisLabels && Math.abs(value) > 0.0001) context.fillText(String(value), point.x + 3, clamp(xAxisY + 5, plane.y + 2, plane.y + plane.height - 14));
    });
    forEachMathPlaneGridValue(plane.yMin, plane.yMax, plane.gridSpacing, (value) => {
      const point = getMathPlaneCoordinate(plane, 0, value);
      if (plane.showTickMarks) {
        context.beginPath();
        context.moveTo(yAxisX - 4, point.y);
        context.lineTo(yAxisX + 4, point.y);
        context.stroke();
      }
      if (plane.showAxisLabels && Math.abs(value) > 0.0001) context.fillText(String(value), clamp(yAxisX + 5, plane.x + 2, plane.x + plane.width - 22), point.y + 3);
    });
  }

  context.strokeStyle = plane.axisColor;
  context.lineWidth = 1.5;
  context.strokeRect(plane.x, plane.y, plane.width, plane.height);
  context.restore();
}

function formatMathPlaneLabel(value: number) {
  return Math.abs(value - Math.round(value)) < 0.0001 ? String(Math.round(value)) : String(Number(value.toFixed(2)));
}

function pdfRgb(value: string) {
  const colour = hexToRgb(value) || { r: 17, g: 24, b: 39 };
  return rgb(colour.r / 255, colour.g / 255, colour.b / 255);
}

function canvasYToPdfY(totalHeight: number, y: number) {
  return totalHeight - y;
}

function drawPdfCanvasLine(pdfPage: PDFPage, totalHeight: number, start: Point, end: Point, colour: string, thickness: number, dashed = false) {
  pdfPage.drawLine({
    start: { x: start.x, y: canvasYToPdfY(totalHeight, start.y) },
    end: { x: end.x, y: canvasYToPdfY(totalHeight, end.y) },
    color: pdfRgb(colour),
    thickness,
    dashArray: dashed ? [1, 6] : undefined
  });
}

function drawMathPlaneOnPdfPage(pdfPage: PDFPage, plane: MathPlaneBox, totalHeight: number, font: PDFFont) {
  const dashed = plane.gridStyle === 'dotted';
  if (plane.gridStyle !== 'none') {
    forEachMathPlaneGridValue(plane.xMin, plane.xMax, plane.gridSpacing, (value) => {
      const point = getMathPlaneCoordinate(plane, value, plane.yMin);
      drawPdfCanvasLine(pdfPage, totalHeight, { x: point.x, y: plane.y }, { x: point.x, y: plane.y + plane.height }, plane.gridColor, 0.8, dashed);
    });
    forEachMathPlaneGridValue(plane.yMin, plane.yMax, plane.gridSpacing, (value) => {
      const point = getMathPlaneCoordinate(plane, plane.xMin, value);
      drawPdfCanvasLine(pdfPage, totalHeight, { x: plane.x, y: point.y }, { x: plane.x + plane.width, y: point.y }, plane.gridColor, 0.8, dashed);
    });
  }

  const origin = getMathPlaneCoordinate(plane, 0, 0);
  const xAxisY = clamp(origin.y, plane.y, plane.y + plane.height);
  const yAxisX = clamp(origin.x, plane.x, plane.x + plane.width);
  drawPdfCanvasLine(pdfPage, totalHeight, { x: plane.x, y: xAxisY }, { x: plane.x + plane.width, y: xAxisY }, plane.axisColor, 1.6);
  drawPdfCanvasLine(pdfPage, totalHeight, { x: yAxisX, y: plane.y }, { x: yAxisX, y: plane.y + plane.height }, plane.axisColor, 1.6);

  if (plane.showTickMarks || plane.showAxisLabels) {
    forEachMathPlaneGridValue(plane.xMin, plane.xMax, plane.gridSpacing, (value) => {
      const point = getMathPlaneCoordinate(plane, value, 0);
      if (plane.showTickMarks) drawPdfCanvasLine(pdfPage, totalHeight, { x: point.x, y: xAxisY - 4 }, { x: point.x, y: xAxisY + 4 }, plane.axisColor, 1);
      if (plane.showAxisLabels && Math.abs(value) > 0.0001) {
        const labelTop = clamp(xAxisY + 5, plane.y + 2, plane.y + plane.height - 14);
        pdfPage.drawText(formatMathPlaneLabel(value), {
          x: point.x + 3,
          y: canvasYToPdfY(totalHeight, labelTop + 10),
          size: 8,
          font,
          color: pdfRgb(plane.axisColor)
        });
      }
    });
    forEachMathPlaneGridValue(plane.yMin, plane.yMax, plane.gridSpacing, (value) => {
      const point = getMathPlaneCoordinate(plane, 0, value);
      if (plane.showTickMarks) drawPdfCanvasLine(pdfPage, totalHeight, { x: yAxisX - 4, y: point.y }, { x: yAxisX + 4, y: point.y }, plane.axisColor, 1);
      if (plane.showAxisLabels && Math.abs(value) > 0.0001) {
        const labelX = clamp(yAxisX + 5, plane.x + 2, plane.x + plane.width - 22);
        pdfPage.drawText(formatMathPlaneLabel(value), {
          x: labelX,
          y: canvasYToPdfY(totalHeight, point.y + 12),
          size: 8,
          font,
          color: pdfRgb(plane.axisColor)
        });
      }
    });
  }

  drawPdfCanvasLine(pdfPage, totalHeight, { x: plane.x, y: plane.y }, { x: plane.x + plane.width, y: plane.y }, plane.axisColor, 1.1);
  drawPdfCanvasLine(pdfPage, totalHeight, { x: plane.x + plane.width, y: plane.y }, { x: plane.x + plane.width, y: plane.y + plane.height }, plane.axisColor, 1.1);
  drawPdfCanvasLine(pdfPage, totalHeight, { x: plane.x + plane.width, y: plane.y + plane.height }, { x: plane.x, y: plane.y + plane.height }, plane.axisColor, 1.1);
  drawPdfCanvasLine(pdfPage, totalHeight, { x: plane.x, y: plane.y + plane.height }, { x: plane.x, y: plane.y }, plane.axisColor, 1.1);
}

function drawTextBoxBackground(context: CanvasRenderingContext2D, box: TextBox, padding = 0) {
  if (!box.backgroundColor || box.backgroundColor === 'transparent') return;
  context.save();
  context.fillStyle = box.backgroundColor;
  const radius = 8;
  const x = box.x - padding;
  const y = box.y - padding;
  const w = box.width + padding * 2;
  const h = box.minHeight + padding * 2;
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + w - radius, y);
  context.quadraticCurveTo(x + w, y, x + w, y + radius);
  context.lineTo(x + w, y + h - radius);
  context.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  context.lineTo(x + radius, y + h);
  context.quadraticCurveTo(x, y + h, x, y + h - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.fill();
  context.restore();
}

function drawSingleTextBox(context: CanvasRenderingContext2D, box: TextBox) {
  if (!box.text.trim()) return;
  drawTextBoxBackground(context, box, 0);
  context.fillStyle = box.color;
  context.textBaseline = 'top';
  context.font = `${box.fontWeight || '400'} ${box.fontSize}px "${box.fontFamily}", Arial, sans-serif`;
  const padding = 6;
  const lineHeight = box.fontSize * 1.35;
  const lines = lineWrapText(context, box.text, Math.max(30, box.width - padding * 2));
  lines.forEach((line, index) => {
    context.fillText(line, box.x + padding, box.y + padding + index * lineHeight);
  });
}

function drawLassoPath(context: CanvasRenderingContext2D, points: Point[], scale: number) {
  if (points.length < 2) return;
  context.save();
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.strokeStyle = '#3388FF';
  context.fillStyle = 'rgba(51, 136, 255, 0.08)';
  context.lineWidth = 1.5;
  context.setLineDash([8, 6]);
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) context.lineTo(point.x, point.y);
  context.closePath();
  context.fill();
  context.stroke();
  context.restore();
}

function pointInPolygon(point: Point, polygon: Point[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y)) &&
      (point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || 0.00001) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}


function polygonBounds(points: Point[]): { x: number; y: number; width: number; height: number } | null {
  if (!points.length) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(1, Math.max(...xs) - x), height: Math.max(1, Math.max(...ys) - y) };
}

function rectCorners(rect: { x: number; y: number; width: number; height: number }): Point[] {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height }
  ];
}

function orientation(a: Point, b: Point, c: Point) {
  return (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  return (o1 === 0 || o2 === 0 || Math.sign(o1) !== Math.sign(o2)) && (o3 === 0 || o4 === 0 || Math.sign(o3) !== Math.sign(o4));
}

function segmentIntersectsPolygon(a: Point, b: Point, polygon: Point[]) {
  for (let i = 0; i < polygon.length; i += 1) {
    const next = (i + 1) % polygon.length;
    if (segmentsIntersect(a, b, polygon[i], polygon[next])) return true;
  }
  return false;
}

function rectIntersectsPolygon(rect: { x: number; y: number; width: number; height: number }, polygon: Point[]) {
  const corners = rectCorners(rect);
  if (corners.some((corner) => pointInPolygon(corner, polygon))) return true;
  if (pointInPolygon({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }, polygon)) return true;
  const polygonBoundsRect = polygonBounds(polygon);
  if (!polygonBoundsRect) return false;
  const rectContainsPolygonPoint = polygon.some((point) => point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height);
  if (rectContainsPolygonPoint) return true;
  for (let i = 0; i < corners.length; i += 1) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    if (segmentIntersectsPolygon(a, b, polygon)) return true;
  }
  return false;
}

function rectsIntersect(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x <= b.x + b.width
    && a.x + a.width >= b.x
    && a.y <= b.y + b.height
    && a.y + a.height >= b.y;
}

function strokeIntersectsRect(stroke: Stroke, rect: { x: number; y: number; width: number; height: number }) {
  if (stroke.points.some((point) => point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height)) return true;
  return rectsIntersect(strokeBounds(stroke), rect);
}

function strokeIntersectsLasso(stroke: Stroke, polygon: Point[]) {
  if (stroke.points.some((point) => pointInPolygon(point, polygon))) return true;
  for (let i = 1; i < stroke.points.length; i += 1) {
    if (segmentIntersectsPolygon(stroke.points[i - 1], stroke.points[i], polygon)) return true;
  }
  return rectIntersectsPolygon(strokeBounds(stroke), polygon);
}

function selectElementsInsideLasso(annotations: PageAnnotations, polygon: Point[], filter: LassoFilter = 'all') {
  if (polygon.length < 2) return [];
  const bounds = polygonBounds(polygon);
  if (!bounds) return [];
  const canUsePolygon = polygon.length >= 3;
  const wants = (kind: ElementKind) => filter === 'all'
    || (filter === 'handwriting' && kind === 'stroke')
    || (filter === 'images' && (kind === 'image' || kind === 'mathPlane'))
    || (filter === 'text' && kind === 'text')
    || (filter === 'shapes' && kind === 'shape');
  const collect = (usePolygon: boolean) => {
    const keys: string[] = [];
    const addIfIntersecting = (kind: ElementKind, id: string, itemBounds: { x: number; y: number; width: number; height: number }) => {
      if (!wants(kind)) return;
      const intersects = usePolygon ? rectIntersectsPolygon(itemBounds, polygon) : rectsIntersect(itemBounds, bounds);
      if (intersects) keys.push(elementKey(kind, id));
    };

    if (wants('stroke')) {
      for (const stroke of annotations.strokes) {
        const intersects = usePolygon ? strokeIntersectsLasso(stroke, polygon) : strokeIntersectsRect(stroke, bounds);
        if (intersects) keys.push(elementKey('stroke', stroke.id));
      }
    }
    for (const image of annotations.imageBoxes) addIfIntersecting('image', image.id, { x: image.x, y: image.y, width: image.width, height: image.height });
    for (const plane of annotations.mathPlaneBoxes) addIfIntersecting('mathPlane', plane.id, { x: plane.x, y: plane.y, width: plane.width, height: plane.height });
    for (const text of annotations.textBoxes) addIfIntersecting('text', text.id, { x: text.x, y: text.y, width: text.width, height: Math.max(text.minHeight, 40) });
    for (const shape of annotations.shapeBoxes) addIfIntersecting('shape', shape.id, normaliseRect(shape.x, shape.y, shape.width, shape.height));
    return Array.from(new Set(keys));
  };

  const polygonMatches = canUsePolygon ? collect(true) : [];
  return polygonMatches.length ? polygonMatches : collect(false);
}

function drawStrokes(context: CanvasRenderingContext2D, strokes: Stroke[], scale: number, draftStroke?: Stroke | null) {
  context.save();
  context.setTransform(scale, 0, 0, scale, 0, 0);
  for (const stroke of strokes) drawStroke(context, stroke);
  if (draftStroke) drawStroke(context, draftStroke);
  context.restore();
}

function sortedSpacers(spacers: PageSpacer[]) {
  return [...(spacers || [])].sort((a, b) => (a.y - b.y) || ((a.order ?? 0) - (b.order ?? 0)));
}

function totalSpacerHeight(spacers: PageSpacer[]): number {
  return (spacers || []).reduce((sum, spacer) => sum + spacer.height, 0);
}

function sourceYToVisualY(sourceY: number, spacers: PageSpacer[]): number {
  let visualY = sourceY;
  for (const spacer of sortedSpacers(spacers)) {
    if (spacer.y < sourceY) visualY += spacer.height;
  }
  return visualY;
}

function visualYToSourceY(visualY: number, spacers: PageSpacer[]): number {
  let cumulative = 0;
  for (const spacer of sortedSpacers(spacers)) {
    const visualStart = spacer.y + cumulative;
    const visualEnd = visualStart + spacer.height;

    if (visualY < visualStart) return Math.max(0, visualY - cumulative);
    if (visualY >= visualStart && visualY <= visualEnd) return spacer.y;
    cumulative += spacer.height;
  }

  return Math.max(0, visualY - cumulative);
}

function findSpacerAtVisualY(spacers: PageSpacer[], visualY: number) {
  let cumulative = 0;
  const ordered = sortedSpacers(spacers);
  for (let index = 0; index < ordered.length; index += 1) {
    const spacer = ordered[index];
    const visualStart = spacer.y + cumulative;
    const visualEnd = visualStart + spacer.height;
    if (visualY >= visualStart && visualY <= visualEnd) {
      return { spacer, index, visualStart, visualEnd, offset: clamp(visualY - visualStart, 0, spacer.height) };
    }
    cumulative += spacer.height;
  }
  return null;
}

function normaliseSpacerOrder(spacers: PageSpacer[]) {
  return sortedSpacers(spacers).map((spacer, index) => ({ ...spacer, order: index }));
}

function splitAndShiftStrokeAfterY(stroke: Stroke, y: number, delta: number): Stroke[] {
  if (stroke.points.length === 0) return [stroke];

  const shiftedPoint = (point: Point): Point => (point.y > y ? { ...point, y: point.y + delta } : { ...point });
  const sideOf = (point: Point) => (point.y > y ? 'below' as const : 'above' as const);
  const makeIntersection = (from: Point, to: Point): Point => {
    const dy = to.y - from.y;
    const ratio = Math.abs(dy) < 0.0001 ? 0 : clamp((y - from.y) / dy, 0, 1);
    const pressure = typeof from.pressure === 'number' || typeof to.pressure === 'number'
      ? (from.pressure ?? 0.5) + ((to.pressure ?? from.pressure ?? 0.5) - (from.pressure ?? 0.5)) * ratio
      : undefined;
    return { x: from.x + (to.x - from.x) * ratio, y, ...(pressure === undefined ? {} : { pressure }) };
  };

  const segments: Point[][] = [];
  let current: Point[] = [shiftedPoint(stroke.points[0])];
  let currentSide = sideOf(stroke.points[0]);
  let crossed = false;

  for (let index = 1; index < stroke.points.length; index += 1) {
    const previous = stroke.points[index - 1];
    const next = stroke.points[index];
    const nextSide = sideOf(next);

    if (nextSide === currentSide) {
      current.push(shiftedPoint(next));
      continue;
    }

    crossed = true;
    const intersection = makeIntersection(previous, next);
    const previousBoundary = currentSide === 'below' ? { ...intersection, y: intersection.y + delta } : intersection;
    current.push(previousBoundary);
    if (current.length >= 2) segments.push(current);

    const nextBoundary = nextSide === 'below' ? { ...intersection, y: intersection.y + delta } : intersection;
    current = [nextBoundary, shiftedPoint(next)];
    currentSide = nextSide;
  }

  if (current.length >= 2) segments.push(current);

  if (!crossed) {
    return [{ ...stroke, points: stroke.points.map(shiftedPoint) }];
  }

  return segments.map((points, index) => ({
    ...stroke,
    id: index === 0 ? stroke.id : `${stroke.id}-space-${makeId()}-${index}`,
    points
  }));
}


function snapTextYToRule(page: NotebookPage | null, y: number, fontSize: number) {
  if (!page || page.kind !== 'blank' || page.template !== 'ruled') return y;
  const lineGap = 46;
  const firstLine = 46;
  const paddingTop = 8;
  const baselineOffset = paddingTop + fontSize * 0.9;
  const targetBaseline = Math.max(firstLine, Math.round((y + baselineOffset - firstLine) / lineGap) * lineGap + firstLine);
  return Math.max(8, targetBaseline - baselineOffset);
}

function shiftAnnotationsAfterY(annotations: PageAnnotations, y: number, delta: number): PageAnnotations {
  return {
    strokes: annotations.strokes.flatMap((stroke) => splitAndShiftStrokeAfterY(stroke, y, delta)),
    textBoxes: annotations.textBoxes.map((box) => (box.y > y ? { ...box, y: box.y + delta } : box)),
    imageBoxes: annotations.imageBoxes.map((box) => (box.y > y ? { ...box, y: box.y + delta } : box)),
    mathPlaneBoxes: annotations.mathPlaneBoxes.map((plane) => (plane.y > y ? { ...plane, y: plane.y + delta } : plane)),
    shapeBoxes: annotations.shapeBoxes.map((shape) => (shape.y > y ? { ...shape, y: shape.y + delta } : shape))
  };
}

function lineWrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const paragraphs = text.split('\n');
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }

    let line = words[0];
    for (let i = 1; i < words.length; i += 1) {
      const testLine = `${line} ${words[i]}`;
      if (context.measureText(testLine).width <= maxWidth) {
        line = testLine;
      } else {
        lines.push(line);
        line = words[i];
      }
    }
    lines.push(line);
  }

  return lines;
}

function drawTextBoxes(context: CanvasRenderingContext2D, boxes: TextBox[], scale: number) {
  context.save();
  context.setTransform(scale, 0, 0, scale, 0, 0);

  for (const box of boxes) {
    if (!box.text.trim()) continue;
    drawTextBoxBackground(context, box, 0);
    context.fillStyle = box.color;
    context.textBaseline = 'top';
    context.font = `${box.fontWeight || '400'} ${box.fontSize}px "${box.fontFamily}", Arial, sans-serif`;

    const padding = 6;
    const lineHeight = box.fontSize * 1.35;
    const lines = lineWrapText(context, box.text, Math.max(30, box.width - padding * 2));
    lines.forEach((line, index) => {
      context.fillText(line, box.x + padding, box.y + padding + index * lineHeight);
    });
  }

  context.restore();
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load image.'));
    image.src = src;
  });
}

async function convertImageFileToPngDataUrl(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('Could not read image file.'));
    reader.readAsDataURL(file);
  });

  const image = await loadImageElement(rawDataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width || 1;
  canvas.height = image.naturalHeight || image.height || 1;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create image conversion canvas.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
}

async function drawImageBoxes(context: CanvasRenderingContext2D, boxes: ImageBox[], scale: number) {
  context.save();
  context.setTransform(scale, 0, 0, scale, 0, 0);
  for (const box of boxes) {
    try {
      const image = await loadImageElement(box.dataUrl);
      drawImageBoxOnContext(context, image, box);
    } catch (error) {
      console.warn('Could not draw image box:', error);
    }
  }
  context.restore();
}

function createTransparentCanvas(width: number, height: number, scale: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width * scale));
  canvas.height = Math.max(1, Math.ceil(height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create transparent canvas.');
  context.clearRect(0, 0, canvas.width, canvas.height);
  return { canvas, context };
}

function drawBlankPaper(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  scale: number,
  theme: NoteTheme,
  template: BlankPageTemplate
) {
  context.save();
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.fillStyle = theme.background;
  context.fillRect(0, 0, width, height);

  if (template === 'plain') {
    context.restore();
    return;
  }

  context.strokeStyle = `rgba(${theme.accentRgb}, ${theme.id === 'cyberpunk' ? 0.35 : 0.46})`;
  context.lineWidth = 1;

  if (template === 'grid') {
    for (let x = 40; x < width; x += 40) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
    for (let y = 40; y < height; y += 40) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }
  } else if (template === 'cornell') {
    for (let y = 92; y < height - 150; y += 46) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }
    context.strokeStyle = `rgba(${theme.textRgb}, 0.22)`;
    context.beginPath();
    context.moveTo(220, 0);
    context.lineTo(220, Math.max(0, height - 150));
    context.moveTo(0, Math.max(0, height - 150));
    context.lineTo(width, Math.max(0, height - 150));
    context.stroke();
    context.fillStyle = `rgba(${theme.textRgb}, 0.42)`;
    context.font = '600 16px Arial, sans-serif';
    context.fillText('Cues', 24, 42);
    context.fillText('Notes', 244, 42);
    context.fillText('Summary', 24, Math.max(28, height - 110));
  } else {
    for (let y = 46; y < height; y += 46) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }
    context.strokeStyle = `rgba(${theme.textRgb}, 0.2)`;
    context.beginPath();
    context.moveTo(72, 0);
    context.lineTo(72, height);
    context.stroke();
  }

  context.restore();
}

async function paintPageBackground(
  canvas: HTMLCanvasElement,
  page: NotebookPage,
  pdfDoc: any | null,
  scale: number,
  theme: NoteTheme
): Promise<{ width: number; baseHeight: number; totalHeight: number }> {
  let width = DEFAULT_BLANK_WIDTH;
  let baseHeight = DEFAULT_BLANK_HEIGHT;
  let sourceCanvas: HTMLCanvasElement | null = null;
  let pdfRotation = 0;

  if (page.kind === 'pdf') {
    if (!pdfDoc) throw new Error('PDF is not loaded.');
    const pdfPage = await pdfDoc.getPage(page.sourcePage);
    const viewport = pdfPage.getViewport({ scale: 1 });
    pdfRotation = page.rotation || 0;
    const rotatedPdf = pdfRotation === 90 || pdfRotation === 270;
    const crop = page.crop || { top: 0, right: 0, bottom: 0, left: 0 };
    const rawWidth = rotatedPdf ? viewport.height : viewport.width;
    const rawHeight = rotatedPdf ? viewport.width : viewport.height;
    width = Math.max(220, rawWidth - (rotatedPdf ? 0 : crop.left + crop.right));
    baseHeight = Math.max(220, rawHeight - (rotatedPdf ? 0 : crop.top + crop.bottom));

    const renderedViewport = pdfPage.getViewport({ scale });
    sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = Math.ceil(renderedViewport.width);
    sourceCanvas.height = Math.ceil(renderedViewport.height);
    const sourceContext = sourceCanvas.getContext('2d');
    if (!sourceContext) throw new Error('Could not create PDF render context.');
    await pdfPage.render({ canvasContext: sourceContext, viewport: renderedViewport }).promise;
  } else {
    width = page.width;
    baseHeight = page.height;
  }

  const totalHeight = baseHeight + (page.extraSpace || 0) + totalSpacerHeight(page.spacers || []);
  canvas.width = Math.max(1, Math.ceil(width * scale));
  canvas.height = Math.max(1, Math.ceil(totalHeight * scale));

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create page context.');
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = theme.background;
  context.fillRect(0, 0, canvas.width, canvas.height);

  if (page.kind === 'blank') {
    drawBlankPaper(context, width, totalHeight, scale, theme, page.template || 'ruled');
  }

  if (page.kind === 'pdf' && sourceCanvas) {
    const pdfSpacers = sortedSpacers(page.spacers || []);
    const rotatedPdf = pdfRotation === 90 || pdfRotation === 270;
    if (rotatedPdf && pdfSpacers.length === 0) {
      context.save();
      if (pdfRotation === 90) {
        context.translate(width * scale, 0);
        context.rotate(Math.PI / 2);
      } else {
        context.translate(0, baseHeight * scale);
        context.rotate(-Math.PI / 2);
      }
      context.drawImage(sourceCanvas, 0, 0);
      context.restore();
    } else {
    let sourceStart = 0;
    let visualStart = 0;
    for (const spacer of pdfSpacers) {
      const segmentHeight = Math.max(0, spacer.y - sourceStart);
      if (segmentHeight > 0) {
        context.drawImage(
          sourceCanvas,
          ((page.kind === 'pdf' ? (page.crop?.left || 0) : 0) * scale),
          (((page.kind === 'pdf' ? (page.crop?.top || 0) : 0) + sourceStart) * scale),
          width * scale,
          segmentHeight * scale,
          0,
          visualStart * scale,
          width * scale,
          segmentHeight * scale
        );
      }

      visualStart += segmentHeight;
      context.save();
      context.setTransform(scale, 0, 0, scale, 0, 0);
      context.fillStyle = theme.background;
      context.fillRect(0, visualStart, width, spacer.height);
      context.strokeStyle = `rgba(${theme.accentRgb}, 0.62)`;
      context.setLineDash([10, 10]);
      context.beginPath();
      context.moveTo(0, visualStart + 1);
      context.lineTo(width, visualStart + 1);
      context.moveTo(0, visualStart + spacer.height - 1);
      context.lineTo(width, visualStart + spacer.height - 1);
      context.stroke();
      context.restore();

      visualStart += spacer.height;
      sourceStart = spacer.y;
    }

    const remainingHeight = Math.max(0, baseHeight - sourceStart);
    if (remainingHeight > 0) {
      context.drawImage(
        sourceCanvas,
        ((page.kind === 'pdf' ? (page.crop?.left || 0) : 0) * scale),
        (((page.kind === 'pdf' ? (page.crop?.top || 0) : 0) + sourceStart) * scale),
        width * scale,
        remainingHeight * scale,
        0,
        visualStart * scale,
        width * scale,
        remainingHeight * scale
      );
    }
    }
  }

  if ((page.extraSpace || 0) > 0) {
    context.save();
    context.setTransform(scale, 0, 0, scale, 0, 0);
    const startY = baseHeight + totalSpacerHeight(page.spacers || []);
    context.fillStyle = theme.background;
    context.fillRect(0, startY, width, page.extraSpace || 0);
    context.strokeStyle = `rgba(${theme.accentRgb}, 0.55)`;
    context.setLineDash([9, 9]);
    context.beginPath();
    context.moveTo(0, startY + 1);
    context.lineTo(width, startY + 1);
    context.stroke();
    context.restore();
  }

  return { width, baseHeight, totalHeight };
}

async function renderExportCanvas(page: NotebookPage, annotations: PageAnnotations, pdfDoc: any | null, theme: NoteTheme, scale = 2) {
  const canvas = document.createElement('canvas');
  const size = await paintPageBackground(canvas, page, pdfDoc, scale, theme);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create export context.');
  await drawRetainedElements(context, annotations, scale, { includeText: true });
  return { canvas, size };
}

async function renderBackgroundWithoutImages(page: NotebookPage, pdfDoc: any | null, theme: NoteTheme, scale = 2) {
  const canvas = document.createElement('canvas');
  const size = await paintPageBackground(canvas, page, pdfDoc, scale, theme);
  return { canvas, size };
}

async function renderSingleElementOverlay(entry: RenderableElement, size: { width: number; totalHeight: number }, scale = 2) {
  const { canvas, context } = createTransparentCanvas(size.width, size.totalHeight, scale);
  const annotations: PageAnnotations = { strokes: [], textBoxes: [], imageBoxes: [], mathPlaneBoxes: [], shapeBoxes: [] };
  if (entry.type === 'stroke') annotations.strokes = [entry.item];
  if (entry.type === 'shape') annotations.shapeBoxes = [entry.item];
  if (entry.type === 'text') annotations.textBoxes = [entry.item];
  if (entry.type === 'mathPlane') annotations.mathPlaneBoxes = [entry.item];
  await drawRetainedElements(context, annotations, scale, { includeText: true });
  return canvas;
}

async function createDocumentThumbnail(doc: DocumentRecord, pdfDoc: any | null, theme: NoteTheme) {
  const firstPage = doc.pages?.[0];
  if (!firstPage) return null;
  try {
    const annotations = getPageAnnotations(doc, firstPage.key);
    const { canvas } = await renderExportCanvas(firstPage, annotations, pdfDoc, theme, 0.22);
    return canvas.toDataURL('image/png');
  } catch (error) {
    console.warn('Thumbnail generation failed:', error);
    return null;
  }
}

export default function App() {
  const appShellRef = useRef<HTMLDivElement | null>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const inkCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pageShadowRef = useRef<HTMLDivElement | null>(null);
  const canvasStageRef = useRef<HTMLElement | null>(null);
  const baseCanvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  const inkCanvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  const pageShadowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pageIndexRef = useRef(0);
  const pageViewsRef = useRef<Record<string, { width: number; baseHeight: number; totalHeight: number }>>({});
  const pageRenderScaleRef = useRef<Record<string, number>>({});
  const pageRenderTokenRef = useRef(0);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const weekDragSessionIdRef = useRef<string | null>(null);
  const weekGridScrollRef = useRef<HTMLDivElement | null>(null);
  const scratchpadRef = useRef<HTMLDivElement | null>(null);
  const tipButtonRef = useRef<HTMLButtonElement | null>(null);
  const tipPopupRef = useRef<HTMLDivElement | null>(null);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const currentShapeRef = useRef<ShapeBox | null>(null);
  const currentDraftPageKeyRef = useRef<string | null>(null);
  const activeInkPointerIdRef = useRef<number | null>(null);
  const touchPointersRef = useRef<Map<number, { clientX: number; clientY: number }>>(new Map());
  const touchPanRef = useRef<{ centerX: number; centerY: number; scrollLeft: number; scrollTop: number } | null>(null);
  const stageTouchPanRef = useRef<{ centerX: number; centerY: number; scrollLeft: number; scrollTop: number; nextLeft: number; nextTop: number; startDistance: number; startZoom: number; mode: 'pan' | 'pinch'; raf: number | null } | null>(null);
  const draftOverlayFrameRef = useRef<number | null>(null);
  const draftOverlayJobRef = useRef<{ pageKey: string; annotations: PageAnnotations; draftStroke?: Stroke | null; draftShape?: ShapeBox | null; lassoPoints?: Point[] } | null>(null);
  const liveStrokeDrawnPointCountRef = useRef(0);
  const liveStrokePageKeyRef = useRef<string | null>(null);
  const pendingScrollPageKeyRef = useRef<string | null>(null);
  const lassoPointsRef = useRef<Point[]>([]);
  const overlayRenderTokenRef = useRef(0);
  const pdfRef = useRef<any | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const undoStackRef = useRef<DocumentRecord[]>([]);
  const redoStackRef = useRef<DocumentRecord[]>([]);
  const eraseSessionRef = useRef(false);
  const eraserPathRef = useRef<Point[]>([]);
  const eraserOverlayFrameRef = useRef<number | null>(null);
  const eraserOverlayPageKeyRef = useRef<string | null>(null);
  const eraserStateFrameRef = useRef<number | null>(null);
  const eraserPendingDocRef = useRef<DocumentRecord | null>(null);
  const textEditSnapshotRef = useRef<string | null>(null);
  const textCursorRef = useRef<{ boxId: string; pageKey: string; start: number; end: number } | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const folderCommitInProgressRef = useRef(false);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const textDragRef = useRef<{
    originalDoc: DocumentRecord;
    boxId: string;
    pageKey: string;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
  } | null>(null);
  const textResizeRef = useRef<{
    originalDoc: DocumentRecord;
    boxId: string;
    pageKey: string;
    startClientX: number;
    startClientY: number;
    startWidth: number;
    startHeight: number;
    startFontSize: number;
  } | null>(null);
  const imageDragRef = useRef<{
    originalDoc: DocumentRecord;
    imageId: string;
    pageKey: string;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
  } | null>(null);
  const imageResizeRef = useRef<{
    originalDoc: DocumentRecord;
    imageId: string;
    pageKey: string;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    mode: 'corner' | 'edge-right' | 'edge-bottom' | 'edge-left' | 'edge-top';
  } | null>(null);
  const mathPlaneResizeRef = useRef<{
    originalDoc: DocumentRecord;
    planeId: string;
    pageKey: string;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    mode: 'corner' | 'edge-right' | 'edge-bottom' | 'edge-left' | 'edge-top';
  } | null>(null);
  const imageRotateRef = useRef<{
    originalDoc: DocumentRecord;
    imageId: string;
    pageKey: string;
    centerClientX: number;
    centerClientY: number;
    startAngle: number;
    startRotation: number;
    moved: boolean;
  } | null>(null);
  const shapeResizeRef = useRef<{
    originalDoc: DocumentRecord;
    shapeId: string;
    pageKey: string;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    mode: 'corner' | 'edge-right' | 'edge-bottom' | 'edge-left' | 'edge-top';
  } | null>(null);
  const selectionDragRef = useRef<{
    originalDoc: DocumentRecord;
    pageKey: string;
    selectedKeys: string[];
    startClientX: number;
    startClientY: number;
    moved: boolean;
    undoPushed: boolean;
  } | null>(null);
  const docTabDragRef = useRef<{
    id: string;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    dragging: boolean;
  } | null>(null);

  const resizeRef = useRef<{
    originalDoc: DocumentRecord;
    spacerId: string;
    pageKey: string;
    pageIndex: number;
    startClientY: number;
    startHeight: number;
    visualEnd: number;
  } | null>(null);

  const [library, setLibrary] = useState<Library>({ documents: [] });
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarMode, setSidebarMode] = useState<'library' | 'notes' | 'trash'>('library');
  const [activeFolderFilter, setActiveFolderFilter] = useState('All');
  const [customFolders, setCustomFolders] = useState<string[]>(() => getStoredCustomFolders());
  const [customTags, setCustomTags] = useState<string[]>(() => getStoredCustomTags());
  const [folderPaths, setFolderPaths] = useState<Record<string, string>>(() => getStoredFolderPaths());
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [folderDraft, setFolderDraft] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [labelMenuOpen, setLabelMenuOpen] = useState(false);
  const [selectedElementKeys, setSelectedElementKeys] = useState<string[]>([]);
  const [tipIndex, setTipIndex] = useState(0);
  const [uiMode, setUiMode] = useState<UiMode>(() => getStoredUiMode());
  const [buttonSizeMode, setButtonSizeMode] = useState<ButtonSizeMode>(() => getStoredButtonSize());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);
  const [activeDoc, setActiveDoc] = useState<DocumentRecord | null>(null);
  const activeDocRef = useRef<DocumentRecord | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [tool, setTool] = useState<Tool>('select');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true');
  const [eraserMode, setEraserMode] = useState<EraserMode>(() => getStoredEraserMode());
  const [shapeKind, setShapeKind] = useState<ShapeKind>('rectangle');
  const [customThemes, setCustomThemes] = useState<NoteTheme[]>(() => readCustomThemes());
  const themeOptions = useMemo(() => [...THEME_OPTIONS, ...customThemes], [customThemes]);
  const [activeThemeId, setActiveThemeId] = useState<NoteThemeId>(() => getStoredThemeId());
  const activeTheme = useMemo(() => themeOptions.find((theme) => theme.id === activeThemeId) || NOTE_THEMES[DEFAULT_THEME_ID], [activeThemeId, themeOptions]);
  const displayPageTheme = useMemo(() => getDisplayPageTheme(activeTheme, uiMode), [activeTheme, uiMode]);
  const [customThemeName, setCustomThemeName] = useState('My colour scheme');
  const [customThemeBackground, setCustomThemeBackground] = useState('#F9F7FF');
  const [customThemeAccent, setCustomThemeAccent] = useState('#B5A8D5');
  const [customThemeText, setCustomThemeText] = useState('#2D283E');
  const [imageThemeStatus, setImageThemeStatus] = useState('');
  const [colour, setColour] = useState(() => getStoredColour(PEN_COLOUR_STORAGE_KEY, activeTheme.text));
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [opacity, setOpacity] = useState(1);
  const [highlighterColour, setHighlighterColour] = useState(getStoredHighlighterColour);
  const [shapeStrokeColour, setShapeStrokeColour] = useState(() => getStoredColour(SHAPE_STROKE_COLOUR_STORAGE_KEY, activeTheme.text));
  const [shapeFillColour, setShapeFillColour] = useState(() => getStoredColour(SHAPE_FILL_COLOUR_STORAGE_KEY, 'transparent'));
  const [activeColourPicker, setActiveColourPicker] = useState<ColourPickerTarget | null>(null);
  const [secondaryBarOpen, setSecondaryBarOpen] = useState(false);
  const [isInking, setIsInking] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [contentsOpen, setContentsOpen] = useState(false);
  const [blankPageMenuOpen, setBlankPageMenuOpen] = useState(false);
  const [textBoxBackground, setTextBoxBackground] = useState('transparent');
  const toolRef = useRef<Tool>('select');
  const [zoom, setZoom] = useState(1.1);
  const [spaceHeight, setSpaceHeight] = useState(240);
  const [fontFamily, setFontFamily] = useState('Open Sans');
  const [fontSize, setFontSize] = useState(18);
  const [fontWeight, setFontWeight] = useState<'400' | '600' | '700'>('400');
  const [status, setStatus] = useState('Import a PDF or create a blank PDF.');
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [selectedMathPlaneId, setSelectedMathPlaneId] = useState<string | null>(null);
  const [mathsPanelOpen, setMathsPanelOpen] = useState(false);
  const [mathsTab, setMathsTab] = useState<MathsTab>('symbols');
  const [mathPlaneConfig, setMathPlaneConfig] = useState<MathPlaneConfig>(() => ({
    xMin: -10,
    xMax: 10,
    yMin: -10,
    yMax: 10,
    gridStyle: 'lines',
    gridSpacing: 1,
    showAxisLabels: true,
    showTickMarks: true,
    axisColor: activeTheme.text,
    gridColor: mixHex(activeTheme.background, activeTheme.accent, 0.45),
    size: 'medium'
  }));
  const [mathBuilderDraft, setMathBuilderDraft] = useState<MathBuilderDraft>({
    numerator: 'x + 1',
    denominator: '2',
    powerBase: 'x',
    exponent: '2',
    subscriptBase: 'x',
    subscript: '1',
    root: 'x',
    absolute: 'x',
    vector: 'v',
    vectorMode: 'arrow'
  });
  const [lassoFilter, setLassoFilter] = useState<LassoFilter>('all');
  const [openDocTabs, setOpenDocTabs] = useState<string[]>([]);
  const [draggingDocTabId, setDraggingDocTabId] = useState<string | null>(null);
  const [pageRailOpen, setPageRailOpen] = useState(false);
  const [pageView, setPageView] = useState({ width: DEFAULT_BLANK_WIDTH, baseHeight: DEFAULT_BLANK_HEIGHT, totalHeight: DEFAULT_BLANK_HEIGHT });
  const [pageViews, setPageViews] = useState<Record<string, { width: number; baseHeight: number; totalHeight: number }>>({});
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newNotebookName, setNewNotebookName] = useState('Untitled Notes');
  const [newNotebookPages, setNewNotebookPages] = useState(3);
  const [newNotebookTemplate, setNewNotebookTemplate] = useState<BlankPageTemplate>('ruled');
  const [newNotebookThemeId, setNewNotebookThemeId] = useState<NoteThemeId>(() => getStoredThemeId());
  const [studyPlannerOpen, setStudyPlannerOpen] = useState(false);
  const [studySchedule, setStudySchedule] = useState<StudyScheduleItem[]>(() => readStudySchedule());
  const [studyView, setStudyView] = useState<'month' | 'week'>('month');
  const [studyMonth, setStudyMonth] = useState(() => toDateFromIso(todayIsoDate()));
  const [selectedStudyDate, setSelectedStudyDate] = useState(todayIsoDate());
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [studyDraft, setStudyDraft] = useState<StudyScheduleDraft>(() => makeStudyDraft(todayIsoDate()));
  const [subjectMode, setSubjectMode] = useState('');
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [datePickerMonth, setDatePickerMonth] = useState(() => toDateFromIso(todayIsoDate()));
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiStartDate, setAiStartDate] = useState(todayIsoDate());
  const [aiEndDate, setAiEndDate] = useState(todayIsoDate());
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiSummary, setAiSummary] = useState('');
  const [highlightedStudyIds, setHighlightedStudyIds] = useState<string[]>([]);
  const [flashcards, setFlashcards] = useState<Flashcard[]>(() => readFlashcards());
  const [flashcardModalOpen, setFlashcardModalOpen] = useState(false);
  const [flashcardCreateOpen, setFlashcardCreateOpen] = useState(false);
  const [flashcardDraft, setFlashcardDraft] = useState<FlashcardDraft>({ front: '', back: '', deck: 'General' });
  const [flashcardSource, setFlashcardSource] = useState<FlashcardSource | null>(null);
  const [reviewSelectedDecks, setReviewSelectedDecks] = useState<string[]>([]);
  const [reviewQueue, setReviewQueue] = useState<Flashcard[]>([]);
  const [reviewStarted, setReviewStarted] = useState(false);
  const [reviewFlipped, setReviewFlipped] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewSummary, setReviewSummary] = useState<ReviewSummary>({ again: 0, hard: 0, good: 0, easy: 0 });
  const [flashcardGeneratorOpen, setFlashcardGeneratorOpen] = useState(false);
  const [flashcardGeneratorPrompt, setFlashcardGeneratorPrompt] = useState('');
  const [flashcardGeneratorDeck, setFlashcardGeneratorDeck] = useState('General');
  const [flashcardGeneratorNewDeck, setFlashcardGeneratorNewDeck] = useState('');
  const [flashcardGeneratorPreview, setFlashcardGeneratorPreview] = useState<GeneratedFlashcardPreview[]>([]);
  const [flashcardGeneratorWarning, setFlashcardGeneratorWarning] = useState('');
  const ankiImportInputRef = useRef<HTMLInputElement | null>(null);
  const [ankiImportPreview, setAnkiImportPreview] = useState<AnkiImportPreview | null>(null);
  const [ankiImportStatus, setAnkiImportStatus] = useState('');
  const [studyNotifications, setStudyNotifications] = useState<StudyNotificationBanner[]>([]);
  const [weekRowHeight, setWeekRowHeight] = useState(() => getStoredWeekRowHeight());
  const [scratchpadOpen, setScratchpadOpen] = useState(false);
  const [scratchpadText, setScratchpadText] = useState(() => window.localStorage.getItem(SCRATCHPAD_STORAGE_KEY) || '');
  const [scratchSavedAt, setScratchSavedAt] = useState<Date | null>(null);
  const [clockNow, setClockNow] = useState(() => new Date());
  const [tipPopupOpen, setTipPopupOpen] = useState(false);
  const [tipPopupPosition, setTipPopupPosition] = useState<{ left: number; bottom: number } | null>(null);
  const [pageJumpDraft, setPageJumpDraft] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [aiChatInput, setAiChatInput] = useState('');
  const [aiChatTyping, setAiChatTyping] = useState(false);
  const [aiChatMessages, setAiChatMessages] = useState<ChatMessage[]>(() => readAiChatMemory());
  const [onboardingVisible, setOnboardingVisible] = useState(false);
  const [onboardingPhase, setOnboardingPhase] = useState<OnboardingPhase>('welcome');
  const [onboardingStepIndex, setOnboardingStepIndex] = useState(0);
  const [onboardingHighlight, setOnboardingHighlight] = useState<{ top: number; left: number; width: number; height: number; radius: number } | null>(null);
  const [onboardingTooltipReady, setOnboardingTooltipReady] = useState(false);

  const currentPage = activeDoc?.pages[pageIndex] ?? null;
  const currentAnnotations = useMemo(() => {
    if (!activeDoc || !currentPage) return { strokes: [], textBoxes: [], imageBoxes: [], mathPlaneBoxes: [], shapeBoxes: [] };
    return getPageAnnotations(activeDoc, currentPage.key);
  }, [activeDoc, currentPage]);

  const selectedTextBox = useMemo(() => selectedTextId ? currentAnnotations.textBoxes.find((box) => box.id === selectedTextId) || null : null, [currentAnnotations, selectedTextId]);
  const selectedShapeBox = useMemo(() => selectedShapeId ? currentAnnotations.shapeBoxes.find((shape) => shape.id === selectedShapeId) || null : null, [currentAnnotations, selectedShapeId]);
  const selectedImageBox = useMemo(() => selectedImageId ? currentAnnotations.imageBoxes.find((image) => image.id === selectedImageId) || null : null, [currentAnnotations, selectedImageId]);
  const selectedMathPlaneBox = useMemo(() => selectedMathPlaneId ? currentAnnotations.mathPlaneBoxes.find((plane) => plane.id === selectedMathPlaneId) || null : null, [currentAnnotations, selectedMathPlaneId]);
  const hasSelectedTextBox = Boolean(selectedTextBox);
  const hasSelectedShapeBox = Boolean(selectedShapeBox);
  const hasSelectedImageBox = Boolean(selectedImageBox);
  const hasSelectedMathPlaneBox = Boolean(selectedMathPlaneBox);

  useEffect(() => {
    if (!selectedTextBox) return;
    setColour(selectedTextBox.color);
    setFontFamily(selectedTextBox.fontFamily);
    setFontSize(selectedTextBox.fontSize);
    setFontWeight(selectedTextBox.fontWeight);
    setTextBoxBackground(selectedTextBox.backgroundColor || 'transparent');
  }, [selectedTextBox?.id]);

  useEffect(() => {
    if (!selectedShapeBox) return;
    setShapeKind(selectedShapeBox.kind);
    setShapeStrokeColour(selectedShapeBox.color);
    setShapeFillColour(selectedShapeBox.fillColor || 'transparent');
    setStrokeWidth(Math.max(1, Math.round(selectedShapeBox.strokeWidth || 1)));
    setOpacity(selectedShapeBox.opacity ?? 1);
  }, [selectedShapeBox?.id]);

  const isQuickNoteDoc = (doc: DocumentRecord | null | undefined) => Boolean(doc && (doc.docKind === 'quick-note' || doc.tags?.includes('quick-note')));
  const quickNoteText = useMemo(() => activeDoc && isQuickNoteDoc(activeDoc) ? extractQuickNoteText(activeDoc) : '', [activeDoc]);
  const pageCount = activeDoc?.pages.length ?? 0;
  const activeDocuments = useMemo(() => library.documents.filter((doc) => !doc.deletedAt && !isQuickNoteDoc(doc)), [library.documents]);
  const quickNoteDocuments = useMemo(() => library.documents.filter((doc) => !doc.deletedAt && isQuickNoteDoc(doc)), [library.documents]);
  const trashedDocuments = useMemo(() => library.documents.filter((doc) => doc.deletedAt), [library.documents]);
  const folderNames = useMemo(() => {
    const names = new Set<string>(customFolders);
    for (const doc of activeDocuments) {
      if (doc.folder?.trim()) names.add(doc.folder.trim());
    }
    return ['All', 'Unfiled', ...Array.from(names).sort((a, b) => a.localeCompare(b))];
  }, [activeDocuments, customFolders]);
  const availableCustomTags = useMemo(() => {
    const tags = new Set<string>(customTags);
    for (const doc of library.documents) {
      for (const tag of getDocumentCustomTags(doc)) tags.add(tag);
    }
    return Array.from(tags).sort((a, b) => a.localeCompare(b));
  }, [customTags, library.documents]);
  const visibleDocuments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const source = sidebarMode === 'trash' ? trashedDocuments : sidebarMode === 'notes' ? quickNoteDocuments : activeDocuments;
    return source.filter((doc) => {
      const folder = doc.folder?.trim() || 'Unfiled';
      const matchesFolder = sidebarMode !== 'library' || activeFolderFilter === 'All' || folder === activeFolderFilter;
      const quickPreview = isQuickNoteDoc(doc) ? extractQuickNoteText(doc) : '';
      const searchText = [doc.name, folder, getDocumentTagOption(doc).name, quickPreview, ...(doc.tags || [])].join(' ').toLowerCase();
      const matchesSearch = !query || searchText.includes(query);
      return matchesFolder && matchesSearch;
    });
  }, [activeDocuments, quickNoteDocuments, trashedDocuments, sidebarMode, activeFolderFilter, searchQuery]);

  const activeOnboardingStep = onboardingPhase === 'tour' ? ONBOARDING_STEPS[onboardingStepIndex] : null;

  const completeOnboarding = useCallback(() => {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
    setOnboardingVisible(false);
    setOnboardingPhase('intro');
    setOnboardingStepIndex(0);
    setOnboardingHighlight(null);
  }, []);

  const startOnboarding = useCallback((phase: OnboardingPhase = 'intro') => {
    setOnboardingPhase(phase);
    setOnboardingStepIndex(0);
    setOnboardingTooltipReady(false);
    setOnboardingVisible(true);
  }, []);

  const restartOnboarding = useCallback(() => {
    window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
    setHelpOpen(false);
    startOnboarding('intro');
  }, [startOnboarding]);

  const recalculateOnboardingHighlight = useCallback(() => {
    if (!onboardingVisible || onboardingPhase !== 'tour') {
      setOnboardingHighlight(null);
      return;
    }

    const target = document.querySelector(ONBOARDING_STEPS[onboardingStepIndex]?.target || '') as HTMLElement | null;
    if (!target) {
      setOnboardingHighlight(null);
      return;
    }

    let rect = target.getBoundingClientRect();
    if (target.matches('[data-tour-id="bottom-bar"]')) {
      const pieces = Array.from(target.querySelectorAll('.bottom-status-group, .bottom-control-group, .bottom-workspace-group'))
        .map((item) => (item as HTMLElement).getBoundingClientRect())
        .filter((item) => item.width > 0 && item.height > 0);
      if (pieces.length) {
        const left = Math.min(...pieces.map((item) => item.left));
        const top = Math.min(...pieces.map((item) => item.top));
        const right = Math.max(...pieces.map((item) => item.right));
        const bottom = Math.max(...pieces.map((item) => item.bottom));
        rect = new DOMRect(left, top, right - left, bottom - top);
      }
    }
    const computed = window.getComputedStyle(target);
    const radius = Number.parseFloat(computed.borderRadius || '0') || 18;
    const padding = 6;
    setOnboardingHighlight({
      top: Math.max(8, rect.top - padding),
      left: Math.max(8, rect.left - padding),
      width: Math.min(window.innerWidth - 16, rect.width + padding * 2),
      height: Math.min(window.innerHeight - 16, rect.height + padding * 2),
      radius: radius + padding
    });
  }, [onboardingPhase, onboardingStepIndex, onboardingVisible]);

  useEffect(() => {
    setPageJumpDraft(activeDoc && !isQuickNoteDoc(activeDoc) && pageCount > 0 ? String(pageIndex + 1) : '');
  }, [activeDoc, pageIndex, pageCount]);

  useEffect(() => {
    if (window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === 'true') return;
    const timer = window.setTimeout(() => startOnboarding('intro'), ONBOARDING_STEP_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [startOnboarding]);

  useEffect(() => {
    if (!onboardingVisible || onboardingPhase !== 'intro') return;
    const timer = window.setTimeout(() => setOnboardingPhase('welcome'), 1350);
    return () => window.clearTimeout(timer);
  }, [onboardingPhase, onboardingVisible]);

  useEffect(() => {
    if (!onboardingVisible || onboardingPhase !== 'tour') return;
    setOnboardingTooltipReady(false);
    recalculateOnboardingHighlight();
    const timer = window.setTimeout(() => setOnboardingTooltipReady(true), 300);
    return () => window.clearTimeout(timer);
  }, [onboardingPhase, onboardingStepIndex, onboardingVisible, recalculateOnboardingHighlight]);

  useEffect(() => {
    if (!onboardingVisible || onboardingPhase !== 'tour') return;
    const handleResize = () => recalculateOnboardingHighlight();
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize, true);
    };
  }, [onboardingPhase, onboardingVisible, recalculateOnboardingHighlight]);

  const studyItemsForSelectedDate = useMemo(() => (
    studySchedule
      .filter((item) => item.date === selectedStudyDate)
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
  ), [studySchedule, selectedStudyDate]);
  const upcomingStudyItems = useMemo(() => (
    studySchedule
      .filter((item) => !item.completed && item.date >= todayIsoDate())
      .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`))
      .slice(0, 4)
  ), [studySchedule]);
  const studyStatsByDate = useMemo(() => {
    const stats: Record<string, { total: number; done: number; colours: string[] }> = {};
    for (const item of studySchedule) {
      if (!stats[item.date]) stats[item.date] = { total: 0, done: 0, colours: [] };
      stats[item.date].total += 1;
      if (item.completed) stats[item.date].done += 1;
      if (!stats[item.date].colours.includes(item.colour)) stats[item.date].colours.push(item.colour);
    }
    return stats;
  }, [studySchedule]);
  const studyCountByDate = useMemo(() => Object.fromEntries(Object.entries(studyStatsByDate).map(([date, value]) => [date, value.total])), [studyStatsByDate]);
  const weekDates = useMemo(() => getWeekDates(toDateFromIso(selectedStudyDate)), [selectedStudyDate]);
  const weekStudyItems = useMemo(() => {
    const dates = new Set(weekDates.map((day) => day.iso));
    return studySchedule.filter((item) => dates.has(item.date));
  }, [studySchedule, weekDates]);
  const subjectFolderOptions = useMemo(() => folderNames.filter((folder) => folder !== 'All'), [folderNames]);
  const linkableDocuments = useMemo(() => {
    const query = linkSearch.trim().toLowerCase();
    return activeDocuments
      .filter((doc) => !query || [doc.name, doc.folder || '', getLabelOption(doc.label).name].join(' ').toLowerCase().includes(query))
      .slice(0, 30);
  }, [activeDocuments, linkSearch]);
  const drawingToolActive = tool === 'pen' || tool === 'highlighter' || tool === 'eraser';
  const selectedKeySet = useMemo(() => new Set(selectedElementKeys), [selectedElementKeys]);
  const selectedObjectSettingsVisible = tool === 'select' && secondaryBarOpen && (hasSelectedTextBox || hasSelectedShapeBox || hasSelectedImageBox || hasSelectedMathPlaneBox);
  const hasActiveSecondarySettings = hasSecondaryToolSettings(tool) || selectedObjectSettingsVisible;
  const secondarySettingsVisible = (hasSecondaryToolSettings(tool) && secondaryBarOpen) || selectedObjectSettingsVisible;
  const inkCanvasStyle = useMemo<CSSProperties | undefined>(() => {
    if (tool === 'pen') {
      return { cursor: makeCircularCursor(strokeWidth * zoom, colour, colour, Math.min(0.26, Math.max(0.08, opacity * 0.22))) };
    }

    if (tool === 'highlighter') {
      const highlighterWidth = Math.max(16, strokeWidth * 4) * zoom;
      return { cursor: makeCircularCursor(highlighterWidth, highlighterColour, highlighterColour, HIGHLIGHTER_OPACITY) };
    }

    if (tool === 'eraser') {
      const eraserDiameter = Math.max(12, strokeWidth * 3) * 2 * zoom;
      return { cursor: makeCircularCursor(eraserDiameter, activeTheme.text, '#FFFFFF', uiMode === 'dark' ? 0.22 : 0.5) };
    }

    return undefined;
  }, [activeTheme.text, colour, highlighterColour, opacity, strokeWidth, tool, uiMode, zoom]);

  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  const chooseTool = useCallback((nextTool: Tool) => {
    const currentTool = toolRef.current;
    const hasSettings = hasSecondaryToolSettings(nextTool);

    setMathsPanelOpen(false);
    toolRef.current = nextTool;
    setTool(nextTool);

    if (!hasSettings) {
      setSecondaryBarOpen(false);
      setActiveColourPicker(null);
      return;
    }

    setSecondaryBarOpen((open) => (currentTool === nextTool ? !open : true));
  }, []);

  useEffect(() => {
    if (!secondarySettingsVisible) setActiveColourPicker(null);
  }, [secondarySettingsVisible]);

  const applySelection = useCallback((keys: string[]) => {
    const clean = Array.from(new Set(keys));
    setSelectedElementKeys(clean);
    const imageKeys = clean.map(parseElementKey).filter((item): item is SelectedElement => Boolean(item && item.kind === 'image'));
    const textKeys = clean.map(parseElementKey).filter((item): item is SelectedElement => Boolean(item && item.kind === 'text'));
    const shapeKeys = clean.map(parseElementKey).filter((item): item is SelectedElement => Boolean(item && item.kind === 'shape'));
    const mathPlaneKeys = clean.map(parseElementKey).filter((item): item is SelectedElement => Boolean(item && item.kind === 'mathPlane'));
    setSelectedImageId(imageKeys.length === 1 ? imageKeys[0].id : null);
    setSelectedTextId(textKeys.length === 1 ? textKeys[0].id : null);
    setSelectedShapeId(shapeKeys.length === 1 ? shapeKeys[0].id : null);
    setSelectedMathPlaneId(mathPlaneKeys.length === 1 ? mathPlaneKeys[0].id : null);
    if (clean.length === 1 && (textKeys.length === 1 || shapeKeys.length === 1 || imageKeys.length === 1 || mathPlaneKeys.length === 1)) setSecondaryBarOpen(true);
  }, []);

  const selectElement = useCallback((kind: ElementKind, id: string, additive = false) => {
    const key = elementKey(kind, id);
    setSelectedElementKeys((current) => {
      const next = additive
        ? current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
        : [key];
      const imageKeys = next.map(parseElementKey).filter((item): item is SelectedElement => Boolean(item && item.kind === 'image'));
      const textKeys = next.map(parseElementKey).filter((item): item is SelectedElement => Boolean(item && item.kind === 'text'));
      const shapeKeys = next.map(parseElementKey).filter((item): item is SelectedElement => Boolean(item && item.kind === 'shape'));
      const mathPlaneKeys = next.map(parseElementKey).filter((item): item is SelectedElement => Boolean(item && item.kind === 'mathPlane'));
      setSelectedImageId(imageKeys.length === 1 ? imageKeys[0].id : null);
      setSelectedTextId(textKeys.length === 1 ? textKeys[0].id : null);
      setSelectedShapeId(shapeKeys.length === 1 ? shapeKeys[0].id : null);
      setSelectedMathPlaneId(mathPlaneKeys.length === 1 ? mathPlaneKeys[0].id : null);
      if (next.length === 1 && (textKeys.length === 1 || shapeKeys.length === 1 || imageKeys.length === 1 || mathPlaneKeys.length === 1)) setSecondaryBarOpen(true);
      return Array.from(new Set(next));
    });
  }, []);

  const clearSelection = useCallback(() => {
    applySelection([]);
  }, [applySelection]);


  useEffect(() => {
    activeDocRef.current = activeDoc;
  }, [activeDoc]);

  useEffect(() => {
    pageIndexRef.current = pageIndex;
  }, [pageIndex]);

  useEffect(() => {
    if (!isCreatingFolder) return;
    folderInputRef.current?.focus();
  }, [isCreatingFolder]);

  useEffect(() => {
    if (!isRenaming) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [isRenaming]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTipIndex((index) => (index + 1) % TIPS.length);
    }, 15000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(PEN_COLOUR_STORAGE_KEY, colour);
  }, [colour]);

  useEffect(() => {
    window.localStorage.setItem(HIGHLIGHTER_COLOUR_STORAGE_KEY, highlighterColour);
  }, [highlighterColour]);

  useEffect(() => {
    window.localStorage.setItem(SHAPE_STROKE_COLOUR_STORAGE_KEY, shapeStrokeColour);
  }, [shapeStrokeColour]);

  useEffect(() => {
    window.localStorage.setItem(SHAPE_FILL_COLOUR_STORAGE_KEY, shapeFillColour);
  }, [shapeFillColour]);

  useEffect(() => {
    window.localStorage.setItem(ERASER_MODE_STORAGE_KEY, eraserMode);
  }, [eraserMode]);

  useEffect(() => {
    window.localStorage.setItem(BUTTON_SIZE_STORAGE_KEY, buttonSizeMode);
  }, [buttonSizeMode]);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, sidebarCollapsed ? 'true' : 'false');
  }, [sidebarCollapsed]);

  useEffect(() => {
    function closeColourPickers(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.colour-picker-wrap')) return;
      setActiveColourPicker(null);
    }
    window.addEventListener('mousedown', closeColourPickers);
    return () => window.removeEventListener('mousedown', closeColourPickers);
  }, []);

  useEffect(() => {
    if (!tipPopupOpen) return;
    function closeTipPopup(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (tipPopupRef.current?.contains(target) || tipButtonRef.current?.contains(target)) return;
      setTipPopupOpen(false);
    }
    window.addEventListener('mousedown', closeTipPopup);
    return () => window.removeEventListener('mousedown', closeTipPopup);
  }, [tipPopupOpen]);

  useEffect(() => {
    const storedMessages = aiChatMessages.slice(-AI_CHAT_MEMORY_LIMIT);
    window.localStorage.setItem(AI_CHAT_MEMORY_STORAGE_KEY, JSON.stringify(storedMessages));
  }, [aiChatMessages]);

  const scheduleSave = useCallback((doc: DocumentRecord) => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(async () => {
      try {
        const saved = await window.localNotes.saveDocument(doc);
        setLibrary((previous) => ({
          documents: previous.documents.some((item) => item.id === saved.id)
            ? previous.documents.map((item) => (item.id === saved.id ? saved : item))
            : [saved, ...previous.documents]
        }));
        setStatus('Saved locally.');
      } catch (error) {
        console.error(error);
        setStatus('Save failed. Check the terminal for details.');
      }
    }, AUTO_SAVE_DELAY_MS);
  }, []);

  async function flushPendingAutoSave(doc: DocumentRecord) {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    } else {
      return doc;
    }

    try {
      const saved = await window.localNotes.saveDocument(doc);
      activeDocRef.current = saved;
      setActiveDoc(saved);
      setLibrary((previous) => ({
        documents: previous.documents.some((item) => item.id === saved.id)
          ? previous.documents.map((item) => (item.id === saved.id ? saved : item))
          : [saved, ...previous.documents]
      }));
      return saved;
    } catch (error) {
      console.warn('Could not flush the latest local edit before PDF export. Continuing with the in-memory document.', error);
      return doc;
    }
  }

  const pushUndo = useCallback(() => {
    const current = activeDocRef.current;
    if (!current) return;
    undoStackRef.current.push(cloneDocument(current));
    if (undoStackRef.current.length > 50) undoStackRef.current.shift();
    redoStackRef.current = [];
    setRedoCount(0);
    setUndoCount(undoStackRef.current.length);
  }, []);

  const applyDocumentUpdate = useCallback((mutator: (doc: DocumentRecord) => DocumentRecord | void, shouldPushUndo = true) => {
    const current = activeDocRef.current;
    if (!current) return;
    if (shouldPushUndo) pushUndo();

    const draft = cloneDocument(current);
    const result = mutator(draft) || draft;
    const next = normaliseDocument(result, activeThemeId);
    activeDocRef.current = next;
    setActiveDoc(next);
    setLibrary((previous) => ({
      documents: previous.documents.map((doc) => (doc.id === next.id ? next : doc))
    }));
    scheduleSave(next);
  }, [activeThemeId, pushUndo, scheduleSave]);

  function setActivePageIndex(index: number, scroll = false) {
    if (!activeDocRef.current) return;
    const nextIndex = clamp(index, 0, Math.max(0, activeDocRef.current.pages.length - 1));
    pageIndexRef.current = nextIndex;
    setPageIndex(nextIndex);
    const page = activeDocRef.current.pages[nextIndex];
    const size = pageViewsRef.current[page.key];
    if (size) setPageView(size);
    if (scroll) {
      pendingScrollPageKeyRef.current = page.key;
      scrollPageKeyIntoView(page.key);
    }
  }

  function handlePageJumpKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const doc = activeDocRef.current;
    if (!doc || isQuickNoteDoc(doc)) {
      setPageJumpDraft('');
      return;
    }
    const requestedPage = Number.parseInt(pageJumpDraft.trim(), 10);
    if (!Number.isFinite(requestedPage) || requestedPage < 1 || requestedPage > doc.pages.length) {
      setPageJumpDraft(String(pageIndexRef.current + 1));
      return;
    }
    setActivePageIndex(requestedPage - 1, true);
  }

  function getActivePageData(index = pageIndexRef.current) {
    const doc = activeDocRef.current;
    if (!doc) return null;
    const page = doc.pages[index];
    if (!page) return null;
    return {
      doc,
      page,
      index,
      annotations: getPageAnnotations(doc, page.key),
      view: pageViewsRef.current[page.key] || pageView
    };
  }

  function getVisiblePageInsertPoint(pageKey: string, view: { width: number; totalHeight: number }, boxSize: number): Point {
    const fallback = {
      x: clamp((view.width - boxSize) / 2, 8, Math.max(8, view.width - boxSize - 8)),
      y: clamp((view.totalHeight - boxSize) / 2, 8, Math.max(8, view.totalHeight - boxSize - 8))
    };
    const stage = canvasStageRef.current;
    const pageNode = pageShadowRefs.current[pageKey];
    if (!stage || !pageNode) return fallback;

    const stageRect = stage.getBoundingClientRect();
    const pageRect = pageNode.getBoundingClientRect();
    const visibleLeft = Math.max(stageRect.left, pageRect.left);
    const visibleRight = Math.min(stageRect.right, pageRect.right);
    const visibleTop = Math.max(stageRect.top, pageRect.top);
    const visibleBottom = Math.min(stageRect.bottom, pageRect.bottom);
    if (visibleRight <= visibleLeft || visibleBottom <= visibleTop) return fallback;

    const centerClientX = (visibleLeft + visibleRight) / 2;
    const centerClientY = (visibleTop + visibleBottom) / 2;
    return {
      x: clamp((centerClientX - pageRect.left) / zoom - boxSize / 2, 8, Math.max(8, view.width - boxSize - 8)),
      y: clamp((centerClientY - pageRect.top) / zoom - boxSize / 2, 8, Math.max(8, view.totalHeight - boxSize - 8))
    };
  }

  function getPageBackingScale(pageKey: string) {
    const ratio = window.devicePixelRatio || 1;
    return pageRenderScaleRef.current[pageKey] || Math.min(zoom * ratio, MAX_CANVAS_BACKING_SCALE);
  }

  const redrawPageOverlay = useCallback(async (pageKey: string, annotations: PageAnnotations, draftStroke?: Stroke | null, draftShape?: ShapeBox | null, lassoPoints?: Point[]) => {
    const canvas = inkCanvasRefs.current[pageKey] || (getActivePageData()?.page.key === pageKey ? inkCanvasRef.current : null);
    if (!canvas) return;
    const token = ++overlayRenderTokenRef.current;
    const backingScale = getPageBackingScale(pageKey);
    const offscreen = document.createElement('canvas');
    offscreen.width = canvas.width;
    offscreen.height = canvas.height;
    const offscreenContext = offscreen.getContext('2d');
    if (!offscreenContext) return;
    offscreenContext.clearRect(0, 0, offscreen.width, offscreen.height);

    await drawRetainedElements(offscreenContext, annotations, backingScale, { draftStroke, draftShape, includeText: false });
    if (lassoPoints?.length) drawLassoPath(offscreenContext, lassoPoints, backingScale);

    if (token !== overlayRenderTokenRef.current) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(offscreen, 0, 0);
  }, [zoom]);

  const redrawOverlay = useCallback(async (annotations: PageAnnotations, draftStroke?: Stroke | null, draftShape?: ShapeBox | null, lassoPoints?: Point[]) => {
    const data = getActivePageData();
    if (!data) return;
    await redrawPageOverlay(data.page.key, annotations, draftStroke, draftShape, lassoPoints);
  }, [redrawPageOverlay]);

  function drawLiveStrokeSegment(pageKey: string, stroke: Stroke, points: Point[]) {
    if (points.length < 2) return;
    const canvas = inkCanvasRefs.current[pageKey] || (getActivePageData()?.page.key === pageKey ? inkCanvasRef.current : null);
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    overlayRenderTokenRef.current += 1;
    const backingScale = getPageBackingScale(pageKey);
    context.save();
    context.setTransform(backingScale, 0, 0, backingScale, 0, 0);
    drawStroke(context, { ...stroke, points }, { liveHighlighter: stroke.tool === 'highlighter' });
    context.restore();
  }

  function flushLiveStrokeDraw(pageKey = liveStrokePageKeyRef.current) {
    const stroke = currentStrokeRef.current;
    if (!stroke || !pageKey) return;
    const startIndex = Math.max(0, liveStrokeDrawnPointCountRef.current - 1);
    const points = stroke.points.slice(startIndex);
    if (points.length >= 2) drawLiveStrokeSegment(pageKey, stroke, points);
    liveStrokeDrawnPointCountRef.current = stroke.points.length;
  }

  function scheduleDraftOverlayRedraw(pageKey: string, annotations: PageAnnotations, draftStroke?: Stroke | null, draftShape?: ShapeBox | null, lassoPoints?: Point[]) {
    draftOverlayJobRef.current = { pageKey, annotations, draftStroke, draftShape, lassoPoints };
    if (draftOverlayFrameRef.current !== null) return;
    draftOverlayFrameRef.current = window.requestAnimationFrame(() => {
      const job = draftOverlayJobRef.current;
      draftOverlayFrameRef.current = null;
      if (!job) return;
      void redrawPageOverlay(job.pageKey, job.annotations, job.draftStroke, job.draftShape, job.lassoPoints);
    });
  }

  function scheduleEraserOverlayRedraw(pageKey: string) {
    eraserOverlayPageKeyRef.current = pageKey;
    if (eraserOverlayFrameRef.current !== null) return;
    eraserOverlayFrameRef.current = window.requestAnimationFrame(() => {
      const key = eraserOverlayPageKeyRef.current;
      eraserOverlayFrameRef.current = null;
      if (!key || !activeDocRef.current) return;
      void redrawPageOverlay(key, getPageAnnotations(activeDocRef.current, key));
    });
  }

  function flushEraserOverlayRedraw(pageKey?: string) {
    if (eraserOverlayFrameRef.current !== null) {
      window.cancelAnimationFrame(eraserOverlayFrameRef.current);
      eraserOverlayFrameRef.current = null;
    }
    const key = pageKey || eraserOverlayPageKeyRef.current;
    eraserOverlayPageKeyRef.current = null;
    if (!key || !activeDocRef.current) return;
    void redrawPageOverlay(key, getPageAnnotations(activeDocRef.current, key));
  }

  function commitEraserState(doc: DocumentRecord) {
    setActiveDoc(doc);
    setLibrary((previous) => ({ documents: previous.documents.map((item) => (item.id === doc.id ? doc : item)) }));
  }

  function scheduleEraserStateCommit(doc: DocumentRecord) {
    eraserPendingDocRef.current = doc;
    if (eraserStateFrameRef.current !== null) return;
    eraserStateFrameRef.current = window.requestAnimationFrame(() => {
      const pending = eraserPendingDocRef.current;
      eraserPendingDocRef.current = null;
      eraserStateFrameRef.current = null;
      if (pending) commitEraserState(pending);
    });
  }

  function flushEraserStateCommit() {
    if (eraserStateFrameRef.current !== null) {
      window.cancelAnimationFrame(eraserStateFrameRef.current);
      eraserStateFrameRef.current = null;
    }
    const pending = eraserPendingDocRef.current;
    eraserPendingDocRef.current = null;
    if (pending) commitEraserState(pending);
  }

  const renderAllPages = useCallback(async () => {
    if (!activeDoc) return;
    if (hasActiveInkGesture()) return;
    const token = ++pageRenderTokenRef.current;
    const ratio = window.devicePixelRatio || 1;
    const nextViews: Record<string, { width: number; baseHeight: number; totalHeight: number }> = {};
    const backingScale = Math.min(zoom * ratio, MAX_CANVAS_BACKING_SCALE);

    for (const [index, page] of activeDoc.pages.entries()) {
      const base = baseCanvasRefs.current[page.key];
      const ink = inkCanvasRefs.current[page.key];
      if (!base || !ink) continue;
      try {
        pageRenderScaleRef.current[page.key] = backingScale;
        const size = await paintPageBackground(base, page, pdfRef.current, backingScale, displayPageTheme);
        if (token !== pageRenderTokenRef.current) return;
        const cssWidth = size.width * zoom;
        const cssHeight = size.totalHeight * zoom;
        base.style.width = `${cssWidth}px`;
        base.style.height = `${cssHeight}px`;
        ink.width = base.width;
        ink.height = base.height;
        ink.style.width = `${cssWidth}px`;
        ink.style.height = `${cssHeight}px`;
        nextViews[page.key] = size;
        if (index === pageIndexRef.current) {
          baseCanvasRef.current = base;
          inkCanvasRef.current = ink;
          pageShadowRef.current = pageShadowRefs.current[page.key] || null;
          setPageView(size);
        }
        await redrawPageOverlay(page.key, getPageAnnotations(activeDoc, page.key));
      } catch (error) {
        console.error(error);
        setStatus('Could not render one of the pages.');
      }
    }

    pageViewsRef.current = { ...pageViewsRef.current, ...nextViews };
    setPageViews((current) => ({ ...current, ...nextViews }));
  }, [activeDoc, zoom, displayPageTheme, redrawPageOverlay]);

  const renderCurrentPage = useCallback(async () => {
    await renderAllPages();
  }, [renderAllPages]);

  const syncFloatingNoteNavigation = useCallback(() => {
    const shell = appShellRef.current;
    const stage = canvasStageRef.current;
    if (!shell || !stage) return;
    const rect = stage.getBoundingClientRect();
    const isCoarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    const inset = isCoarsePointer ? 12 : 18;
    const left = Math.max(8, rect.left + inset);
    const tabsRect = document.querySelector('.document-tab-strip')?.getBoundingClientRect();
    const top = Math.max(8, rect.top + inset + (isCoarsePointer ? 26 : 22), tabsRect ? tabsRect.bottom + 8 : 0);
    const marksTop = top + (isCoarsePointer ? 48 : 54);
    shell.style.setProperty('--floating-note-nav-left', `${left}px`);
    shell.style.setProperty('--floating-note-nav-top', `${top}px`);
    shell.style.setProperty('--floating-note-marks-top', `${marksTop}px`);
    shell.style.setProperty('--floating-page-menu-max-height', `${Math.max(170, window.innerHeight - top - 74)}px`);
    shell.style.setProperty('--floating-note-marks-max-height', `${Math.max(150, window.innerHeight - marksTop - 82)}px`);
  }, []);

  const scrollPageKeyIntoView = useCallback((pageKey: string, attempt = 0) => {
    window.requestAnimationFrame(() => {
      const stage = canvasStageRef.current;
      const pageNode = pageShadowRefs.current[pageKey];
      if (!stage || !pageNode) {
        if (attempt < 6) scrollPageKeyIntoView(pageKey, attempt + 1);
        return;
      }
      const stageRect = stage.getBoundingClientRect();
      const pageRect = pageNode.getBoundingClientRect();
      const targetTop = Math.max(0, stage.scrollTop + pageRect.top - stageRect.top - 28);
      stage.scrollTop = targetTop;
      if (pendingScrollPageKeyRef.current === pageKey) pendingScrollPageKeyRef.current = null;
      window.requestAnimationFrame(() => {
        if (Math.abs(stage.scrollTop - targetTop) > 2) stage.scrollTop = targetTop;
      });
    });
  }, []);

  useEffect(() => {
    const themeId = getStoredThemeId();
    window.localNotes.loadLibrary().then((loaded) => {
      setLibrary({ documents: loaded.documents.map((doc) => normaliseDocument(doc, themeId)) });
    }).catch((error) => {
      console.error(error);
      setStatus('Could not load local library.');
    });
  }, []);

  useEffect(() => {
    renderCurrentPage();
  }, [renderCurrentPage]);

  useEffect(() => {
    const pendingKey = pendingScrollPageKeyRef.current;
    if (!pendingKey) return;
    scrollPageKeyIntoView(pendingKey);
  }, [activeDoc?.id, pageIndex, scrollPageKeyIntoView, zoom]);

  useEffect(() => {
    let frame = 0;
    const scheduleSync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(syncFloatingNoteNavigation);
    };
    scheduleSync();
    window.addEventListener('resize', scheduleSync);
    window.addEventListener('orientationchange', scheduleSync);

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleSync) : null;
    if (observer) {
      if (canvasStageRef.current) observer.observe(canvasStageRef.current);
      if (appShellRef.current) observer.observe(appShellRef.current);
    }

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', scheduleSync);
      window.removeEventListener('orientationchange', scheduleSync);
      observer?.disconnect();
    };
  }, [activeDoc?.id, openDocTabs.length, pageRailOpen, sidebarCollapsed, syncFloatingNoteNavigation, tool]);

  useEffect(() => {
    if (!activeDoc || !canvasStageRef.current) return;
    const stage = canvasStageRef.current;
    let raf = 0;
    const updateVisiblePage = () => {
      if (!activeDocRef.current) return;
      const stageRect = stage.getBoundingClientRect();
      let bestIndex = pageIndexRef.current;
      let bestVisible = -1;
      activeDocRef.current.pages.forEach((page, index) => {
        const element = pageShadowRefs.current[page.key];
        if (!element) return;
        const rect = element.getBoundingClientRect();
        const visible = Math.max(0, Math.min(rect.bottom, stageRect.bottom) - Math.max(rect.top, stageRect.top));
        if (visible > bestVisible) {
          bestVisible = visible;
          bestIndex = index;
        }
      });
      if (bestIndex !== pageIndexRef.current) {
        pageIndexRef.current = bestIndex;
        setPageIndex(bestIndex);
        const page = activeDocRef.current.pages[bestIndex];
        const size = pageViewsRef.current[page.key];
        if (size) setPageView(size);
      }
    };
    const onScroll = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(updateVisiblePage);
    };
    stage.addEventListener('scroll', onScroll, { passive: true });
    updateVisiblePage();
    return () => {
      stage.removeEventListener('scroll', onScroll);
      window.cancelAnimationFrame(raf);
    };
  }, [activeDoc]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT' || target?.isContentEditable;
      const key = event.key.toLowerCase();
      const isUndo = (event.metaKey || event.ctrlKey) && key === 'z';

      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.code === 'Space') {
        event.preventDefault();
        setScratchpadOpen((open) => !open);
        return;
      }

      if (flashcardModalOpen && reviewStarted && !isTyping && event.code === 'Space') {
        event.preventDefault();
        setReviewFlipped((flipped) => !flipped);
        return;
      }

      if (scratchpadOpen && !isTyping && event.key === 'Escape') {
        setScratchpadOpen(false);
        return;
      }

      if (aiChatOpen && event.key === 'Escape') {
        setAiChatOpen(false);
        return;
      }

      if (mathsPanelOpen && event.key === 'Escape') {
        setMathsPanelOpen(false);
        return;
      }

      if (isUndo) {
        event.preventDefault();
        if (event.shiftKey) handleRedo();
        else handleUndo();
        return;
      }

      if (!isTyping && selectedElementKeys.length > 0 && (event.key === 'Delete' || event.key === 'Backspace')) {
        event.preventDefault();
        handleDeleteSelectedElements();
        return;
      }

      if (isTyping || event.metaKey || event.ctrlKey || event.altKey) return;

      if (key === 's') chooseTool('select');
      if (key === 'l') chooseTool('lasso');
      if (key === 'r') chooseTool('shape');
      if (key === 'b') chooseTool('pen');
      if (key === 'h') chooseTool('highlighter');
      if (key === 'e') chooseTool('eraser');
      if (key === 't') chooseTool('text');
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });


  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const now = getAestDateParts(clockNow);
    const newNotifications: StudyNotificationBanner[] = [];

    for (const session of studySchedule) {
      if (session.date !== now.iso) continue;
      const start = timeToMinutes(session.startTime);
      const end = timeToMinutes(session.endTime);
      const startDelta = start - now.minutes;
      const endDelta = now.minutes - end;
      let kind: StudyNotificationKind | null = null;

      if (!session.completed && Math.abs(startDelta) <= 1) kind = 'now';
      else if (!session.completed && startDelta > 0 && startDelta <= 5) kind = 'soon';
      else if (!session.completed && endDelta >= 0 && endDelta <= 5) kind = 'complete';

      if (!kind) continue;
      const id = `${kind}:${session.id}:${session.date}:${kind === 'complete' ? session.endTime : session.startTime}`;
      if (window.sessionStorage.getItem(STUDY_NOTIFICATION_STORAGE_PREFIX + id)) continue;
      newNotifications.push({
        id,
        kind,
        sessionId: session.id,
        title: session.title,
        startTime: session.startTime,
        subject: session.subject || 'Study',
        linkedDocId: session.linkedDocId || null,
        linkedDocName: session.linkedDocName || null,
        message: kind === 'now'
          ? `⏰ Time to study: ${session.title}!`
          : kind === 'soon'
            ? `📚 Starting soon: ${session.title} at ${formatTimeLabel(session.startTime)} - ${session.subject || 'Study'}`
            : `✓ Session complete: ${session.title} - mark as done?`
      });
    }

    if (!newNotifications.length) return;

    setStudyNotifications((current) => {
      const existingIds = new Set(current.map((item) => item.id));
      const additions = newNotifications.filter((item) => !existingIds.has(item.id));
      for (const note of additions) {
        showNativeStudyNotification(note);
        window.setTimeout(() => dismissStudyNotification(note.id), 30000);
      }
      return [...additions, ...current].sort((a, b) => studyNotificationPriority(a.kind) - studyNotificationPriority(b.kind));
    });
  }, [clockNow, studySchedule]);

  useEffect(() => {
    if (!studyPlannerOpen || studyView !== 'week') return;
    window.requestAnimationFrame(() => {
      if (weekGridScrollRef.current) weekGridScrollRef.current.scrollTop = Math.max(0, (8 - WEEK_START_HOUR) * weekRowHeight);
    });
  }, [studyPlannerOpen, studyView, selectedStudyDate, weekRowHeight]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(SCRATCHPAD_STORAGE_KEY, scratchpadText);
      setScratchSavedAt(new Date());
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [scratchpadText]);

  useEffect(() => {
    if (!scratchpadOpen) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (scratchpadRef.current && target && !scratchpadRef.current.contains(target)) setScratchpadOpen(false);
    }
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [scratchpadOpen]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(''), 1800);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);


  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      if (!activeDocRef.current || !currentPage) return;
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT' || target?.isContentEditable;
      if (isTyping) return;

      const items = Array.from(event.clipboardData?.items || []);
      const imageItem = items.find((item) => item.type.startsWith('image/'));
      const file = imageItem?.getAsFile();
      if (!file) return;
      event.preventDefault();
      void insertImageFromFile(file);
    }

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  async function loadDocument(doc: DocumentRecord) {
    setIsLoadingPdf(true);
    setStatus('Loading document...');
    undoStackRef.current = [];
    redoStackRef.current = [];
    setRedoCount(0);
    setUndoCount(0);
    textEditSnapshotRef.current = null;
    setSelectedElementKeys([]);
    setSelectedTextId(null);
    setSelectedImageId(null);
    setSelectedShapeId(null);
    setSelectedMathPlaneId(null);

    try {
      let nextDoc = normaliseDocument(doc, activeThemeId);
      const docTheme = resolveTheme(nextDoc.themeId || DEFAULT_THEME_ID);
      setActiveThemeId(docTheme.id);
      setColour(docTheme.text);

      if (nextDoc.pdfFileName) {
        const bytes = await window.localNotes.readPdf(nextDoc.id);
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bytes).buffer }).promise;
        pdfRef.current = pdf;

        if (!nextDoc.pages || nextDoc.pages.length === 0) {
          nextDoc.pages = createPdfPages(pdf.numPages);
          nextDoc.annotations = {};
          for (const page of nextDoc.pages) setPageAnnotations(nextDoc, page.key, { strokes: [], textBoxes: [], imageBoxes: [], mathPlaneBoxes: [], shapeBoxes: [] });
          nextDoc = await window.localNotes.saveDocument(nextDoc);
          setLibrary((previous) => ({ documents: previous.documents.map((item) => (item.id === nextDoc.id ? nextDoc : item)) }));
        }
      } else {
        pdfRef.current = null;
      }

      if (!nextDoc.thumbnailDataUrl && nextDoc.pages?.length) {
        const thumb = await createDocumentThumbnail(nextDoc, pdfRef.current, docTheme);
        if (thumb) {
          nextDoc.thumbnailDataUrl = thumb;
          nextDoc = await window.localNotes.saveDocument(nextDoc);
          setLibrary((previous) => ({ documents: previous.documents.map((item) => (item.id === nextDoc.id ? nextDoc : item)) }));
        }
      }

      activeDocRef.current = nextDoc;
      setActiveDoc(nextDoc);
      setOpenDocTabs((tabs) => appendOpenDocTab(tabs, nextDoc.id));
      pageViewsRef.current = {};
      setPageViews({});
      pageIndexRef.current = 0;
      setPageIndex(0);
      window.requestAnimationFrame(() => { if (canvasStageRef.current) canvasStageRef.current.scrollTop = 0; });
      setStatus('Ready. Notes are stored on this computer only.');
    } catch (error) {
      console.error(error);
      setStatus('Could not open that document.');
    } finally {
      setIsLoadingPdf(false);
    }
  }

  function handleDocTabPointerDown(event: ReactPointerEvent<HTMLButtonElement>, id: string) {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.document-tab-close')) return;
    if (event.button !== 0) return;
    docTabDragRef.current = {
      id,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      dragging: false
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleDocTabPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = docTabDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startClientX;
    const dy = event.clientY - drag.startClientY;
    if (!drag.dragging && Math.hypot(dx, dy) < 8) return;

    drag.dragging = true;
    setDraggingDocTabId(drag.id);
    event.preventDefault();
    event.stopPropagation();

    const strip = event.currentTarget.closest('.document-tab-strip') as HTMLElement | null;
    if (strip) {
      const stripRect = strip.getBoundingClientRect();
      if (event.clientX < stripRect.left + 34) strip.scrollLeft -= 18;
      if (event.clientX > stripRect.right - 34) strip.scrollLeft += 18;
    }

    const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
    const targetTab = target?.closest('[data-doc-tab-id]') as HTMLElement | null;
    const targetId = targetTab?.dataset.docTabId;
    if (!targetId || targetId === drag.id) return;

    const rect = targetTab.getBoundingClientRect();
    const side: DocTabInsertSide = event.clientX > rect.left + rect.width / 2 ? 'after' : 'before';
    setOpenDocTabs((tabs) => reorderOpenDocTabs(tabs, drag.id, targetId, side));
  }

  function handleDocTabPointerUp(event: ReactPointerEvent<HTMLButtonElement>, doc: DocumentRecord) {
    const drag = docTabDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const wasDragging = drag.dragging;
    docTabDragRef.current = null;
    setDraggingDocTabId(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);

    if (wasDragging) {
      event.preventDefault();
      event.stopPropagation();
      setStatus('Document tabs rearranged.');
      return;
    }

    void loadDocument(doc);
  }

  function handleDocTabPointerCancel(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = docTabDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    docTabDragRef.current = null;
    setDraggingDocTabId(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  async function handleImportPdf() {
    if (!window.localNotes?.importPdf || !window.localNotes?.saveDocument) {
      setStatus('Import PDF is only available in the Dux Notes desktop app.');
      return;
    }

    try {
      setStatus('Opening PDF picker...');
      const imported = await window.localNotes.importPdf();
      if (!imported) {
        setStatus(activeDocRef.current ? 'Import cancelled.' : 'Import a PDF or create a blank PDF.');
        return;
      }

      let next = normaliseDocument(imported, activeThemeId);
      next.themeId = activeThemeId;

      if (next.sourceDir) {
        const matchedFolder = Object.entries(folderPaths).find(([, folderPath]) => folderPath && next.sourceDir === folderPath)?.[0];
        if (matchedFolder) next.folder = matchedFolder;
      }

      next = await window.localNotes.saveDocument(next);
      setLibrary((previous) => ({ documents: [next, ...previous.documents.filter((doc) => doc.id !== next.id)] }));
      await loadDocument(next);
      setStatus(next.folder ? `Imported and assigned to ${next.folder}.` : 'Imported PDF.');
    } catch (error) {
      console.error('Import PDF failed:', error);
      setStatus('Import PDF failed. Try another PDF or restart Dux Notes.');
    }
  }

  async function handleCreateNotebook() {
    if (!window.localNotes?.saveDocument) {
      setStatus('Create PDF is only available in the Dux Notes desktop app.');
      return;
    }

    try {
      const name = newNotebookName.trim() || 'Untitled Notes';
      const count = clamp(Math.round(Number(newNotebookPages) || 1), 1, 100);
      const pages = Array.from({ length: count }, () => createBlankPage(newNotebookTemplate));
      const now = new Date().toISOString();
      const doc: DocumentRecord = {
        id: makeId(),
        name: safePdfName(name),
        pdfFileName: null,
        themeId: newNotebookThemeId,
        createdAt: now,
        updatedAt: now,
        pages,
        annotations: Object.fromEntries(pages.map((page) => [page.key, { strokes: [], textBoxes: [], imageBoxes: [], mathPlaneBoxes: [], shapeBoxes: [] }]))
      };

      const createTheme = resolveTheme(newNotebookThemeId);
      doc.thumbnailDataUrl = await createDocumentThumbnail(doc, null, createTheme);

      const saved = await window.localNotes.saveDocument(doc);
      const next = normaliseDocument(saved, newNotebookThemeId);
      setLibrary((previous) => ({ documents: [next, ...previous.documents.filter((item) => item.id !== next.id)] }));
      const createdTheme = resolveTheme(newNotebookThemeId);
      setActiveThemeId(createdTheme.id);
      setColour(createdTheme.text);
      pdfRef.current = null;
      undoStackRef.current = [];
      redoStackRef.current = [];
      setRedoCount(0);
      setUndoCount(0);
      activeDocRef.current = next;
      setActiveDoc(next);
      pageViewsRef.current = {};
      setPageViews({});
      pageIndexRef.current = 0;
      setPageIndex(0);
      setCreateDialogOpen(false);
      window.requestAnimationFrame(() => { if (canvasStageRef.current) canvasStageRef.current.scrollTop = 0; });
      setStatus(`Blank PDF created with ${count} page${count === 1 ? '' : 's'}. Use Save PDF when you want the actual file.`);
    } catch (error) {
      console.error('Create PDF failed:', error);
      setStatus('Create PDF failed. Restart Dux Notes and try again.');
    }
  }


  function openStudyPlanner() {
    requestNativeStudyNotifications(false);
    setStudyPlannerOpen(true);
    setLinkPickerOpen(false);
    setDatePickerOpen(false);
    if (!editingScheduleId) {
      setSelectedStudyDate(studyDraft.date || todayIsoDate());
      setDatePickerMonth(toDateFromIso(studyDraft.date || todayIsoDate()));
    }
  }


  function updateStudyDraft(patch: Partial<StudyScheduleDraft>) {
    setStudyDraft((current) => ({ ...current, ...patch }));
  }

  function startNewStudySession(date = selectedStudyDate) {
    setEditingScheduleId(null);
    setSelectedStudyDate(date);
    setSubjectMode('');
    setLinkPickerOpen(false);
    setDatePickerOpen(false);
    setStudyDraft(makeStudyDraft(date));
  }


  function selectStudyDate(date: string) {
    setSelectedStudyDate(date);
    setStudyMonth(toDateFromIso(date));
    if (!editingScheduleId) {
      setStudyDraft((current) => ({ ...current, date }));
    }
  }


  function linkStudyDraftToCurrentNote() {
    setLinkPickerOpen((open) => !open);
    setLinkSearch('');
  }


  function clearStudyDraftLink() {
    setStudyDraft((current) => ({ ...current, linkedDocId: '', linkedDocName: '', linkedPageIndex: null }));
    setLinkPickerOpen(false);
  }


  function saveStudySession() {
    const title = studyDraft.title.trim();
    if (!title) {
      setStatus('Study schedule needs a title.');
      return;
    }
    const now = new Date().toISOString();
    const item: StudyScheduleItem = {
      id: editingScheduleId || makeId(),
      title,
      date: studyDraft.date || selectedStudyDate || todayIsoDate(),
      startTime: studyDraft.startTime || '16:00',
      endTime: studyDraft.endTime || '17:00',
      subject: studyDraft.subject.trim(),
      note: studyDraft.note.trim(),
      colour: studyDraft.colour || chrome.buttonBg,
      completed: studyDraft.completed,
      linkedDocId: studyDraft.linkedDocId || null,
      linkedDocName: studyDraft.linkedDocName || null,
      linkedPageIndex: null,
      linkedDeck: studyDraft.linkedDeck || null,
      createdAt: studySchedule.find((entry) => entry.id === editingScheduleId)?.createdAt || now,
      updatedAt: now
    };
    const next = saveStudySchedule(editingScheduleId
      ? studySchedule.map((entry) => (entry.id === editingScheduleId ? item : entry))
      : [item, ...studySchedule]
    );
    setStudySchedule(next);
    setEditingScheduleId(item.id);
    setSelectedStudyDate(item.date);
    setStudyMonth(toDateFromIso(item.date));
    setStatus('Study schedule saved locally.');
  }

  function editStudySession(item: StudyScheduleItem) {
    setEditingScheduleId(item.id);
    setSelectedStudyDate(item.date);
    setStudyMonth(toDateFromIso(item.date));
    setDatePickerMonth(toDateFromIso(item.date));
    setSubjectMode(subjectFolderOptions.includes(item.subject) || !item.subject ? item.subject : 'Other');
    setLinkPickerOpen(false);
    setDatePickerOpen(false);
    setStudyDraft({
      title: item.title,
      date: item.date,
      startTime: item.startTime,
      endTime: item.endTime,
      subject: item.subject,
      note: item.note,
      colour: item.colour,
      completed: item.completed,
      linkedDocId: item.linkedDocId || '',
      linkedDocName: item.linkedDocName || '',
      linkedPageIndex: typeof item.linkedPageIndex === 'number' ? item.linkedPageIndex : null,
      linkedDeck: item.linkedDeck || ''
    });
  }


  function deleteStudySession(id: string) {
    const item = studySchedule.find((entry) => entry.id === id);
    if (!item) return;
    const confirmed = window.confirm(`Delete study session "${item.title}"?`);
    if (!confirmed) return;
    const next = saveStudySchedule(studySchedule.filter((entry) => entry.id !== id));
    setStudySchedule(next);
    if (editingScheduleId === id) startNewStudySession(selectedStudyDate);
    setStatus('Study session deleted.');
  }


  function resetStudySchedule() {
    const confirmed = window.confirm('Reset the entire study schedule? This removes all study blocks and timings. This cannot be undone.');
    if (!confirmed) return;
    setStudySchedule([]);
    saveStudySchedule([]);
    setEditingScheduleId(null);
    setStudyDraft(makeStudyDraft(selectedStudyDate));
    setHighlightedStudyIds([]);
    setStudyNotifications([]);
    setStatus('Study schedule reset.');
  }

  function toggleStudySessionDone(id: string) {
    const next = saveStudySchedule(studySchedule.map((entry) => entry.id === id
      ? { ...entry, completed: !entry.completed, updatedAt: new Date().toISOString() }
      : entry
    ));
    setStudySchedule(next);
    if (editingScheduleId === id) {
      const updated = next.find((entry) => entry.id === id);
      if (updated) editStudySession(updated);
    }
  }

  async function openLinkedStudyNote(item: StudyScheduleItem | StudyScheduleDraft) {
    if (!item.linkedDocId) return;
    const doc = library.documents.find((entry) => entry.id === item.linkedDocId && !entry.deletedAt);
    if (!doc) {
      setStatus('Linked note could not be found. It may be in Trash.');
      return;
    }
    setStudyPlannerOpen(false);
    await loadDocument(doc);
    window.requestAnimationFrame(() => setActivePageIndex(0, true));
    setStatus(`Opened linked note${'title' in item && item.title ? ` for ${item.title}` : ''}.`);
  }

  function dismissStudyNotification(id: string) {
    window.sessionStorage.setItem(STUDY_NOTIFICATION_STORAGE_PREFIX + id, '1');
    setStudyNotifications((current) => current.filter((item) => item.id !== id));
  }

  function requestNativeStudyNotifications(showStatus = true) {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      if (showStatus) setStatus('Laptop notifications are not available in this browser.');
      return;
    }
    if (Notification.permission === 'granted') {
      if (showStatus) setStatus('Laptop study notifications are already enabled.');
      return;
    }
    if (Notification.permission === 'denied') {
      if (showStatus) setStatus('Laptop notifications are blocked in your browser or macOS settings.');
      return;
    }
    void Notification.requestPermission().then((permission) => {
      if (!showStatus) return;
      setStatus(permission === 'granted'
        ? 'Laptop study notifications enabled.'
        : 'Laptop notifications are still blocked in your browser or macOS settings.');
    });
  }

  function showNativeStudyNotification(notification: StudyNotificationBanner) {
    if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      const nativeNotification = new Notification('Dux Notes study reminder', {
        body: notification.message,
        tag: notification.id,
        silent: false
      });
      nativeNotification.onclick = () => {
        window.focus();
        if (notification.linkedDocId && notification.kind !== 'complete') void openNotificationLinkedNote(notification);
      };
      window.setTimeout(() => nativeNotification.close(), 15000);
    } catch (error) {
      console.warn('Could not show native study notification:', error);
    }
  }

  function markStudyNotificationDone(notification: StudyNotificationBanner) {
    const next = saveStudySchedule(studySchedule.map((entry) => entry.id === notification.sessionId
      ? { ...entry, completed: true, updatedAt: new Date().toISOString() }
      : entry
    ));
    setStudySchedule(next);
    if (editingScheduleId === notification.sessionId) {
      const updated = next.find((entry) => entry.id === notification.sessionId);
      if (updated) editStudySession(updated);
    }
    dismissStudyNotification(notification.id);
    setStatus('Study session marked as done.');
  }

  async function openNotificationLinkedNote(notification: StudyNotificationBanner) {
    if (!notification.linkedDocId) return;
    const doc = library.documents.find((entry) => entry.id === notification.linkedDocId && !entry.deletedAt);
    if (!doc) {
      setStatus('Linked note could not be found. It may be in Trash.');
      dismissStudyNotification(notification.id);
      return;
    }
    setStudyPlannerOpen(false);
    await loadDocument(doc);
    window.requestAnimationFrame(() => setActivePageIndex(0, true));
    dismissStudyNotification(notification.id);
  }



  function linkScheduleToDocument(doc: DocumentRecord) {
    setStudyDraft((current) => ({
      ...current,
      linkedDocId: doc.id,
      linkedDocName: displayName(doc.name),
      linkedPageIndex: null
    }));
    setLinkPickerOpen(false);
    setLinkSearch('');
    setStatus(`Linked study session to ${displayName(doc.name)}.`);
  }

  function chooseStudyDate(date: string) {
    updateStudyDraft({ date });
    selectStudyDate(date);
    setDatePickerMonth(toDateFromIso(date));
    setDatePickerOpen(false);
  }

  function moveStudySessionToSlot(sessionId: string, date: string, hour: number) {
    const item = studySchedule.find((entry) => entry.id === sessionId);
    if (!item) return;
    const duration = Math.max(30, timeToMinutes(item.endTime) - timeToMinutes(item.startTime));
    const start = minutesToTime(hour * 60);
    const end = minutesToTime(Math.min(23 * 60 + 59, hour * 60 + duration));
    const next = saveStudySchedule(studySchedule.map((entry) => entry.id === sessionId
      ? { ...entry, date, startTime: start, endTime: end, updatedAt: new Date().toISOString() }
      : entry
    ));
    setStudySchedule(next);
    setSelectedStudyDate(date);
    setStudyMonth(toDateFromIso(date));
    const updated = next.find((entry) => entry.id === sessionId);
    if (updated && editingScheduleId === sessionId) editStudySession(updated);
    setStatus('Study block moved.');
  }


  function openAiGenerator() {
    setAiPanelOpen(true);
    setAiSummary('');
    setAiError('');
    const start = aiStartDate && isValidIsoDate(aiStartDate) ? aiStartDate : todayIsoDate();
    setAiStartDate(start);
    const currentEnd = aiEndDate && isValidIsoDate(aiEndDate) ? aiEndDate : start;
    if (toDateFromIso(currentEnd).getTime() <= toDateFromIso(start).getTime()) {
      const end = toDateFromIso(start);
      end.setDate(end.getDate() + 14);
      setAiEndDate(formatLocalIsoDate(end));
    }
  }


  function subjectColourMap(existing: StudyScheduleItem[]) {
    const map = new Map<string, string>();
    for (const item of existing) {
      const key = (item.subject || 'Other').trim().toLowerCase();
      if (key && !map.has(key)) map.set(key, item.colour || STUDY_COLOURS[map.size % STUDY_COLOURS.length]);
    }
    return map;
  }

  async function generateScheduleWithAi() {
    if (!aiPrompt.trim()) {
      setAiError('Write what you need the study plan to cover first.');
      return;
    }
    if (!isValidIsoDate(aiStartDate) || !isValidIsoDate(aiEndDate)) {
      setAiError('Use valid start and end dates.');
      return;
    }

    setAiLoading(true);
    setAiError('');
    setAiSummary('');

    try {
      const folders = subjectFolderOptions.filter((folder) => folder !== 'Unfiled' && folder !== 'All');
      const endDate = inferSmartEndDate(aiPrompt, aiStartDate, aiEndDate);
      if (endDate !== aiEndDate) setAiEndDate(endDate);

      const subjects = extractSmartSubjects(aiPrompt, folders);
      const windows = extractAvailabilityWindows(aiPrompt);
      const duration = extractSessionDuration(aiPrompt);
      const breakMinutes = extractBreakMinutes(aiPrompt);
      const colourMap = subjectColourMap(studySchedule);
      const now = new Date().toISOString();
      const startDate = toDateFromIso(aiStartDate);
      const finalDate = toDateFromIso(endDate);

      const normaliseGeneratedItems = (rawItems: AiScheduleItem[] | undefined, source: 'Dux AI' | 'local generator') => {
        const items: StudyScheduleItem[] = [];
        for (const raw of rawItems || []) {
          if (!raw || !isValidIsoDate(raw.date) || !isValidTime(raw.startTime) || !isValidTime(raw.endTime)) continue;
          const date = toDateFromIso(raw.date);
          if (date.getTime() < startDate.getTime() || date.getTime() > finalDate.getTime()) continue;
          if (timeToMinutes(raw.endTime) <= timeToMinutes(raw.startTime)) continue;
          const subject = titleCaseSubject(raw.subject || subjects[items.length % subjects.length] || 'Study');
          const keySubject = subject.toLowerCase();
          if (!colourMap.has(keySubject)) colourMap.set(keySubject, STUDY_COLOURS[colourMap.size % STUDY_COLOURS.length]);
          items.push({
            id: makeId(),
            title: String(raw.title || makeGeneratedSessionTitle(subject, items.length)).trim().slice(0, 90),
            date: raw.date,
            startTime: raw.startTime,
            endTime: raw.endTime,
            subject,
            note: String(raw.notes || `Generated by ${source} from your plan.`).trim().slice(0, 240),
            colour: colourMap.get(keySubject) || STUDY_COLOURS[0],
            completed: false,
            linkedDocId: null,
            linkedDocName: null,
            linkedPageIndex: null,
            linkedDeck: raw.linkedDeck || null,
            createdAt: now,
            updatedAt: now
          });
          if (items.length >= 80) break;
        }
        return items;
      };

      let newItems: StudyScheduleItem[] = [];
      let generatedBy: 'Dux AI' | 'local generator' = 'local generator';

      try {
        const response = await requestDuxStudySchedule({
          prompt: aiPrompt.trim(),
          startDate: aiStartDate,
          endDate,
          subjects,
          windows,
          sessionMinutes: duration,
          breakMinutes
        });
        newItems = normaliseGeneratedItems(response.items, 'Dux AI');
        if (newItems.length) generatedBy = 'Dux AI';
      } catch (error) {
        console.warn('Dux AI study schedule fallback used:', error);
      }

      if (!newItems.length) {
        const localItems: AiScheduleItem[] = [];
        let subjectIndex = 0;

        for (const date = new Date(startDate); date.getTime() <= finalDate.getTime(); date.setDate(date.getDate() + 1)) {
          const iso = formatLocalIsoDate(date);
          const dayWindows = windows.filter((windowItem) => windowMatchesDate(windowItem, date));
          for (const windowItem of dayWindows) {
            let cursor = timeToMinutes(windowItem.start);
            const windowEnd = timeToMinutes(windowItem.end);
            while (cursor + duration <= windowEnd && localItems.length < 80) {
              const subject = windowItem.subject || subjects[subjectIndex % subjects.length] || 'Study';
              const smartSession = makeOfflineStudySession(subject, subjectIndex, aiPrompt, duration, breakMinutes, flashcardDeckNames);
              localItems.push({
                ...smartSession,
                title: smartSession.title || makeGeneratedSessionTitle(subject, subjectIndex),
                date: iso,
                startTime: minutesToTime(cursor),
                endTime: minutesToTime(cursor + duration),
                subject
              });
              subjectIndex += 1;
              cursor += duration + breakMinutes;
            }
          }
        }
        newItems = normaliseGeneratedItems(localItems, 'local generator');
      }

      if (!newItems.length) {
        setAiError('No sessions could be created. Try adding clear available times like “Monday 4pm to 6pm and Wednesday 7pm to 9pm”.');
        return;
      }

      const next = saveStudySchedule([...studySchedule, ...newItems]);
      setStudySchedule(next);
      setHighlightedStudyIds(newItems.map((item) => item.id));
      window.setTimeout(() => setHighlightedStudyIds([]), 2000);
      setAiPanelOpen(false);
      setSelectedStudyDate(newItems[0].date);
      setStudyMonth(toDateFromIso(newItems[0].date));
      const uniqueDays = new Set(newItems.map((item) => item.date)).size;
      setAiSummary(`Added ${newItems.length} sessions across ${uniqueDays} days`);
      setStatus(`Added ${newItems.length} sessions across ${uniqueDays} days with ${generatedBy}.`);
    } catch (error) {
      console.error(error);
      setAiError('The generator could not create a schedule. Try a simpler request with clear days and times.');
    } finally {
      setAiLoading(false);
    }
  }


  const flashcardDeckNames = useMemo(() => {
    const names = new Set<string>(['General']);
    for (const folder of subjectFolderOptions) {
      if (folder !== 'All' && folder !== 'Unfiled') names.add(folder);
    }
    for (const card of flashcards) names.add(card.deck || 'General');
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [subjectFolderOptions, flashcards]);

  const flashcardDeckStats = useMemo(() => {
    const today = todayIsoDate();
    return flashcardDeckNames.map((deck) => {
      const cards = flashcards.filter((card) => card.deck === deck);
      return { deck, count: cards.length, due: cards.filter((card) => (card.dueDate || today) <= today).length };
    });
  }, [flashcardDeckNames, flashcards]);

  function persistFlashcards(nextCards: Flashcard[]) {
    const saved = saveFlashcards(nextCards);
    setFlashcards(saved);
    return saved;
  }

  function openManualFlashcard() {
    setFlashcardDraft({ front: '', back: '', deck: flashcardDeckNames[0] || 'General' });
    setFlashcardSource(null);
    setFlashcardModalOpen(true);
    setFlashcardCreateOpen(true);
    setFlashcardGeneratorOpen(false);
    setAnkiImportPreview(null);
    setAnkiImportStatus('');
    resetFlashcardReview();
  }

  function openFlashcardFromText(front: string) {
    const defaultDeck = activeDoc?.folder?.trim() || 'General';
    setFlashcardDraft({ front: front.trim(), back: '', deck: defaultDeck });
    setFlashcardSource({ front: front.trim(), docId: activeDoc?.id || null, docName: activeDoc ? displayName(activeDoc.name) : null });
    setFlashcardModalOpen(true);
    setFlashcardCreateOpen(true);
    setFlashcardGeneratorOpen(false);
    setAnkiImportPreview(null);
    setAnkiImportStatus('');
    resetFlashcardReview();
  }

  function saveFlashcardDraft() {
    const front = flashcardDraft.front.trim();
    if (!front) {
      setStatus('Flashcard needs text on the front.');
      return;
    }
    const now = new Date().toISOString();
    const deck = flashcardDraft.deck.trim() || 'General';
    persistFlashcards([
      {
        id: makeId(),
        deck,
        front,
        back: flashcardDraft.back.trim(),
        dueDate: todayIsoDate(),
        linkedDocId: flashcardSource?.docId || null,
        linkedDocName: flashcardSource?.docName || null,
        createdAt: now,
        updatedAt: now,
        lastRating: null
      },
      ...flashcards
    ]);
    setFlashcardCreateOpen(false);
    setFlashcardModalOpen(true);
    setToastMessage('✓ Flashcard saved');
    setStatus(`Flashcard saved to ${deck}.`);
  }

  function deleteFlashcard(cardId: string) {
    const card = flashcards.find((item) => item.id === cardId);
    if (!card) return;
    if (!window.confirm('Delete this flashcard?')) return;
    persistFlashcards(flashcards.filter((item) => item.id !== cardId));
  }

  function deleteFlashcardDeck(deck: string) {
    if (deck === 'General') {
      if (!window.confirm('Delete all cards in the General deck?')) return;
    } else if (!window.confirm(`Delete deck "${deck}" and all its flashcards?`)) return;
    persistFlashcards(flashcards.filter((card) => card.deck !== deck));
    setReviewSelectedDecks((current) => current.filter((item) => item !== deck));
  }

  function toggleReviewDeck(deck: string) {
    setReviewSelectedDecks((current) => current.includes(deck) ? current.filter((item) => item !== deck) : [...current, deck]);
  }

  function startFlashcardReview() {
    const decks = reviewSelectedDecks.length ? reviewSelectedDecks : flashcardDeckNames;
    const today = todayIsoDate();
    const due = flashcards.filter((card) => decks.includes(card.deck) && (card.dueDate || today) <= today);
    const queue = due.length ? due : flashcards.filter((card) => decks.includes(card.deck));
    setReviewQueue(queue);
    setReviewStarted(true);
    setReviewFlipped(false);
    setReviewIndex(0);
    setReviewSummary({ again: 0, hard: 0, good: 0, easy: 0 });
  }

  function rateFlashcard(rating: FlashcardRating) {
    const card = reviewQueue[reviewIndex];
    if (!card) return;
    const increments: Record<FlashcardRating, number> = { again: 0, hard: 1, good: 3, easy: 7 };
    const dueDate = rating === 'again' ? todayIsoDate() : addDaysIso(todayIsoDate(), increments[rating]);
    const updatedCards = flashcards.map((item) => item.id === card.id ? { ...item, dueDate, lastRating: rating, updatedAt: new Date().toISOString() } : item);
    persistFlashcards(updatedCards);
    setReviewSummary((current) => ({ ...current, [rating]: current[rating] + 1 }));
    setReviewFlipped(false);

    if (rating === 'again') {
      const rest = reviewQueue.slice(reviewIndex + 1);
      setReviewQueue([...reviewQueue.slice(0, reviewIndex + 1), ...rest, card]);
    }
    setReviewIndex((index) => index + 1);
  }

  function resetFlashcardReview() {
    setReviewStarted(false);
    setReviewQueue([]);
    setReviewIndex(0);
    setReviewFlipped(false);
    setReviewSummary({ again: 0, hard: 0, good: 0, easy: 0 });
  }

  function openFlashcardGenerator() {
    setFlashcardGeneratorOpen(true);
    setFlashcardGeneratorPreview([]);
    setFlashcardGeneratorWarning('');
    setAnkiImportPreview(null);
    setAnkiImportStatus('');
    setFlashcardGeneratorDeck(reviewSelectedDecks[0] || flashcardDeckNames[0] || 'General');
  }

  function openAnkiImportPicker() {
    setFlashcardModalOpen(true);
    setFlashcardCreateOpen(false);
    setFlashcardGeneratorOpen(false);
    resetFlashcardReview();
    setAnkiImportStatus('');
    ankiImportInputRef.current?.click();
  }

  async function handleAnkiImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setFlashcardModalOpen(true);
    setFlashcardCreateOpen(false);
    setFlashcardGeneratorOpen(false);
    resetFlashcardReview();
    setAnkiImportPreview(null);
    setAnkiImportStatus(`Reading ${file.name}...`);
    setStatus(`Importing ${file.name}...`);
    try {
      const preview = await parseAnkiImportFile(file);
      setAnkiImportPreview(preview);
      setAnkiImportStatus(`${preview.cards.length} cards ready. Rename the deck, then save it into Dux Notes.`);
      setStatus(`${preview.cards.length} Anki cards ready to import.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not import this Anki file.';
      setAnkiImportStatus(message);
      setStatus(message);
    }
  }

  function cancelAnkiImport() {
    setAnkiImportPreview(null);
    setAnkiImportStatus('');
  }

  function saveAnkiImportDeck() {
    if (!ankiImportPreview?.cards.length) {
      setStatus('Choose an Anki package first.');
      return;
    }
    const now = new Date().toISOString();
    const deck = ankiImportPreview.deckName.trim() || defaultDeckNameFromFile(ankiImportPreview.fileName);
    const newCards: Flashcard[] = ankiImportPreview.cards.map((card) => ({
      id: makeId(),
      deck,
      front: card.front.trim(),
      back: card.back.trim(),
      dueDate: todayIsoDate(),
      linkedDocId: null,
      linkedDocName: null,
      createdAt: now,
      updatedAt: now,
      lastRating: null
    }));
    persistFlashcards([...newCards, ...flashcards]);
    setReviewSelectedDecks([deck]);
    setAnkiImportPreview(null);
    setAnkiImportStatus('');
    setToastMessage(`✓ Imported ${newCards.length} cards`);
    setStatus(`Imported ${newCards.length} Anki cards into ${deck}.`);
  }

  function resolveFlashcardGeneratorDeck() {
    return flashcardGeneratorDeck === '__new__' ? (flashcardGeneratorNewDeck.trim() || 'Generated') : (flashcardGeneratorDeck.trim() || 'General');
  }

  async function runLocalFlashcardGenerator() {
    const prompt = flashcardGeneratorPrompt.trim();
    if (!prompt) {
      setStatus('Describe what flashcards you want first.');
      return;
    }
    const deck = resolveFlashcardGeneratorDeck();
    const count = extractFlashcardCount(prompt);

    try {
      setStatus('Generating smarter flashcards with Dux AI...');
      const response = await requestDuxFlashcards({ prompt, deck, count });
      const cards = (response.cards || [])
        .map((card) => ({ id: makeId(), deck, front: String(card.front || '').trim(), back: String(card.back || '').trim() }))
        .filter((card) => card.front && card.back)
        .slice(0, Math.max(1, count));

      if (cards.length) {
        setFlashcardGeneratorPreview(cards);
        setFlashcardGeneratorWarning(response.warning || '');
        setStatus(`Generated ${cards.length} smarter flashcards with Dux AI.`);
        return;
      }
    } catch (error) {
      console.warn('Dux AI flashcard generator fallback used:', error);
    }

    const generated = generateLocalFlashcardSet(prompt, deck);
    setFlashcardGeneratorPreview(generated.cards);
    setFlashcardGeneratorWarning(generated.warning ? `${generated.warning} Dux AI was unavailable, so the local generator was used.` : 'Dux AI was unavailable, so the local generator was used.');
    if (generated.warning) setStatus(generated.warning);
  }

  function removeFlashcardPreview(id: string) {
    setFlashcardGeneratorPreview((cards) => cards.filter((card) => card.id !== id));
  }

  function saveGeneratedFlashcards() {
    if (!flashcardGeneratorPreview.length) {
      setStatus('Generate at least one flashcard first.');
      return;
    }
    const now = new Date().toISOString();
    const deck = resolveFlashcardGeneratorDeck();
    const newCards: Flashcard[] = flashcardGeneratorPreview.map((card) => ({
      id: makeId(),
      deck,
      front: card.front.trim(),
      back: card.back.trim(),
      dueDate: todayIsoDate(),
      linkedDocId: null,
      linkedDocName: null,
      createdAt: now,
      updatedAt: now,
      lastRating: null
    }));
    persistFlashcards([...newCards, ...flashcards]);
    setToastMessage(`✓ ${newCards.length} flashcards added to ${deck} deck`);
    setStatus(`${newCards.length} flashcards added to ${deck} deck.`);
    setFlashcardGeneratorOpen(false);
    setFlashcardGeneratorPreview([]);
    setFlashcardGeneratorWarning('');
  }

  function changeWeekZoom(direction: -1 | 1) {
    setWeekRowHeight((current) => {
      const next = getNextWeekRowHeight(current, direction);
      window.localStorage.setItem(WEEK_ROW_HEIGHT_STORAGE_KEY, String(next));
      return next;
    });
  }

  async function sendScratchpadToLibrary() {
    const text = stripHtmlToPlainText(scratchpadText).trim();
    if (!text) {
      setStatus('Quick note is empty.');
      return;
    }
    const now = new Date();
    const iso = now.toISOString();
    const page = createBlankPage('plain');
    const doc: DocumentRecord = {
      id: makeId(),
      name: `Quick note - ${now.toLocaleDateString('en-AU').replace(/\//g, '-')}`, 
      pdfFileName: null,
      themeId: activeThemeId,
      folder: 'Unfiled',
      tags: ['quick-note'],
      docKind: 'quick-note',
      createdAt: iso,
      updatedAt: iso,
      pages: [page],
      annotations: {
        [page.key]: {
          strokes: [],
          imageBoxes: [],
          mathPlaneBoxes: [],
          shapeBoxes: [],
          textBoxes: [{
            id: makeId(),
            x: 80,
            y: 80,
            width: 620,
            minHeight: 260,
            text,
            fontFamily,
            fontSize: 18,
            color: activeTheme.text,
            fontWeight: '400',
            z: 1
          }]
        }
      }
    };
    doc.thumbnailDataUrl = await createDocumentThumbnail(doc, null, activeTheme);
    const saved = await window.localNotes.saveDocument(doc);
    const next = normaliseDocument(saved, activeThemeId);
    setLibrary((previous) => ({ documents: [next, ...previous.documents.filter((item) => item.id !== next.id)] }));
    setScratchpadText('');
    window.localStorage.setItem(SCRATCHPAD_STORAGE_KEY, '');
    setScratchSavedAt(new Date());
    setSidebarMode('notes');
    setStatus('Scratch note sent to Notes.');
  }

  function clearScratchpad() {
    if (!scratchpadText.trim()) return;
    if (!window.confirm('Clear the quick note?')) return;
    setScratchpadText('');
    window.localStorage.setItem(SCRATCHPAD_STORAGE_KEY, '');
    setScratchSavedAt(new Date());
  }

  function openStudyItemTarget(item: StudyScheduleItem) {
    const hasNote = Boolean(item.linkedDocId);
    const hasDeck = Boolean(item.linkedDeck);
    if (hasNote && hasDeck) {
      const choice = window.prompt('Type 1 to open note, or 2 to review flashcards.', '1');
      if (choice === '2') {
        setStudyPlannerOpen(false);
        setFlashcardModalOpen(true);
        setReviewSelectedDecks([item.linkedDeck || 'General']);
        setReviewStarted(false);
      } else {
        void openLinkedStudyNote(item);
      }
      return;
    }
    if (hasDeck) {
      setStudyPlannerOpen(false);
      setFlashcardModalOpen(true);
      setReviewSelectedDecks([item.linkedDeck || 'General']);
      setReviewStarted(false);
      return;
    }
    if (hasNote) void openLinkedStudyNote(item);
  }

  function handleRename() {
    if (!activeDoc) return;
    setRenameDraft(displayName(activeDoc.name));
    setIsRenaming(true);
  }

  function commitRename() {
    if (!activeDoc) {
      setIsRenaming(false);
      return;
    }
    const clean = renameDraft.trim();
    setIsRenaming(false);
    if (!clean) {
      setRenameDraft(displayName(activeDoc.name));
      return;
    }
    const nextName = safePdfName(clean);
    if (nextName === activeDoc.name) return;
    applyDocumentUpdate((doc) => {
      doc.name = nextName;
      return doc;
    }, false);
    setStatus(`Renamed to ${displayName(nextName)}.`);
  }

  function cancelRename() {
    setRenameDraft(activeDoc ? displayName(activeDoc.name) : '');
    setIsRenaming(false);
  }

  function resolveTheme(themeId: NoteThemeId | undefined | null) {
    return themeOptions.find((theme) => theme.id === themeId) || NOTE_THEMES[DEFAULT_THEME_ID];
  }

  function handleThemeChange(themeId: NoteThemeId) {
    const theme = resolveTheme(themeId);
    setActiveThemeId(theme.id);
    setNewNotebookThemeId(theme.id);
    setColour(theme.text);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme.id);
    if (activeDocRef.current) {
      applyDocumentUpdate((doc) => {
        doc.themeId = theme.id;
        return doc;
      }, false);
    }
    setStatus(`Theme changed to ${theme.name}.`);
  }

  function saveCustomThemeFromDraft() {
    const background = safeHexColour(customThemeBackground, '#F9F7FF');
    const accent = safeHexColour(customThemeAccent, '#B5A8D5');
    const text = safeHexColour(customThemeText, readableTextForBackground(background));
    const slug = customThemeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'custom';
    const id = `custom-${slug}-${Date.now().toString(36)}`;
    const nextTheme = makeNoteTheme(id, customThemeName, 'custom saved colour scheme', background, accent, text);
    const nextThemes = [nextTheme, ...customThemes].slice(0, 24);
    setCustomThemes(nextThemes);
    saveCustomThemes(nextThemes);
    setActiveThemeId(nextTheme.id);
    setNewNotebookThemeId(nextTheme.id);
    setColour(nextTheme.text);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme.id);
    if (activeDocRef.current) {
      applyDocumentUpdate((doc) => {
        doc.themeId = nextTheme.id;
        return doc;
      }, false);
    }
    setStatus(`Theme changed to ${nextTheme.name}.`);
    setImageThemeStatus(`Saved “${nextTheme.name}”.`);
  }

  function deleteCustomTheme(themeId: string) {
    const nextThemes = customThemes.filter((theme) => theme.id !== themeId);
    setCustomThemes(nextThemes);
    saveCustomThemes(nextThemes);
    if (activeThemeId === themeId) handleThemeChange(DEFAULT_THEME_ID);
    setImageThemeStatus('Custom colour scheme removed.');
  }

  async function handleCustomThemeImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      setImageThemeStatus('Reading image colours...');
      const colours = await extractDominantColoursFromImage(file);
      if (!colours.length) {
        setImageThemeStatus('Could not find strong colours in that image. Try a clearer image.');
        return;
      }
      const sorted = [...colours].sort((a, b) => colourLuminance(b) - colourLuminance(a));
      const rawBackground = sorted[0] || colours[0];
      const background = colourLuminance(rawBackground) < 0.42 ? mixHex(rawBackground, '#FFFFFF', 0.68) : rawBackground;
      const accent = colours.find((colourValue) => colourValue !== rawBackground && saturation(hexToRgb(colourValue) || { r: 0, g: 0, b: 0 }) > 28) || colours[1] || colours[0];
      const text = readableTextForBackground(background);
      setCustomThemeBackground(background);
      setCustomThemeAccent(accent);
      setCustomThemeText(text);
      setCustomThemeName(file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Image theme');
      setImageThemeStatus(`Picked ${colours.slice(0, 3).join(', ')} from the image. Name it, then save.`);
    } catch {
      setImageThemeStatus('Could not read that image. Try a PNG or JPG.');
    }
  }

  function handleUndo() {
    const previous = undoStackRef.current.pop();
    setUndoCount(undoStackRef.current.length);
    if (!previous) return;
    const current = activeDocRef.current;
    if (current) redoStackRef.current.push(cloneDocument(current));
    if (redoStackRef.current.length > 50) redoStackRef.current.shift();
    setRedoCount(redoStackRef.current.length);
    const restored = normaliseDocument(previous, activeThemeId);
    activeDocRef.current = restored;
    setActiveDoc(restored);
    clearSelection();
    if (restored.themeId) setActiveThemeId(resolveTheme(restored.themeId).id);
    setLibrary((currentLibrary) => ({ documents: currentLibrary.documents.map((doc) => (doc.id === restored.id ? restored : doc)) }));
    setPageIndex((index) => clamp(index, 0, Math.max(0, restored.pages.length - 1)));
    scheduleSave(restored);
    setStatus('Undid last change.');
  }

  function handleRedo() {
    const nextDoc = redoStackRef.current.pop();
    setRedoCount(redoStackRef.current.length);
    if (!nextDoc) return;
    const current = activeDocRef.current;
    if (current) undoStackRef.current.push(cloneDocument(current));
    if (undoStackRef.current.length > 50) undoStackRef.current.shift();
    setUndoCount(undoStackRef.current.length);
    const restored = normaliseDocument(nextDoc, activeThemeId);
    activeDocRef.current = restored;
    setActiveDoc(restored);
    clearSelection();
    if (restored.themeId) setActiveThemeId(resolveTheme(restored.themeId).id);
    setLibrary((currentLibrary) => ({ documents: currentLibrary.documents.map((doc) => (doc.id === restored.id ? restored : doc)) }));
    setPageIndex((index) => clamp(index, 0, Math.max(0, restored.pages.length - 1)));
    scheduleSave(restored);
    setStatus('Redid last change.');
  }

  function handleDeleteSelectedElements(pageKeyOverride?: string) {
    const key = pageKeyOverride || getActivePageData()?.page.key;
    if (!key || selectedElementKeys.length === 0) return;
    const keys = new Set(selectedElementKeys);
    const imageIds = selectedElementKeys
      .map(parseElementKey)
      .filter((item): item is SelectedElement => Boolean(item && item.kind === 'image'))
      .map((item) => item.id);
    const linkedMaskIds = new Set(imageIds.map((id) => `${id}-mask`));
    applyDocumentUpdate((doc) => {
      const annotations = getPageAnnotations(doc, key);
      setPageAnnotations(doc, key, {
        strokes: annotations.strokes.filter((stroke) => !keys.has(elementKey('stroke', stroke.id))),
        textBoxes: annotations.textBoxes.filter((box) => !keys.has(elementKey('text', box.id))),
        imageBoxes: annotations.imageBoxes.filter((box) => !keys.has(elementKey('image', box.id))),
        mathPlaneBoxes: annotations.mathPlaneBoxes.filter((plane) => !keys.has(elementKey('mathPlane', plane.id))),
        shapeBoxes: annotations.shapeBoxes.filter((shape) => !keys.has(elementKey('shape', shape.id)) && !linkedMaskIds.has(shape.id))
      });
      return doc;
    });
    clearSelection();
    setStatus('Selected item removed.');
  }

  function handleDuplicateSelectedElements(pageKeyOverride?: string) {
    const key = pageKeyOverride || getActivePageData()?.page.key;
    if (!key || selectedElementKeys.length === 0) return;
    const keys = new Set(selectedElementKeys);
    const offset = 24;
    const newKeys: string[] = [];
    applyDocumentUpdate((doc) => {
      const annotations = getPageAnnotations(doc, key);
      const nextAnnotations: PageAnnotations = {
        strokes: [...annotations.strokes],
        textBoxes: [...annotations.textBoxes],
        imageBoxes: [...annotations.imageBoxes],
        mathPlaneBoxes: [...annotations.mathPlaneBoxes],
        shapeBoxes: [...annotations.shapeBoxes]
      };
      let z = nextZIndex(annotations);
      for (const stroke of annotations.strokes) {
        if (!keys.has(elementKey('stroke', stroke.id))) continue;
        const id = makeId();
        nextAnnotations.strokes.push({ ...stroke, id, z: z++, points: stroke.points.map((point) => ({ ...point, x: point.x + offset, y: point.y + offset })) });
        newKeys.push(elementKey('stroke', id));
      }
      for (const box of annotations.textBoxes) {
        if (!keys.has(elementKey('text', box.id))) continue;
        const id = makeId();
        nextAnnotations.textBoxes.push({ ...box, id, z: z++, x: box.x + offset, y: box.y + offset });
        newKeys.push(elementKey('text', id));
      }
      for (const image of annotations.imageBoxes) {
        if (!keys.has(elementKey('image', image.id))) continue;
        const id = makeId();
        nextAnnotations.imageBoxes.push({ ...image, id, z: z++, x: image.x + offset, y: image.y + offset, createdAt: new Date().toISOString(), name: `${image.name || 'Image'} copy` });
        newKeys.push(elementKey('image', id));
      }
      for (const plane of annotations.mathPlaneBoxes) {
        if (!keys.has(elementKey('mathPlane', plane.id))) continue;
        const id = makeId();
        nextAnnotations.mathPlaneBoxes.push({ ...plane, id, z: z++, x: plane.x + offset, y: plane.y + offset });
        newKeys.push(elementKey('mathPlane', id));
      }
      for (const shape of annotations.shapeBoxes) {
        if (!keys.has(elementKey('shape', shape.id))) continue;
        const id = makeId();
        nextAnnotations.shapeBoxes.push({ ...shape, id, z: z++, x: shape.x + offset, y: shape.y + offset });
        newKeys.push(elementKey('shape', id));
      }
      setPageAnnotations(doc, key, nextAnnotations);
      return doc;
    });
    applySelection(newKeys);
    setStatus('Duplicated selection.');
  }


  function handleSetLabel(label: LabelId | '') {
    if (!activeDoc) return;
    applyDocumentUpdate((doc) => {
      doc.label = label || null;
      doc.tags = (doc.tags || []).filter((tag) => SYSTEM_TAGS.has(tag));
      return doc;
    }, false);
    setLabelMenuOpen(false);
    const option = getLabelOption(label || null);
    setStatus(label ? `Tag set to ${option.name}.` : 'Tag cleared.');
  }

  function handleSetCustomTag(existingTag?: string) {
    if (!activeDoc) return;
    const raw = existingTag || window.prompt('Custom tag name:', getDocumentCustomTags(activeDoc)[0] || '');
    if (raw === null) return;
    const [tag] = cleanTags(raw);
    if (!tag) return;
    setCustomTags((current) => saveCustomTags([...current, tag]));
    applyDocumentUpdate((doc) => {
      doc.label = null;
      doc.tags = [...(doc.tags || []).filter((item) => SYSTEM_TAGS.has(item)), tag];
      return doc;
    }, false);
    setLabelMenuOpen(false);
    setStatus(`Tag set to ${tag}.`);
  }

  async function handleDeleteCustomTag(tag: string) {
    const cleanTag = tag.trim();
    if (!cleanTag || SYSTEM_TAGS.has(cleanTag)) return;
    const confirmed = window.confirm(`Delete custom tag '${cleanTag}'? It will be removed from every document that uses it.`);
    if (!confirmed) return;

    setCustomTags(saveCustomTags(customTags.filter((item) => item !== cleanTag)));
    const updatedDocuments: DocumentRecord[] = [];
    const documents = library.documents.map((doc) => {
      if (!doc.tags?.includes(cleanTag)) return doc;
      const nextDoc = normaliseDocument({
        ...doc,
        tags: doc.tags.filter((item) => item !== cleanTag)
      }, activeThemeId);
      updatedDocuments.push(nextDoc);
      return nextDoc;
    });
    setLibrary({ documents });

    const currentActive = activeDocRef.current;
    if (currentActive?.tags?.includes(cleanTag)) {
      const replacement = documents.find((doc) => doc.id === currentActive.id) || normaliseDocument({
        ...currentActive,
        tags: currentActive.tags.filter((item) => item !== cleanTag)
      }, activeThemeId);
      activeDocRef.current = replacement;
      setActiveDoc(replacement);
    }

    await Promise.all(updatedDocuments.map((doc) => window.localNotes.saveDocument(doc)));
    setLabelMenuOpen(false);
    setStatus(`Custom tag '${cleanTag}' deleted.`);
  }

  function handleAddBottomSpace() {
    const data = getActivePageData();
    if (!data) return;
    applyDocumentUpdate((doc) => {
      doc.pages[data.index].extraSpace = (doc.pages[data.index].extraSpace || 0) + spaceHeight;
      return doc;
    });
    setStatus(`Added ${spaceHeight}px of writing space below this page.`);
  }


  function handleInsertBlankPage(templateOverride?: BlankPageTemplate) {
    if (!activeDocRef.current) return;
    const data = getActivePageData();
    const template = templateOverride || (data?.page.kind === 'blank' ? data.page.template : newNotebookTemplate) || 'ruled';
    const blankPage = createBlankPage(template);
    const insertAfter = data ? data.index + 1 : 0;
    applyDocumentUpdate((doc) => {
      doc.pages.splice(insertAfter, 0, blankPage);
      setPageAnnotations(doc, blankPage.key, { strokes: [], textBoxes: [], imageBoxes: [], mathPlaneBoxes: [], shapeBoxes: [] });
      return doc;
    });
    pageIndexRef.current = insertAfter;
    setPageIndex(insertAfter);
    setBlankPageMenuOpen(false);
    window.requestAnimationFrame(() => pageShadowRefs.current[blankPage.key]?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    setStatus(`Inserted a ${template} blank page.`);
  }


  function handleClearPage() {
    const data = getActivePageData();
    if (!data) return;
    const confirmed = window.confirm('Clear this page? This removes all ink, text, and images on the current page.');
    if (!confirmed) return;
    applyDocumentUpdate((doc) => {
      setPageAnnotations(doc, data.page.key, { strokes: [], textBoxes: [], imageBoxes: [], mathPlaneBoxes: [], shapeBoxes: [] });
      return doc;
    });
    setStatus('Cleared ink, text, and images from this page.');
  }



  function requestDeletePageAt(index: number) {
    const doc = activeDocRef.current;
    if (!doc || isQuickNoteDoc(doc)) return;
    if (doc.pages.length <= 1) {
      window.alert('This notebook only has one page. Use Clear page if you want to empty it.');
      return;
    }
    const safeIndex = clamp(index, 0, doc.pages.length - 1);
    const confirmed = window.confirm(`Delete page ${safeIndex + 1}? This removes the page and everything written on it.`);
    if (!confirmed) return;
    const nextIndex = clamp(safeIndex, 0, doc.pages.length - 2);
    applyDocumentUpdate((draft) => {
      const removed = draft.pages.splice(safeIndex, 1)[0];
      if (removed?.key && draft.annotations) delete draft.annotations[removed.key];
      if (removed?.key && draft.pageTitles) delete draft.pageTitles[removed.key];
      if (removed?.key && draft.bookmarks) delete draft.bookmarks[removed.key];
      return draft;
    });
    pageIndexRef.current = nextIndex;
    setPageIndex(nextIndex);
    window.requestAnimationFrame(() => pageShadowRefs.current[activeDocRef.current?.pages[nextIndex]?.key || '']?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    clearSelection();
    setStatus(`Deleted page ${safeIndex + 1}.`);
  }

  function handleDeleteCurrentPage() {
    requestDeletePageAt(pageIndexRef.current);
  }

  function getPageDisplayTitle(doc: DocumentRecord | null, page: NotebookPage, index: number) {
    const saved = doc?.pageTitles?.[page.key]?.trim();
    return saved || `Page ${index + 1}`;
  }

  function updatePageTitle(pageKey: string, title: string) {
    applyDocumentUpdate((doc) => {
      doc.pageTitles = { ...(doc.pageTitles || {}), [pageKey]: title };
      return doc;
    }, false);
  }

  function togglePageBookmark(pageKey: string) {
    applyDocumentUpdate((doc) => {
      doc.bookmarks = { ...(doc.bookmarks || {}), [pageKey]: !doc.bookmarks?.[pageKey] };
      return doc;
    }, false);
  }

  function jumpToPageKey(pageKey: string) {
    const doc = activeDocRef.current;
    if (!doc) return;
    const index = doc.pages.findIndex((page) => page.key === pageKey);
    if (index < 0) return;
    setActivePageIndex(index, true);
    setContentsOpen(false);
  }

  function handleRotateCurrentPage() {
    const data = getActivePageData();
    if (!data) return;
    applyDocumentUpdate((doc) => {
      const page = doc.pages[data.index];
      if (page.kind === 'blank') {
        const nextWidth = page.height;
        const nextHeight = page.width;
        page.width = nextWidth;
        page.height = nextHeight;
      } else {
        page.rotation = page.rotation === 90 ? 0 : 90;
      }
      return doc;
    });
    delete pageViewsRef.current[data.page.key];
    setPageViews((current) => { const next = { ...current }; delete next[data.page.key]; return next; });
    setStatus('Rotated current page.');
  }

  function handleCropCurrentPdfPage() {
    const data = getActivePageData();
    if (!data || data.page.kind !== 'pdf') {
      setStatus('Cropping is available for imported PDF pages.');
      return;
    }
    const current = data.page.crop || { top: 0, right: 0, bottom: 0, left: 0 };
    const input = window.prompt('Crop margins in page points: top, right, bottom, left. Use 0,0,0,0 to reset.', `${current.top}, ${current.right}, ${current.bottom}, ${current.left}`);
    if (input === null) return;
    const values = input.split(',').map((item) => Math.max(0, Math.round(Number(item.trim()) || 0)));
    if (values.length !== 4) {
      setStatus('Crop needs four numbers: top, right, bottom, left.');
      return;
    }
    applyDocumentUpdate((doc) => {
      const page = doc.pages[data.index];
      if (page.kind === 'pdf') page.crop = { top: values[0], right: values[1], bottom: values[2], left: values[3] };
      return doc;
    });
    delete pageViewsRef.current[data.page.key];
    setPageViews((current) => { const next = { ...current }; delete next[data.page.key]; return next; });
    setStatus(values.every((value) => value === 0) ? 'PDF crop reset.' : 'PDF page cropped.');
  }

  function resolveSelectedImageId() {
    return selectedImageId || selectedElementKeys.map(parseElementKey).find((item): item is SelectedElement => Boolean(item && item.kind === 'image'))?.id || null;
  }

  function normaliseRotation(degrees: number) {
    return ((degrees % 360) + 360) % 360;
  }

  function snapImageRotation(degrees: number) {
    return normaliseRotation(Math.round(degrees / IMAGE_ROTATION_STEP_DEGREES) * IMAGE_ROTATION_STEP_DEGREES);
  }

  function snapImageRotationNearMainAngles(degrees: number) {
    const normalised = normaliseRotation(degrees);
    const snapPoints = [0, 90, 180, 270, 360];
    for (const snapPoint of snapPoints) {
      const distance = Math.abs(normalised - snapPoint);
      if (Math.min(distance, 360 - distance) <= 2) return normaliseRotation(snapPoint);
    }
    return normalised;
  }

  function updateImageRotation(imageId: string, pageKey: string, rotation: number, saveNow = false) {
    const nextRotation = normaliseRotation(rotation);
    const next = activeDocRef.current ? normaliseDocument(cloneDocument(activeDocRef.current), activeThemeId) : null;
    if (!next) return;
    const annotations = getPageAnnotations(next, pageKey);
    setPageAnnotations(next, pageKey, {
      ...annotations,
      imageBoxes: annotations.imageBoxes.map((box) => box.id === imageId ? { ...box, rotation: nextRotation } : box)
    });
    activeDocRef.current = next;
    setActiveDoc(next);
    setLibrary((current) => ({ documents: current.documents.map((doc) => (doc.id === next.id ? next : doc)) }));
    if (saveNow) scheduleSave(next);
  }

  function rotateSelectedImage(pageKey?: string, delta = IMAGE_ROTATION_STEP_DEGREES) {
    const data = getActivePageData();
    const key = pageKey || data?.page.key;
    const imageId = resolveSelectedImageId();
    if (!key || !imageId) return;
    const doc = activeDocRef.current;
    const annotations = doc ? getPageAnnotations(doc, key) : null;
    const box = annotations?.imageBoxes.find((item) => item.id === imageId);
    if (!box) return;
    pushUndo();
    updateImageRotation(imageId, key, (box.rotation || 0) + delta, true);
    applySelection([elementKey('image', imageId)]);
    setStatus('Rotated image.');
  }

  function handleImageRotateStart(event: ReactPointerEvent<HTMLButtonElement>, box: ImageBox, pageKey?: string) {
    if (box.locked) {
      event.preventDefault();
      event.stopPropagation();
      setStatus('Image is locked. Unlock it before rotating.');
      return;
    }
    const doc = activeDocRef.current;
    const resolvedPageKey = pageKey || getActivePageData()?.page.key;
    const resolvedIndex = doc?.pages.findIndex((page) => page.key === resolvedPageKey) ?? -1;
    if (!doc || !resolvedPageKey || resolvedIndex < 0) return;
    event.preventDefault();
    event.stopPropagation();
    pushUndo();
    setActivePageIndex(resolvedIndex, false);
    applySelection([elementKey('image', box.id)]);
    const pageNode = pageShadowRefs.current[resolvedPageKey];
    const pageRect = pageNode?.getBoundingClientRect();
    const centerClientX = pageRect ? pageRect.left + (box.x + box.width / 2) * zoom : event.clientX;
    const centerClientY = pageRect ? pageRect.top + (box.y + box.height / 2) * zoom : event.clientY;
    const startAngle = Math.atan2(event.clientY - centerClientY, event.clientX - centerClientX) * 180 / Math.PI;
    imageRotateRef.current = {
      originalDoc: cloneDocument(doc),
      imageId: box.id,
      pageKey: resolvedPageKey,
      centerClientX,
      centerClientY,
      startAngle,
      startRotation: box.rotation || 0,
      moved: false
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleImageRotateMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const rotate = imageRotateRef.current;
    if (!rotate) return;
    event.preventDefault();
    event.stopPropagation();
    const currentAngle = Math.atan2(event.clientY - rotate.centerClientY, event.clientX - rotate.centerClientX) * 180 / Math.PI;
    const nextRotation = snapImageRotationNearMainAngles(rotate.startRotation + (currentAngle - rotate.startAngle));
    rotate.moved = rotate.moved || Math.abs(currentAngle - rotate.startAngle) > 4;
    const next = normaliseDocument(cloneDocument(rotate.originalDoc), activeThemeId);
    const annotations = getPageAnnotations(next, rotate.pageKey);
    setPageAnnotations(next, rotate.pageKey, {
      ...annotations,
        imageBoxes: annotations.imageBoxes.map((image) => image.id === rotate.imageId ? { ...image, rotation: nextRotation } : image)
    });
    activeDocRef.current = next;
    setActiveDoc(next);
    setLibrary((current) => ({ documents: current.documents.map((doc) => (doc.id === next.id ? next : doc)) }));
  }

  function handleImageRotateEnd(event: ReactPointerEvent<HTMLButtonElement>) {
    const rotate = imageRotateRef.current;
    if (!rotate) return;
    event.preventDefault();
    event.stopPropagation();
    if (!rotate.moved) {
      const next = normaliseDocument(cloneDocument(rotate.originalDoc), activeThemeId);
      const annotations = getPageAnnotations(next, rotate.pageKey);
      setPageAnnotations(next, rotate.pageKey, {
        ...annotations,
        imageBoxes: annotations.imageBoxes.map((image) => image.id === rotate.imageId ? { ...image, rotation: snapImageRotation((image.rotation || 0) + IMAGE_ROTATION_STEP_DEGREES) } : image)
      });
      activeDocRef.current = next;
      setActiveDoc(next);
      setLibrary((current) => ({ documents: current.documents.map((doc) => (doc.id === next.id ? next : doc)) }));
    }
    const current = activeDocRef.current;
    imageRotateRef.current = null;
    if (current) scheduleSave(current);
    setStatus('Image rotated.');
  }

  function applyTextBoxBackground(value: string) {
    setTextBoxBackground(value);
    updateSelectedTextBox({ backgroundColor: value }, true);
    setStatus(value === 'transparent' ? 'Text box fill removed.' : 'Text box fill updated.');
  }



  function splitStrokeAroundPath(stroke: Stroke, path: Point[], radius: number): Stroke[] {
    if (stroke.points.length <= 1) return stroke.points.some((point) => pointNearPath(point, path, radius)) ? [] : [stroke];
    const segments: Point[][] = [];
    let current: Point[] = pointNearPath(stroke.points[0], path, radius) ? [] : [stroke.points[0]];

    for (let index = 1; index < stroke.points.length; index += 1) {
      const previous = stroke.points[index - 1];
      const next = stroke.points[index];
      const hit = pointNearPath(next, path, radius) || segmentNearPath(previous, next, path, radius);
      if (hit) {
        if (current.length >= 2) segments.push(current);
        current = pointNearPath(next, path, radius) ? [] : [next];
      } else {
        current.push(next);
      }
    }

    if (current.length >= 2) segments.push(current);
    if (segments.length === 1 && segments[0].length === stroke.points.length) return [stroke];
    return segments.map((points, index) => ({
      ...stroke,
      id: index === 0 ? stroke.id : `${stroke.id}-pixel-${makeId()}-${index}`,
      points
    }));
  }

  function getPathLength(points: Point[]): number {
    let total = 0;
    for (let index = 1; index < points.length; index += 1) {
      total += distanceBetween(points[index - 1], points[index]);
    }
    return total;
  }

  function getPointBounds(points: Point[]) {
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  function boundsOverlap(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }, padding = 0): boolean {
    return a.x - padding <= b.x + b.width
      && a.x + a.width + padding >= b.x
      && a.y - padding <= b.y + b.height
      && a.y + a.height + padding >= b.y;
  }

  function getStrokeBounds(stroke: Stroke) {
    const bounds = getPointBounds(stroke.points);
    const padding = Math.max(4, stroke.width || 1);
    return {
      x: bounds.x - padding,
      y: bounds.y - padding,
      width: bounds.width + padding * 2,
      height: bounds.height + padding * 2
    };
  }

  function countScribbleDirectionChanges(points: Point[], movementThreshold = 3): number {
    let xDirection = 0;
    let yDirection = 0;
    let changes = 0;

    for (let index = 1; index < points.length; index += 1) {
      const dx = points[index].x - points[index - 1].x;
      const dy = points[index].y - points[index - 1].y;
      const nextXDirection = Math.abs(dx) > movementThreshold ? Math.sign(dx) : xDirection;
      const nextYDirection = Math.abs(dy) > movementThreshold ? Math.sign(dy) : yDirection;

      if (xDirection && nextXDirection && nextXDirection !== xDirection) changes += 1;
      if (yDirection && nextYDirection && nextYDirection !== yDirection) changes += 1;
      xDirection = nextXDirection || xDirection;
      yDirection = nextYDirection || yDirection;
    }

    return changes;
  }

  function getScribbleEraseTargetIds(stroke: Stroke, existingStrokes: Stroke[]): string[] {
    if (stroke.tool !== 'pen') return [];
    const path = stroke.points;
    if (path.length < 14) return [];

    const bounds = getPointBounds(path);
    const width = Math.max(1, bounds.width);
    const height = Math.max(1, bounds.height);
    const diagonal = Math.hypot(width, height);
    const pathLength = getPathLength(path);
    const compactness = pathLength / Math.max(1, diagonal);
    const zoomScale = Math.max(1, zoom);
    const zoomAdjustedThresholdScale = clamp(1 / zoomScale, 0.34, 1);
    const movementThreshold = Math.max(0.6, 3 * zoomAdjustedThresholdScale);
    const directionChanges = countScribbleDirectionChanges(path, movementThreshold);
    const requiredDirectionChanges = Math.max(3, Math.round(5 * zoomAdjustedThresholdScale));

    const looksLikeScratchOut = pathLength > 90 * zoomAdjustedThresholdScale
      && diagonal > 28 * zoomAdjustedThresholdScale
      && width > 18 * zoomAdjustedThresholdScale
      && height > 8 * zoomAdjustedThresholdScale
      && compactness > 2.35
      && directionChanges >= requiredDirectionChanges;

    if (!looksLikeScratchOut) return [];

    const searchRadius = Math.max(10, stroke.width * 2.6);
    const expandedScribbleBounds = { x: bounds.x, y: bounds.y, width, height };
    const targetIds = existingStrokes
      .filter((candidate) => candidate.id !== stroke.id)
      .filter((candidate) => boundsOverlap(expandedScribbleBounds, getStrokeBounds(candidate), searchRadius * 2))
      .filter((candidate) => strokeIsNearPath(candidate, path, searchRadius))
      .map((candidate) => candidate.id);

    return targetIds;
  }

  function eraseAlongPath(path: Point[]) {
    const data = getActivePageData();
    if (!data || path.length === 0) return;
    const cleanPath = path.filter((point, index) => index === 0 || distanceBetween(point, path[index - 1]) > 0.05);
    if (cleanPath.length === 0) return;

    const doc = activeDocRef.current;
    if (!doc) return;
    const annotations = getPageAnnotations(doc, data.page.key);
    const radius = Math.max(12, strokeWidth * 3);
    const pathBounds = getPointBounds(cleanPath);
    const paddedPathBounds = {
      x: pathBounds.x - radius,
      y: pathBounds.y - radius,
      width: pathBounds.width + radius * 2,
      height: pathBounds.height + radius * 2
    };

    let nextAnnotations: PageAnnotations;
    if (eraserMode === 'pixel') {
      const strokes = annotations.strokes.flatMap((stroke) => (
        boundsOverlap(paddedPathBounds, getStrokeBounds(stroke), 0)
          ? splitStrokeAroundPath(stroke, cleanPath, radius)
          : [stroke]
      ));
      nextAnnotations = { ...annotations, strokes };
    } else {
      const pointInsideRect = (rect: { x: number; y: number; width: number; height: number }) => (
        boundsOverlap(paddedPathBounds, rect, 0)
        && cleanPath.some((point) => point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height)
      );

      const strokes = annotations.strokes.filter((stroke) => !boundsOverlap(paddedPathBounds, getStrokeBounds(stroke), 0) || !strokeIsNearPath(stroke, cleanPath, radius));
      const textBoxes = annotations.textBoxes.filter((box) => {
        return !pointInsideRect({ x: box.x, y: box.y, width: box.width, height: box.minHeight });
      });
      const imageBoxes = annotations.imageBoxes.filter((box) => {
        return !pointInsideRect({ x: box.x, y: box.y, width: box.width, height: box.height });
      });
      const mathPlaneBoxes = annotations.mathPlaneBoxes.filter((plane) => {
        return !pointInsideRect({ x: plane.x, y: plane.y, width: plane.width, height: plane.height });
      });
      const shapeBoxes = annotations.shapeBoxes.filter((shape) => {
        const bounds = normaliseRect(shape.x, shape.y, shape.width, shape.height);
        return !pointInsideRect(bounds);
      });
      nextAnnotations = { strokes, textBoxes, imageBoxes, mathPlaneBoxes, shapeBoxes };
    }

    const nextDoc = {
      ...doc,
      updatedAt: new Date().toISOString(),
      annotations: {
        ...doc.annotations,
        [data.page.key]: normaliseAnnotationZ(nextAnnotations)
      }
    };
    activeDocRef.current = nextDoc;
    scheduleEraserOverlayRedraw(data.page.key);
    if (
      eraserMode === 'object'
      && (
        annotations.textBoxes.length !== nextAnnotations.textBoxes.length
        || annotations.imageBoxes.length !== nextAnnotations.imageBoxes.length
        || annotations.mathPlaneBoxes.length !== nextAnnotations.mathPlaneBoxes.length
        || annotations.shapeBoxes.length !== nextAnnotations.shapeBoxes.length
      )
    ) {
      scheduleEraserStateCommit(nextDoc);
    }
  }

  function strokeIsNearPath(stroke: Stroke, path: Point[], radius: number): boolean {
    if (path.length <= 1) return strokeIsNearPoint(stroke, path[0], radius);
    if (stroke.points.length <= 1) return pointNearPath(stroke.points[0], path, radius);
    for (let index = 1; index < stroke.points.length; index += 1) {
      if (segmentNearPath(stroke.points[index - 1], stroke.points[index], path, radius)) return true;
    }
    return false;
  }


  function insertSpaceAt(point: Point) {
    const data = getActivePageData();
    if (!data) return;
    const existingSpacers = data.page.spacers || [];
    const spacerHit = findSpacerAtVisualY(existingSpacers, point.y);
    const sourceY = spacerHit ? spacerHit.spacer.y : visualYToSourceY(point.y, existingSpacers);
    const visualInsertY = spacerHit ? point.y : sourceYToVisualY(sourceY, existingSpacers);

    applyDocumentUpdate((doc) => {
      const page = doc.pages[data.index];
      const orderedSpacers = normaliseSpacerOrder(page.spacers || []);
      const hit = findSpacerAtVisualY(orderedSpacers, point.y);

      if (hit && hit.spacer.height > 12) {
        const topHeight = Math.max(0, hit.offset);
        const bottomHeight = Math.max(0, hit.spacer.height - hit.offset);
        const replacement: PageSpacer[] = [];
        if (topHeight > 1) replacement.push({ ...hit.spacer, id: hit.spacer.id, height: topHeight });
        replacement.push({ id: makeId(), y: hit.spacer.y, height: spaceHeight, order: (hit.spacer.order ?? hit.index) + 0.1 });
        if (bottomHeight > 1) replacement.push({ id: makeId(), y: hit.spacer.y, height: bottomHeight, order: (hit.spacer.order ?? hit.index) + 0.2 });
        page.spacers = normaliseSpacerOrder(orderedSpacers.flatMap((spacer) => spacer.id === hit.spacer.id ? replacement : [spacer]));
      } else {
        const newSpacer: PageSpacer = { id: makeId(), y: sourceY, height: spaceHeight, order: orderedSpacers.length + 1 };
        page.spacers = normaliseSpacerOrder([...orderedSpacers, newSpacer]);
      }

      const annotations = getPageAnnotations(doc, page.key);
      setPageAnnotations(doc, page.key, shiftAnnotationsAfterY(annotations, visualInsertY, spaceHeight));
      return doc;
    });
    setStatus(`Inserted ${spaceHeight}px of space. Drag the handle to resize it, or press Cmd/Ctrl Z to undo.`);
  }


  function focusTextBoxNow(boxId: string) {
    const target = document.querySelector(`[data-text-id="${boxId}"]`) as HTMLTextAreaElement | null;
    if (!target) return;
    target.focus();
    target.setSelectionRange(target.value.length, target.value.length);
  }

  function focusTextBoxSoon(boxId: string) {
    window.setTimeout(() => focusTextBoxNow(boxId), 40);
  }

  function rememberTextCursor(target: HTMLTextAreaElement, pageKey: string) {
    const boxId = target.dataset.textId;
    if (!boxId) return;
    textCursorRef.current = {
      boxId,
      pageKey,
      start: target.selectionStart ?? target.value.length,
      end: target.selectionEnd ?? target.value.length
    };
  }

  function focusTextBoxAtSoon(boxId: string, index: number) {
    window.setTimeout(() => {
      const target = document.querySelector(`[data-text-id="${boxId}"]`) as HTMLTextAreaElement | null;
      if (!target) return;
      target.focus();
      const safeIndex = clamp(index, 0, target.value.length);
      target.setSelectionRange(safeIndex, safeIndex);
    }, 40);
  }

  function handleCreateTextBox(point: Point) {
    const data = getActivePageData();
    if (!data) return;
    const snappedY = snapTextYToRule(data.page, point.y, fontSize);
    const newBox: TextBox = {
      id: makeId(),
      x: clamp(point.x, 8, Math.max(8, data.view.width - DEFAULT_TEXT_WIDTH - 8)),
      y: clamp(snappedY, 8, Math.max(8, data.view.totalHeight - DEFAULT_TEXT_HEIGHT - 8)),
      width: DEFAULT_TEXT_WIDTH,
      minHeight: DEFAULT_TEXT_HEIGHT,
      text: '',
      fontFamily,
      fontSize,
      color: colour,
      fontWeight,
      backgroundColor: textBoxBackground,
      z: nextZIndex(data.annotations)
    };

    applyDocumentUpdate((doc) => {
      const annotations = getPageAnnotations(doc, data.page.key);
      setPageAnnotations(doc, data.page.key, { ...annotations, textBoxes: [...annotations.textBoxes, newBox] });
      return doc;
    });
    applySelection([elementKey('text', newBox.id)]);
    chooseTool('text');
    focusTextBoxSoon(newBox.id);
    setStatus('Text box added. Select it later to change font, colour, fill or size.');
  }


  function updateTextBox(boxId: string, updates: Partial<TextBox>, saveUndo = false, pageKey?: string) {
    const key = pageKey || getActivePageData()?.page.key;
    if (!key) return;
    applyDocumentUpdate((doc) => {
      const annotations = getPageAnnotations(doc, key);
      setPageAnnotations(doc, key, {
        ...annotations,
        textBoxes: annotations.textBoxes.map((box) => (box.id === boxId ? { ...box, ...updates } : box))
      });
      return doc;
    }, saveUndo);
  }

  function findTextBoxInDocument(boxId: string, doc = activeDocRef.current) {
    if (!doc) return null;
    for (const page of doc.pages) {
      const box = getPageAnnotations(doc, page.key).textBoxes.find((item) => item.id === boxId);
      if (box) return { pageKey: page.key, box };
    }
    return null;
  }

  function getMathTextInsertionTarget() {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLTextAreaElement) {
      const boxId = activeElement.dataset.textId;
      const found = boxId ? findTextBoxInDocument(boxId) : null;
      if (boxId && found) {
        return {
          boxId,
          pageKey: found.pageKey,
          box: found.box,
          start: activeElement.selectionStart ?? activeElement.value.length,
          end: activeElement.selectionEnd ?? activeElement.value.length
        };
      }
    }

    const cursor = textCursorRef.current;
    const cursorTarget = cursor ? findTextBoxInDocument(cursor.boxId) : null;
    if (cursor && cursorTarget) return { ...cursor, box: cursorTarget.box };

    const selectedTextTarget = selectedTextId ? findTextBoxInDocument(selectedTextId) : null;
    if (selectedTextId && selectedTextTarget) {
      const end = selectedTextTarget.box.text.length;
      return { boxId: selectedTextId, pageKey: selectedTextTarget.pageKey, box: selectedTextTarget.box, start: end, end };
    }

    return null;
  }

  function estimateMathTextHeight(text: string, size = fontSize) {
    const lineCount = Math.max(1, text.split('\n').length);
    return Math.max(DEFAULT_TEXT_HEIGHT, Math.ceil((lineCount + 1) * size * 1.45));
  }

  function createMathTextBox(text: string, mode: 'edit' | 'select' = 'select') {
    const data = getActivePageData();
    if (!data) {
      setStatus('Open a notebook before inserting maths.');
      return;
    }

    const height = estimateMathTextHeight(text);
    const maxWidth = Math.max(180, data.view.width - 16);
    const width = Math.min(maxWidth, Math.max(DEFAULT_TEXT_WIDTH, Math.min(520, text.length * 9)));
    const newBox: TextBox = {
      id: makeId(),
      x: clamp((data.view.width - width) / 2, 8, Math.max(8, data.view.width - width - 8)),
      y: clamp((data.view.totalHeight - height) / 2, 8, Math.max(8, data.view.totalHeight - height - 8)),
      width,
      minHeight: height,
      text,
      fontFamily,
      fontSize,
      color: colour,
      fontWeight,
      backgroundColor: textBoxBackground,
      z: nextZIndex(data.annotations)
    };

    applyDocumentUpdate((doc) => {
      const annotations = getPageAnnotations(doc, data.page.key);
      setPageAnnotations(doc, data.page.key, { ...annotations, textBoxes: [...annotations.textBoxes, newBox] });
      return doc;
    });
    applySelection([elementKey('text', newBox.id)]);
    if (mode === 'edit') {
      chooseTool('text');
      focusTextBoxAtSoon(newBox.id, text.length);
      setStatus('Maths text added. Keep typing.');
    } else {
      chooseTool('select');
      setStatus('Maths template added. Drag it anywhere on the page.');
    }
  }

  function insertMathText(text: string, preferActiveTextBox = true) {
    const insertText = String(text);
    const target = preferActiveTextBox ? getMathTextInsertionTarget() : null;
    if (!target) {
      createMathTextBox(insertText, preferActiveTextBox ? 'edit' : 'select');
      return;
    }

    const start = clamp(target.start, 0, target.box.text.length);
    const end = clamp(target.end, 0, target.box.text.length);
    const nextText = `${target.box.text.slice(0, start)}${insertText}${target.box.text.slice(end)}`;
    const cursorIndex = start + insertText.length;
    updateTextBox(target.boxId, { text: nextText, minHeight: Math.max(target.box.minHeight, estimateMathTextHeight(nextText, target.box.fontSize)) }, true, target.pageKey);
    applySelection([elementKey('text', target.boxId)]);
    if (toolRef.current !== 'text') chooseTool('text');
    focusTextBoxAtSoon(target.boxId, cursorIndex);
    textCursorRef.current = { boxId: target.boxId, pageKey: target.pageKey, start: cursorIndex, end: cursorIndex };
    setStatus('Maths symbol inserted.');
  }

  function toSuperscript(value: string) {
    return value.split('').map((char) => SUPERSCRIPT_DIGITS[char] || char).join('');
  }

  function toSubscript(value: string) {
    return value.split('').map((char) => SUBSCRIPT_DIGITS[char] || char).join('');
  }

  function insertStackedFraction() {
    const numerator = mathBuilderDraft.numerator.trim() || 'a';
    const denominator = mathBuilderDraft.denominator.trim() || 'b';
    const bar = '─'.repeat(clamp(Math.max(numerator.length, denominator.length), 3, 22));
    createMathTextBox(`${numerator}\n${bar}\n${denominator}`, 'select');
  }

  function insertMathBuilder(kind: 'power' | 'subscript' | 'root' | 'absolute' | 'vector') {
    if (kind === 'power') {
      insertMathText(`${mathBuilderDraft.powerBase.trim() || 'x'}${toSuperscript(mathBuilderDraft.exponent.trim() || '2')}`, false);
      return;
    }
    if (kind === 'subscript') {
      insertMathText(`${mathBuilderDraft.subscriptBase.trim() || 'x'}${toSubscript(mathBuilderDraft.subscript.trim() || '1')}`, false);
      return;
    }
    if (kind === 'root') {
      insertMathText(`√(${mathBuilderDraft.root.trim() || 'x'})`, false);
      return;
    }
    if (kind === 'absolute') {
      insertMathText(`|${mathBuilderDraft.absolute.trim() || 'x'}|`, false);
      return;
    }
    const variable = mathBuilderDraft.vector.trim() || 'v';
    insertMathText(mathBuilderDraft.vectorMode === 'bar' ? `${variable}̄` : `→${variable}`, false);
  }

  function updateMathPlaneConfig<K extends keyof MathPlaneConfig>(key: K, value: MathPlaneConfig[K]) {
    setMathPlaneConfig((current) => ({ ...current, [key]: value }));
  }

  function insertConfiguredMathPlane() {
    const data = getActivePageData();
    if (!data) {
      setStatus('Open a notebook before inserting a Cartesian plane.');
      return;
    }

    let xMin = Number.isFinite(mathPlaneConfig.xMin) ? mathPlaneConfig.xMin : -10;
    let xMax = Number.isFinite(mathPlaneConfig.xMax) ? mathPlaneConfig.xMax : 10;
    let yMin = Number.isFinite(mathPlaneConfig.yMin) ? mathPlaneConfig.yMin : -10;
    let yMax = Number.isFinite(mathPlaneConfig.yMax) ? mathPlaneConfig.yMax : 10;
    if (xMin === xMax) xMax = xMin + 1;
    if (yMin === yMax) yMax = yMin + 1;
    if (xMin > xMax) [xMin, xMax] = [xMax, xMin];
    if (yMin > yMax) [yMin, yMax] = [yMax, yMin];

    const size = Math.min(MATH_PLANE_SIZES[mathPlaneConfig.size], Math.max(120, data.view.width - 24), Math.max(120, data.view.totalHeight - 24));
    const insertPoint = getVisiblePageInsertPoint(data.page.key, data.view, size);
    const plane: MathPlaneBox = {
      id: makeId(),
      x: insertPoint.x,
      y: insertPoint.y,
      width: size,
      height: size,
      xMin,
      xMax,
      yMin,
      yMax,
      gridStyle: mathPlaneConfig.gridStyle,
      gridSpacing: clamp(Math.abs(mathPlaneConfig.gridSpacing || 1), 0.1, 100),
      showAxisLabels: mathPlaneConfig.showAxisLabels,
      showTickMarks: mathPlaneConfig.showTickMarks,
      axisColor: mathPlaneConfig.axisColor || activeTheme.text,
      gridColor: mathPlaneConfig.gridColor || mixHex(activeTheme.background, activeTheme.accent, 0.45),
      z: nextZIndex(data.annotations)
    };

    applyDocumentUpdate((doc) => {
      const annotations = getPageAnnotations(doc, data.page.key);
      setPageAnnotations(doc, data.page.key, { ...annotations, mathPlaneBoxes: [...annotations.mathPlaneBoxes, plane] });
      return doc;
    });
    chooseTool('select');
    applySelection([elementKey('mathPlane', plane.id)]);
    setStatus('Cartesian plane inserted. Select it later to change ranges, grid style, colours or size.');
  }

  function updateSelectedTextBox(updates: Partial<TextBox>, saveUndo = true) {
    const textId = selectedTextId || selectedElementKeys.map(parseElementKey).find((item): item is SelectedElement => Boolean(item && item.kind === 'text'))?.id || null;
    if (!textId) return;
    updateTextBox(textId, updates, saveUndo);
  }

  function handleTextColourChange(value: string) {
    setColour(value);
    updateSelectedTextBox({ color: value }, true);
  }

  function handleTextFontFamilyChange(value: string) {
    setFontFamily(value);
    updateSelectedTextBox({ fontFamily: value }, true);
  }

  function handleTextFontSizeChange(value: number) {
    const next = clamp(Number.isFinite(value) ? value : fontSize, 8, 80);
    setFontSize(next);
    updateSelectedTextBox({ fontSize: next }, true);
  }

  function handleTextWeightChange(value: '400' | '600' | '700') {
    setFontWeight(value);
    updateSelectedTextBox({ fontWeight: value }, true);
  }

  function handleSelectedTextWidthChange(value: number) {
    const data = getActivePageData();
    const box = selectedTextBox;
    const maxWidth = data && box ? Math.max(90, data.view.width - box.x) : 900;
    const next = clamp(Number.isFinite(value) ? value : selectedTextBox?.width || DEFAULT_TEXT_WIDTH, 90, maxWidth);
    updateSelectedTextBox({ width: next }, true);
  }

  function handleSelectedTextHeightChange(value: number) {
    const data = getActivePageData();
    const box = selectedTextBox;
    const maxHeight = data && box ? Math.max(38, data.view.totalHeight - box.y) : 1400;
    const next = clamp(Number.isFinite(value) ? value : selectedTextBox?.minHeight || DEFAULT_TEXT_HEIGHT, 38, maxHeight);
    updateSelectedTextBox({ minHeight: next }, true);
  }

  function updateSelectedShape(updates: Partial<ShapeBox>, saveUndo = true) {
    const data = getActivePageData();
    const shapeId = selectedShapeId || selectedElementKeys.map(parseElementKey).find((item): item is SelectedElement => Boolean(item && item.kind === 'shape'))?.id || null;
    if (!data || !shapeId) return;
    applyDocumentUpdate((doc) => {
      const annotations = getPageAnnotations(doc, data.page.key);
      setPageAnnotations(doc, data.page.key, {
        ...annotations,
        shapeBoxes: annotations.shapeBoxes.map((shape) => (shape.id === shapeId ? { ...shape, ...updates } : shape))
      });
      return doc;
    }, saveUndo);
  }

  function handleShapeKindChange(value: ShapeKind) {
    setShapeKind(value);
    updateSelectedShape({ kind: value }, true);
  }

  function handleShapeStrokeColourChange(value: string) {
    setShapeStrokeColour(value);
    updateSelectedShape({ color: value }, true);
  }

  function handleShapeFillColourChange(value: string) {
    setShapeFillColour(value);
    updateSelectedShape({ fillColor: value === 'transparent' ? undefined : value }, true);
  }

  function handleShapeStrokeWidthChange(value: number) {
    const next = clamp(Number.isFinite(value) ? value : strokeWidth, 1, 18);
    setStrokeWidth(next);
    updateSelectedShape({ strokeWidth: next }, true);
  }

  function handleShapeOpacityChange(value: number) {
    const next = clamp(Number.isFinite(value) ? value : opacity, 0.05, 1);
    setOpacity(next);
    updateSelectedShape({ opacity: next }, true);
  }

  function handleSelectedShapeWidthChange(value: number) {
    const data = getActivePageData();
    const shape = selectedShapeBox;
    const bounds = shape ? normaliseRect(shape.x, shape.y, shape.width, shape.height) : null;
    const maxWidth = data && bounds ? Math.max(12, data.view.width - bounds.x) : 1600;
    const next = clamp(Number.isFinite(value) ? value : bounds?.width || 120, 12, maxWidth);
    updateSelectedShape({ x: bounds?.x ?? shape?.x ?? 0, width: next }, true);
  }

  function handleSelectedShapeHeightChange(value: number) {
    const data = getActivePageData();
    const shape = selectedShapeBox;
    const bounds = shape ? normaliseRect(shape.x, shape.y, shape.width, shape.height) : null;
    const maxHeight = data && bounds ? Math.max(12, data.view.totalHeight - bounds.y) : 1600;
    const next = clamp(Number.isFinite(value) ? value : bounds?.height || 120, 12, maxHeight);
    updateSelectedShape({ y: bounds?.y ?? shape?.y ?? 0, height: next }, true);
  }

  function updateSelectedMathPlane(updates: Partial<MathPlaneBox>, saveUndo = true) {
    const data = getActivePageData();
    const planeId = selectedMathPlaneId || selectedElementKeys.map(parseElementKey).find((item): item is SelectedElement => Boolean(item && item.kind === 'mathPlane'))?.id || null;
    if (!data || !planeId) return;
    applyDocumentUpdate((doc) => {
      const annotations = getPageAnnotations(doc, data.page.key);
      setPageAnnotations(doc, data.page.key, {
        ...annotations,
        mathPlaneBoxes: annotations.mathPlaneBoxes.map((plane) => (plane.id === planeId ? { ...plane, ...updates } : plane))
      });
      return doc;
    }, saveUndo);
  }

  function handleSelectedMathPlaneNumberChange(key: 'xMin' | 'xMax' | 'yMin' | 'yMax' | 'gridSpacing' | 'width' | 'height', value: number) {
    const plane = selectedMathPlaneBox;
    if (!plane || !Number.isFinite(value)) return;
    const updates: Partial<MathPlaneBox> = {};
    if (key === 'gridSpacing') {
      updates.gridSpacing = clamp(Math.abs(value || 1), 0.1, 100);
    } else if (key === 'xMin') {
      updates.xMin = value;
      if (value >= plane.xMax) updates.xMax = value + 1;
    } else if (key === 'xMax') {
      updates.xMax = value;
      if (value <= plane.xMin) updates.xMin = value - 1;
    } else if (key === 'yMin') {
      updates.yMin = value;
      if (value >= plane.yMax) updates.yMax = value + 1;
    } else if (key === 'yMax') {
      updates.yMax = value;
      if (value <= plane.yMin) updates.yMin = value - 1;
    } else {
      const data = getActivePageData();
      const max = key === 'width'
        ? Math.max(80, (data?.view.width ?? 1600) - plane.x)
        : Math.max(80, (data?.view.totalHeight ?? 2000) - plane.y);
      updates[key] = clamp(value, 80, max);
    }
    updateSelectedMathPlane(updates, true);
  }

  function handleSelectedMathPlaneGridStyleChange(value: MathPlaneBox['gridStyle']) {
    updateSelectedMathPlane({ gridStyle: value }, true);
  }

  function handleSelectedMathPlaneColourChange(key: 'axisColor' | 'gridColor', value: string) {
    updateSelectedMathPlane({ [key]: safeHexColour(value, key === 'axisColor' ? activeTheme.text : activeTheme.accent) } as Partial<MathPlaneBox>, true);
  }

  function handleSelectedMathPlaneToggle(key: 'showAxisLabels' | 'showTickMarks', value: boolean) {
    updateSelectedMathPlane({ [key]: value } as Partial<MathPlaneBox>, true);
  }

  function updateSelectedImage(updates: Partial<ImageBox>, saveUndo = true) {
    const data = getActivePageData();
    const imageId = selectedImageId || selectedElementKeys.map(parseElementKey).find((item): item is SelectedElement => Boolean(item && item.kind === 'image'))?.id || null;
    if (!data || !imageId) return;
    applyDocumentUpdate((doc) => {
      const annotations = getPageAnnotations(doc, data.page.key);
      setPageAnnotations(doc, data.page.key, {
        ...annotations,
        imageBoxes: annotations.imageBoxes.map((image) => (image.id === imageId ? { ...image, ...updates } : image))
      });
      return doc;
    }, saveUndo);
  }

  function getSelectedLayerKeys() {
    return selectedElementKeys.map(parseElementKey).filter((item): item is SelectedElement => Boolean(item));
  }

  function handleLayerOrder(direction: LayerDirection) {
    const data = getActivePageData();
    const selected = getSelectedLayerKeys();
    if (!data || selected.length === 0) return;
    const selectedSet = new Set(selected.map((item) => elementKey(item.kind, item.id)));
    applyDocumentUpdate((doc) => {
      const annotations = getPageAnnotations(doc, data.page.key);
      const allZ = [
        ...annotations.strokes.map((item) => item.z || 0),
        ...annotations.textBoxes.map((item) => item.z || 0),
        ...annotations.imageBoxes.map((item) => item.z || 0),
        ...annotations.mathPlaneBoxes.map((item) => item.z || 0),
        ...annotations.shapeBoxes.map((item) => item.z || 0)
      ];
      const minZ = Math.min(0, ...allZ);
      const maxZ = Math.max(0, ...allZ);
      const bump = Math.max(1, allZ.length + 1);
      const adjust = (kind: ElementKind, item: { id: string; z?: number }) => {
        if (!selectedSet.has(elementKey(kind, item.id))) return item;
        const current = item.z || 0;
        const z = direction === 'front' ? maxZ + bump : direction === 'back' ? minZ - bump : direction === 'forward' ? current + 2 : current - 2;
        return { ...item, z };
      };
      setPageAnnotations(doc, data.page.key, {
        strokes: annotations.strokes.map((item) => adjust('stroke', item) as Stroke),
        textBoxes: annotations.textBoxes.map((item) => adjust('text', item) as TextBox),
        imageBoxes: annotations.imageBoxes.map((item) => adjust('image', item) as ImageBox),
        mathPlaneBoxes: annotations.mathPlaneBoxes.map((item) => adjust('mathPlane', item) as MathPlaneBox),
        shapeBoxes: annotations.shapeBoxes.map((item) => adjust('shape', item) as ShapeBox)
      });
      return doc;
    });
    setStatus(direction === 'front' ? 'Selection brought to front.' : direction === 'back' ? 'Selection sent to back.' : direction === 'forward' ? 'Selection moved forward.' : 'Selection moved backward.');
  }

  function toggleSelectedImageLock() {
    if (!selectedImageBox) return;
    updateSelectedImage({ locked: !selectedImageBox.locked }, true);
    setStatus(selectedImageBox.locked ? 'Image unlocked.' : 'Image locked. You can draw over it without moving it.');
  }


  async function insertImageFromFile(file: File, point?: Point) {
    const initialData = getActivePageData();
    if (!initialData) return;
    if (!file.type.startsWith('image/')) {
      setStatus('That file is not an image. Use PNG, JPG, WEBP, or GIF.');
      return;
    }

    const targetPageKey = initialData.page.key;
    const targetPoint = point ? { ...point } : null;

    try {
      const converted = await convertImageFileToPngDataUrl(file);
      const latestDoc = activeDocRef.current;
      const page = latestDoc?.pages.find((item) => item.key === targetPageKey) || latestDoc?.pages[pageIndexRef.current];
      if (!latestDoc || !page) return;
      const targetIndex = latestDoc.pages.findIndex((item) => item.key === page.key);
      if (targetIndex >= 0) setActivePageIndex(targetIndex, false);
      const latestView = pageViewsRef.current[page.key] || pageView;
      const latestAnnotations = getPageAnnotations(latestDoc, page.key);
      const maxWidth = Math.max(80, latestView.width - 32);
      const scale = converted.width > maxWidth ? maxWidth / converted.width : 1;
      const width = Math.max(40, converted.width * scale);
      const height = Math.max(40, converted.height * scale);
      const x = targetPoint ? targetPoint.x : (latestView.width - width) / 2;
      const y = targetPoint ? targetPoint.y : (latestView.totalHeight - height) / 2;
      const imageBox: ImageBox = {
        id: makeId(),
        x: clamp(x, 0, Math.max(0, latestView.width - width)),
        y: clamp(y, 0, Math.max(0, latestView.totalHeight - height)),
        width,
        height,
        originalWidth: converted.width,
        originalHeight: converted.height,
        dataUrl: converted.dataUrl,
        name: file.name || 'Pasted image',
        createdAt: new Date().toISOString(),
        z: nextZIndex(latestAnnotations)
      };

      applyDocumentUpdate((doc) => {
        const annotations = getPageAnnotations(doc, page.key);
        setPageAnnotations(doc, page.key, { ...annotations, imageBoxes: [...annotations.imageBoxes, imageBox] });
        return doc;
      });
      chooseTool('select');
      applySelection([elementKey('image', imageBox.id)]);
      setStatus('Image added. Drag, resize, or delete it in Select mode.');
    } catch (error) {
      console.error(error);
      setStatus('Could not add that image.');
    }
  }


  function getPointFromClient(clientX: number, clientY: number): Point | null {
    const doc = activeDocRef.current;
    if (!doc) return null;
    for (const [index, page] of doc.pages.entries()) {
      const element = pageShadowRefs.current[page.key];
      const size = pageViewsRef.current[page.key] || pageView;
      if (!element) continue;
      const rect = element.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        setActivePageIndex(index, false);
        return {
          x: clamp((clientX - rect.left) / zoom, 0, size.width),
          y: clamp((clientY - rect.top) / zoom, 0, size.totalHeight)
        };
      }
    }
    return null;
  }


  function handleImagePickerChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void insertImageFromFile(file);
  }

  function startSelectionDrag(event: ReactPointerEvent<HTMLElement>, kind: ElementKind, id: string, pageKey?: string) {
    if (event.pointerType === 'touch') {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const doc = activeDocRef.current;
    if (!doc) return;
    const resolvedPageKey = pageKey || getActivePageData()?.page.key;
    const resolvedIndex = doc.pages.findIndex((page) => page.key === resolvedPageKey);
    if (!resolvedPageKey || resolvedIndex < 0) return;
    setActivePageIndex(resolvedIndex, false);
    event.preventDefault();
    event.stopPropagation();
    const key = elementKey(kind, id);
    const additive = event.shiftKey;
    const keys = additive
      ? selectedElementKeys.includes(key) ? selectedElementKeys.filter((item) => item !== key) : [...selectedElementKeys, key]
      : selectedElementKeys.includes(key) ? selectedElementKeys : [key];
    applySelection(keys);
    selectionDragRef.current = {
      originalDoc: cloneDocument(doc),
      pageKey: resolvedPageKey,
      selectedKeys: keys.length ? keys : [key],
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
      undoPushed: false
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }


  function handleSelectionDragMove(event: ReactPointerEvent<HTMLElement>) {
    const drag = selectionDragRef.current;
    if (!drag) return;
    event.preventDefault();
    event.stopPropagation();
    const screenDistance = Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY);
    if (!drag.moved && screenDistance < 3) return;
    if (!drag.undoPushed) {
      pushUndo();
      drag.undoPushed = true;
    }
    drag.moved = true;
    const dx = (event.clientX - drag.startClientX) / zoom;
    const dy = (event.clientY - drag.startClientY) / zoom;
    const next = normaliseDocument(cloneDocument(drag.originalDoc), activeThemeId);
    const annotations = getPageAnnotations(next, drag.pageKey);
    const bounds = pageViewsRef.current[drag.pageKey] || pageView;
    setPageAnnotations(next, drag.pageKey, moveElements(annotations, drag.selectedKeys, dx, dy, bounds));
    activeDocRef.current = next;
    setActiveDoc(next);
    setLibrary((current) => ({ documents: current.documents.map((doc) => (doc.id === next.id ? next : doc)) }));
  }


  function handleSelectionDragEnd(event: ReactPointerEvent<HTMLElement>) {
    const drag = selectionDragRef.current;
    if (!drag) return;
    event.preventDefault();
    event.stopPropagation();
    const current = activeDocRef.current;
    selectionDragRef.current = null;
    if (drag.moved && current) {
      scheduleSave(current);
      setStatus('Selection moved.');
    }
  }

  function handleImageDragStart(event: ReactPointerEvent<HTMLDivElement>, box: ImageBox, pageKey?: string) {
    if (event.pointerType === 'touch') {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const doc = activeDocRef.current;
    if (!doc) return;
    const resolvedPageKey = pageKey || getActivePageData()?.page.key;
    const resolvedIndex = doc.pages.findIndex((page) => page.key === resolvedPageKey);
    if (!resolvedPageKey || resolvedIndex < 0) return;
    setActivePageIndex(resolvedIndex, false);
    if (box.locked) {
      event.preventDefault();
      event.stopPropagation();
      applySelection([elementKey('image', box.id)]);
      setStatus('Image is locked. Unlock it from the settings panel to move it.');
      return;
    }
    if (tool === 'select') {
      startSelectionDrag(event, 'image', box.id, resolvedPageKey);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    pushUndo();
    applySelection([elementKey('image', box.id)]);
    imageDragRef.current = {
      originalDoc: cloneDocument(doc),
      imageId: box.id,
      pageKey: resolvedPageKey,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: box.x,
      startY: box.y
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }


  function handleImageDragMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (selectionDragRef.current) {
      handleSelectionDragMove(event);
      return;
    }
    const drag = imageDragRef.current;
    if (!drag) return;
    event.preventDefault();
    event.stopPropagation();
    const dx = (event.clientX - drag.startClientX) / zoom;
    const dy = (event.clientY - drag.startClientY) / zoom;
    const next = normaliseDocument(cloneDocument(drag.originalDoc), activeThemeId);
    const annotations = getPageAnnotations(next, drag.pageKey);
    const bounds = pageViewsRef.current[drag.pageKey] || pageView;
    const imageBoxes = annotations.imageBoxes.map((box) => {
      if (box.id !== drag.imageId) return box;
      return {
        ...box,
        x: clamp(drag.startX + dx, 0, Math.max(0, bounds.width - box.width)),
        y: clamp(drag.startY + dy, 0, Math.max(0, bounds.totalHeight - box.height))
      };
    });
    setPageAnnotations(next, drag.pageKey, { ...annotations, imageBoxes });
    activeDocRef.current = next;
    setActiveDoc(next);
    setLibrary((current) => ({ documents: current.documents.map((doc) => (doc.id === next.id ? next : doc)) }));
  }


  function handleImageDragEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (selectionDragRef.current) {
      handleSelectionDragEnd(event);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const current = activeDocRef.current;
    imageDragRef.current = null;
    if (current) scheduleSave(current);
    setStatus('Image moved.');
  }

  function handleImageResizeStart(event: ReactPointerEvent<HTMLButtonElement>, box: ImageBox, mode: 'corner' | 'edge-right' | 'edge-bottom' | 'edge-left' | 'edge-top', pageKey?: string) {
    if (box.locked) {
      event.preventDefault();
      event.stopPropagation();
      setStatus('Image is locked. Unlock it before resizing.');
      return;
    }
    if (event.pointerType === 'touch') {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const doc = activeDocRef.current;
    if (!doc) return;
    const resolvedPageKey = pageKey || getActivePageData()?.page.key;
    const resolvedIndex = doc.pages.findIndex((page) => page.key === resolvedPageKey);
    if (!resolvedPageKey || resolvedIndex < 0) return;
    setActivePageIndex(resolvedIndex, false);
    event.preventDefault();
    event.stopPropagation();
    pushUndo();
    applySelection([elementKey('image', box.id)]);
    imageResizeRef.current = {
      originalDoc: cloneDocument(doc),
      imageId: box.id,
      pageKey: resolvedPageKey,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: box.x,
      startY: box.y,
      startWidth: box.width,
      startHeight: box.height,
      mode
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }


  function handleImageResizeMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const resize = imageResizeRef.current;
    if (!resize) return;
    event.preventDefault();
    event.stopPropagation();
    const dx = (event.clientX - resize.startClientX) / zoom;
    const dy = (event.clientY - resize.startClientY) / zoom;
    const next = normaliseDocument(cloneDocument(resize.originalDoc), activeThemeId);
    const annotations = getPageAnnotations(next, resize.pageKey);
    const bounds = pageViewsRef.current[resize.pageKey] || pageView;
    const imageBoxes = annotations.imageBoxes.map((box) => {
      if (box.id !== resize.imageId) return box;
      let x = resize.startX;
      let y = resize.startY;
      let width = resize.startWidth;
      let height = resize.startHeight;

      if (resize.mode === 'corner') {
        const ratio = resize.startWidth / Math.max(1, resize.startHeight);
        width = clamp(resize.startWidth + dx, 40, bounds.width - resize.startX);
        height = clamp(width / ratio, 40, bounds.totalHeight - resize.startY);
      } else if (resize.mode === 'edge-right') {
        width = clamp(resize.startWidth + dx, 40, bounds.width - resize.startX);
      } else if (resize.mode === 'edge-bottom') {
        height = clamp(resize.startHeight + dy, 40, bounds.totalHeight - resize.startY);
      } else if (resize.mode === 'edge-left') {
        const nextX = clamp(resize.startX + dx, 0, resize.startX + resize.startWidth - 40);
        width = resize.startWidth + (resize.startX - nextX);
        x = nextX;
      } else if (resize.mode === 'edge-top') {
        const nextY = clamp(resize.startY + dy, 0, resize.startY + resize.startHeight - 40);
        height = resize.startHeight + (resize.startY - nextY);
        y = nextY;
      }

      return { ...box, x, y, width, height };
    });
    setPageAnnotations(next, resize.pageKey, { ...annotations, imageBoxes });
    activeDocRef.current = next;
    setActiveDoc(next);
    setLibrary((current) => ({ documents: current.documents.map((doc) => (doc.id === next.id ? next : doc)) }));
  }


  function handleImageResizeEnd(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const current = activeDocRef.current;
    imageResizeRef.current = null;
    if (current) scheduleSave(current);
    setStatus('Image resized.');
  }

  function handleShapeResizeStart(event: ReactPointerEvent<HTMLButtonElement>, shape: ShapeBox, mode: 'corner' | 'edge-right' | 'edge-bottom' | 'edge-left' | 'edge-top', pageKey?: string) {
    if (event.pointerType === 'touch') {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const doc = activeDocRef.current;
    const resolvedPageKey = pageKey || getActivePageData()?.page.key;
    const resolvedIndex = doc?.pages.findIndex((page) => page.key === resolvedPageKey) ?? -1;
    if (!doc || !resolvedPageKey || resolvedIndex < 0) return;
    const rect = normaliseRect(shape.x, shape.y, shape.width, shape.height);
    setActivePageIndex(resolvedIndex, false);
    event.preventDefault();
    event.stopPropagation();
    pushUndo();
    applySelection([elementKey('shape', shape.id)]);
    shapeResizeRef.current = {
      originalDoc: cloneDocument(doc),
      shapeId: shape.id,
      pageKey: resolvedPageKey,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: rect.x,
      startY: rect.y,
      startWidth: rect.width,
      startHeight: rect.height,
      mode
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleShapeResizeMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const resize = shapeResizeRef.current;
    if (!resize) return;
    event.preventDefault();
    event.stopPropagation();
    const dx = (event.clientX - resize.startClientX) / zoom;
    const dy = (event.clientY - resize.startClientY) / zoom;
    const next = normaliseDocument(cloneDocument(resize.originalDoc), activeThemeId);
    const annotations = getPageAnnotations(next, resize.pageKey);
    const bounds = pageViewsRef.current[resize.pageKey] || pageView;
    const shapeBoxes = annotations.shapeBoxes.map((shape) => {
      if (shape.id !== resize.shapeId) return shape;
      let x = resize.startX;
      let y = resize.startY;
      let width = resize.startWidth;
      let height = resize.startHeight;

      if (resize.mode === 'corner') {
        width = clamp(resize.startWidth + dx, 12, Math.max(12, bounds.width - resize.startX));
        height = clamp(resize.startHeight + dy, 12, Math.max(12, bounds.totalHeight - resize.startY));
      } else if (resize.mode === 'edge-right') {
        width = clamp(resize.startWidth + dx, 12, Math.max(12, bounds.width - resize.startX));
      } else if (resize.mode === 'edge-bottom') {
        height = clamp(resize.startHeight + dy, 12, Math.max(12, bounds.totalHeight - resize.startY));
      } else if (resize.mode === 'edge-left') {
        const nextX = clamp(resize.startX + dx, 0, resize.startX + resize.startWidth - 12);
        width = resize.startWidth + (resize.startX - nextX);
        x = nextX;
      } else if (resize.mode === 'edge-top') {
        const nextY = clamp(resize.startY + dy, 0, resize.startY + resize.startHeight - 12);
        height = resize.startHeight + (resize.startY - nextY);
        y = nextY;
      }

      return { ...shape, x, y, width, height };
    });
    setPageAnnotations(next, resize.pageKey, { ...annotations, shapeBoxes });
    activeDocRef.current = next;
    setActiveDoc(next);
    setLibrary((current) => ({ documents: current.documents.map((doc) => (doc.id === next.id ? next : doc)) }));
  }

  function handleShapeResizeEnd(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const current = activeDocRef.current;
    shapeResizeRef.current = null;
    if (current) scheduleSave(current);
    setStatus('Shape resized.');
  }

  function handleMathPlaneResizeStart(event: ReactPointerEvent<HTMLButtonElement>, plane: MathPlaneBox, mode: 'corner' | 'edge-right' | 'edge-bottom' | 'edge-left' | 'edge-top', pageKey?: string) {
    const doc = activeDocRef.current;
    const resolvedPageKey = pageKey || getActivePageData()?.page.key;
    const resolvedIndex = doc?.pages.findIndex((page) => page.key === resolvedPageKey) ?? -1;
    if (!doc || !resolvedPageKey || resolvedIndex < 0) return;
    setActivePageIndex(resolvedIndex, false);
    event.preventDefault();
    event.stopPropagation();
    pushUndo();
    applySelection([elementKey('mathPlane', plane.id)]);
    mathPlaneResizeRef.current = {
      originalDoc: cloneDocument(doc),
      planeId: plane.id,
      pageKey: resolvedPageKey,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: plane.x,
      startY: plane.y,
      startWidth: plane.width,
      startHeight: plane.height,
      mode
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleMathPlaneResizeMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const resize = mathPlaneResizeRef.current;
    if (!resize) return;
    event.preventDefault();
    event.stopPropagation();
    const dx = (event.clientX - resize.startClientX) / zoom;
    const dy = (event.clientY - resize.startClientY) / zoom;
    const next = normaliseDocument(cloneDocument(resize.originalDoc), activeThemeId);
    const annotations = getPageAnnotations(next, resize.pageKey);
    const bounds = pageViewsRef.current[resize.pageKey] || pageView;
    const mathPlaneBoxes = annotations.mathPlaneBoxes.map((plane) => {
      if (plane.id !== resize.planeId) return plane;
      let x = resize.startX;
      let y = resize.startY;
      let width = resize.startWidth;
      let height = resize.startHeight;

      if (resize.mode === 'corner') {
        const nextSize = clamp(Math.max(resize.startWidth + dx, resize.startHeight + dy), 80, Math.max(80, Math.min(bounds.width - resize.startX, bounds.totalHeight - resize.startY)));
        width = nextSize;
        height = nextSize;
      } else if (resize.mode === 'edge-right') {
        width = clamp(resize.startWidth + dx, 80, Math.max(80, bounds.width - resize.startX));
      } else if (resize.mode === 'edge-bottom') {
        height = clamp(resize.startHeight + dy, 80, Math.max(80, bounds.totalHeight - resize.startY));
      } else if (resize.mode === 'edge-left') {
        const nextX = clamp(resize.startX + dx, 0, resize.startX + resize.startWidth - 80);
        width = resize.startWidth + (resize.startX - nextX);
        x = nextX;
      } else if (resize.mode === 'edge-top') {
        const nextY = clamp(resize.startY + dy, 0, resize.startY + resize.startHeight - 80);
        height = resize.startHeight + (resize.startY - nextY);
        y = nextY;
      }

      return { ...plane, x, y, width, height };
    });
    setPageAnnotations(next, resize.pageKey, { ...annotations, mathPlaneBoxes });
    activeDocRef.current = next;
    setActiveDoc(next);
    setLibrary((current) => ({ documents: current.documents.map((doc) => (doc.id === next.id ? next : doc)) }));
  }

  function handleMathPlaneResizeEnd(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const current = activeDocRef.current;
    mathPlaneResizeRef.current = null;
    if (current) scheduleSave(current);
    setStatus('Cartesian plane resized.');
  }

  function handleDeleteImage(imageId: string, saveUndo = true, pageKey?: string) {
    const key = pageKey || getActivePageData()?.page.key;
    if (!key) return;
    applyDocumentUpdate((doc) => {
      const annotations = getPageAnnotations(doc, key);
      setPageAnnotations(doc, key, {
        ...annotations,
        imageBoxes: annotations.imageBoxes.filter((box) => box.id !== imageId),
        shapeBoxes: annotations.shapeBoxes.filter((shape) => shape.id !== `${imageId}-mask`)
      });
      return doc;
    }, saveUndo);
    clearSelection();
    setStatus('Image removed.');
  }


  function handleDeleteSelectedImage() {
    if (!selectedImageId) return;
    handleDeleteImage(selectedImageId);
  }


  function createPdfContentRegionFromLasso(page: NotebookPage, polygon: Point[]): string[] {
    if (page.kind !== 'pdf') return [];
    const bounds = polygonBounds(polygon);
    const base = baseCanvasRefs.current[page.key];
    const view = pageViewsRef.current[page.key] || pageView;
    if (!bounds || !base) return [];
    const clipped = {
      x: clamp(Math.floor(bounds.x), 0, Math.max(0, view.width - 1)),
      y: clamp(Math.floor(bounds.y), 0, Math.max(0, view.totalHeight - 1)),
      width: clamp(Math.ceil(bounds.width), 1, view.width),
      height: clamp(Math.ceil(bounds.height), 1, view.totalHeight)
    };
    clipped.width = Math.min(clipped.width, Math.max(1, view.width - clipped.x));
    clipped.height = Math.min(clipped.height, Math.max(1, view.totalHeight - clipped.y));
    if (clipped.width < 12 || clipped.height < 12) return [];

    const ratio = base.width / Math.max(1, view.width * zoom);
    const sourceX = Math.round(clipped.x * zoom * ratio);
    const sourceY = Math.round(clipped.y * zoom * ratio);
    const sourceW = Math.max(1, Math.round(clipped.width * zoom * ratio));
    const sourceH = Math.max(1, Math.round(clipped.height * zoom * ratio));
    const crop = document.createElement('canvas');
    crop.width = sourceW;
    crop.height = sourceH;
    const cropContext = crop.getContext('2d');
    if (!cropContext) return [];
    cropContext.drawImage(base, sourceX, sourceY, sourceW, sourceH, 0, 0, sourceW, sourceH);
    const id = makeId();
    const maskId = `${id}-mask`;
    const zBase = nextZIndex(getPageAnnotations(activeDocRef.current!, page.key));
    const imageBox: ImageBox = {
      id,
      x: clipped.x,
      y: clipped.y,
      width: clipped.width,
      height: clipped.height,
      originalWidth: sourceW,
      originalHeight: sourceH,
      dataUrl: crop.toDataURL('image/png'),
      name: 'Moved PDF content region',
      createdAt: new Date().toISOString(),
      z: zBase + 1
    };
    const maskShape: ShapeBox = {
      id: maskId,
      kind: 'rectangle',
      x: clipped.x,
      y: clipped.y,
      width: clipped.width,
      height: clipped.height,
      color: 'rgba(255,255,255,0)',
      strokeWidth: 0,
      opacity: 1,
      fillColor: '#FFFFFF',
      z: zBase
    };
    applyDocumentUpdate((doc) => {
      const annotations = getPageAnnotations(doc, page.key);
      setPageAnnotations(doc, page.key, {
        ...annotations,
        shapeBoxes: [...annotations.shapeBoxes, maskShape],
        imageBoxes: [...annotations.imageBoxes, imageBox]
      });
      return doc;
    });
    return [elementKey('image', id)];
  }


  function hasActiveInkGesture() {
    return activeInkPointerIdRef.current !== null
      || Boolean(currentStrokeRef.current)
      || Boolean(currentShapeRef.current)
      || lassoPointsRef.current.length > 0
      || eraseSessionRef.current;
  }

  function getTouchCentroid() {
    const touches = Array.from(touchPointersRef.current.values());
    if (touches.length === 0) return null;
    const total = touches.reduce((sum, point) => ({ clientX: sum.clientX + point.clientX, clientY: sum.clientY + point.clientY }), { clientX: 0, clientY: 0 });
    return { clientX: total.clientX / touches.length, clientY: total.clientY / touches.length };
  }

  function startTwoFingerPan() {
    const stage = canvasStageRef.current;
    const center = getTouchCentroid();
    if (!stage || !center) return;
    touchPanRef.current = {
      centerX: center.clientX,
      centerY: center.clientY,
      scrollLeft: stage.scrollLeft,
      scrollTop: stage.scrollTop
    };
  }

  function getStageTouchPoints(touches: ReactTouchEvent<HTMLElement>['touches']) {
    return Array.from({ length: touches.length }, (_, index) => touches.item(index)).filter((touch): touch is Touch => Boolean(touch));
  }

  function getStageTouchCentroid(touches: ReactTouchEvent<HTMLElement>['touches']) {
    const points = getStageTouchPoints(touches);
    if (!points.length) return null;
    const total = points.reduce((sum, touch) => ({ clientX: sum.clientX + touch.clientX, clientY: sum.clientY + touch.clientY }), { clientX: 0, clientY: 0 });
    return { clientX: total.clientX / points.length, clientY: total.clientY / points.length };
  }

  function getStageTouchDistance(touches: ReactTouchEvent<HTMLElement>['touches']) {
    const points = getStageTouchPoints(touches);
    if (points.length < 2) return 0;
    return Math.hypot(points[0].clientX - points[1].clientX, points[0].clientY - points[1].clientY);
  }

  function shouldGuardCanvasTouch(target: EventTarget | null) {
    const element = target instanceof Element ? target : null;
    const stage = canvasStageRef.current;
    if (!element || !stage || !stage.contains(element)) return false;
    if (element.closest('button, input, textarea, select, a, [contenteditable="true"], .welcome-card, .quick-note-editor-card')) return false;
    return Boolean(element.closest('.page-shadow, .continuous-pages, .continuous-page-shell, .base-canvas, .ink-canvas, .image-layer, .text-layer, .canvas-stage'));
  }

  function endStageTouchPan() {
    const pan = stageTouchPanRef.current;
    if (pan?.raf) window.cancelAnimationFrame(pan.raf);
    stageTouchPanRef.current = null;
    canvasStageRef.current?.classList.remove('touch-panning', 'touch-pinching');
  }

  function startStageTouchPan(touches: ReactTouchEvent<HTMLElement>['touches']) {
    const stage = canvasStageRef.current;
    const center = getStageTouchCentroid(touches);
    if (!stage || !center) return;
    if (stageTouchPanRef.current?.raf) window.cancelAnimationFrame(stageTouchPanRef.current.raf);
    const distance = getStageTouchDistance(touches);
    stage.classList.add('touch-panning');
    stage.classList.remove('touch-pinching');
    stageTouchPanRef.current = {
      centerX: center.clientX,
      centerY: center.clientY,
      scrollLeft: stage.scrollLeft,
      scrollTop: stage.scrollTop,
      nextLeft: stage.scrollLeft,
      nextTop: stage.scrollTop,
      startDistance: distance,
      startZoom: zoom,
      mode: 'pan',
      raf: null
    };
  }

  function scheduleStageTouchScroll(left: number, top: number) {
    const pan = stageTouchPanRef.current;
    const stage = canvasStageRef.current;
    if (!pan || !stage) return;
    pan.nextLeft = Math.max(0, left);
    pan.nextTop = Math.max(0, top);
    if (pan.raf) return;
    pan.raf = window.requestAnimationFrame(() => {
      const nextPan = stageTouchPanRef.current;
      const nextStage = canvasStageRef.current;
      if (!nextPan || !nextStage) return;
      nextStage.scrollLeft = nextPan.nextLeft;
      nextStage.scrollTop = nextPan.nextTop;
      nextPan.raf = null;
    });
  }

  function scheduleStagePinchZoom(center: { clientX: number; clientY: number }, distance: number) {
    const pan = stageTouchPanRef.current;
    const stage = canvasStageRef.current;
    if (!pan || !stage || pan.startDistance <= 0) return;
    const rect = stage.getBoundingClientRect();
    const nextZoom = clamp(pan.startZoom * (distance / pan.startDistance), MIN_PAGE_ZOOM, MAX_PAGE_ZOOM);
    const centerXInStage = center.clientX - rect.left;
    const centerYInStage = center.clientY - rect.top;
    const contentX = (pan.scrollLeft + centerXInStage) / pan.startZoom;
    const contentY = (pan.scrollTop + centerYInStage) / pan.startZoom;
    pan.mode = 'pinch';
    stage.classList.add('touch-pinching');
    setZoom(nextZoom);
    scheduleStageTouchScroll(contentX * nextZoom - centerXInStage, contentY * nextZoom - centerYInStage);
  }

  function zoomStageAtClientPoint(clientX: number, clientY: number, deltaY: number) {
    const stage = canvasStageRef.current;
    if (!stage || hasActiveInkGesture()) return;
    const rect = stage.getBoundingClientRect();
    const centerXInStage = clientX - rect.left;
    const centerYInStage = clientY - rect.top;
    const currentZoom = zoom;
    const nextZoom = clamp(currentZoom * Math.exp(-deltaY * 0.0028), MIN_PAGE_ZOOM, MAX_PAGE_ZOOM);
    if (Math.abs(nextZoom - currentZoom) < 0.001) return;
    const contentX = (stage.scrollLeft + centerXInStage) / currentZoom;
    const contentY = (stage.scrollTop + centerYInStage) / currentZoom;
    setZoom(nextZoom);
    window.requestAnimationFrame(() => {
      if (!canvasStageRef.current) return;
      canvasStageRef.current.scrollLeft = Math.max(0, contentX * nextZoom - centerXInStage);
      canvasStageRef.current.scrollTop = Math.max(0, contentY * nextZoom - centerYInStage);
    });
  }

  function handleCanvasStageWheel(event: ReactWheelEvent<HTMLElement>) {
    if (!event.ctrlKey && !event.metaKey) return;
    if (!canvasStageRef.current || hasActiveInkGesture()) return;
    event.preventDefault();
    event.stopPropagation();
    zoomStageAtClientPoint(event.clientX, event.clientY, event.deltaY);
  }

  useEffect(() => {
    const stage = canvasStageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      event.stopPropagation();
      zoomStageAtClientPoint(event.clientX, event.clientY, event.deltaY);
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [zoom, activeDoc, pageIndex, tool]);

  function handleCanvasStageTouchStart(event: ReactTouchEvent<HTMLElement>) {
    if (event.touches.length >= 2 && !hasActiveInkGesture()) {
      event.preventDefault();
      event.stopPropagation();
      startStageTouchPan(event.touches);
      return;
    }

    if (shouldGuardCanvasTouch(event.target)) {
      event.preventDefault();
    }
  }

  function handleCanvasStageTouchMove(event: ReactTouchEvent<HTMLElement>) {
    if (event.touches.length >= 2 && !hasActiveInkGesture()) {
      event.preventDefault();
      event.stopPropagation();
      if (!stageTouchPanRef.current) startStageTouchPan(event.touches);
      const pan = stageTouchPanRef.current;
      const center = getStageTouchCentroid(event.touches);
      const distance = getStageTouchDistance(event.touches);
      if (pan && center) {
        const distanceDelta = pan.startDistance ? Math.abs(distance - pan.startDistance) : 0;
        const distanceRatio = pan.startDistance ? distanceDelta / pan.startDistance : 0;
        const centroidTravel = Math.hypot(center.clientX - pan.centerX, center.clientY - pan.centerY);
        const shouldPinch = pan.mode === 'pinch' || (distanceDelta > 74 && distanceRatio > 0.18 && (centroidTravel < 14 || distanceDelta > 110));
        if (shouldPinch) {
          scheduleStagePinchZoom(center, distance);
        } else {
          scheduleStageTouchScroll(pan.scrollLeft + (pan.centerX - center.clientX), pan.scrollTop + (pan.centerY - center.clientY));
        }
      }
      return;
    }

    if (shouldGuardCanvasTouch(event.target)) {
      event.preventDefault();
    }
  }

  function handleCanvasStageTouchEnd(event: ReactTouchEvent<HTMLElement>) {
    if (event.touches.length >= 2 && !hasActiveInkGesture()) {
      startStageTouchPan(event.touches);
      return;
    }
    endStageTouchPan();
    touchPointersRef.current.clear();
    touchPanRef.current = null;
  }

  function handleCanvasTouchPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    // Fingers and palms must never create ink or capture the canvas on iPad.
    // Native touch events above handle two-finger panning more reliably in Safari.
    touchPointersRef.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    event.preventDefault();
    event.stopPropagation();
  }

  function handleCanvasTouchPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (touchPointersRef.current.has(event.pointerId)) touchPointersRef.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    event.preventDefault();
    event.stopPropagation();
  }

  function handleCanvasTouchPointerEnd(event: ReactPointerEvent<HTMLCanvasElement>) {
    touchPointersRef.current.delete(event.pointerId);
    if (touchPointersRef.current.size === 0) touchPanRef.current = null;
    event.preventDefault();
    event.stopPropagation();
  }

  function isStylusLikeTouchPointer(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (event.pointerType !== 'touch') return false;
    if (toolRef.current === 'hand' || toolRef.current === 'space' || toolRef.current === 'text') return false;
    const contactSize = Math.max(event.width || 0, event.height || 0);
    const narrowContact = contactSize === 0 || contactSize <= 28;
    const likelyPencil = event.pressure > 0.01 || contactSize <= 8;
    return likelyPencil && narrowContact && touchPointersRef.current.size <= 1;
  }

  function capturePointerSafely(target: Element, pointerId: number) {
    try {
      target.setPointerCapture?.(pointerId);
    } catch {
      // Safari can refuse capture during fast Pencil handoff; drawing still works without it.
    }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>, indexOverride?: number) {
    if (event.pointerType === 'touch' && !isStylusLikeTouchPointer(event)) {
      handleCanvasTouchPointerDown(event);
      return;
    }

    const doc = activeDocRef.current;
    const index = typeof indexOverride === 'number' ? indexOverride : pageIndexRef.current;
    const page = doc?.pages[index];
    if (!doc || !page || tool === 'hand') return;
    event.preventDefault();
    event.stopPropagation();
    const canvas = inkCanvasRefs.current[page.key] || event.currentTarget;
    if (!canvas) return;
    setActivePageIndex(index, false);
    currentDraftPageKeyRef.current = page.key;
    const annotations = getPageAnnotations(doc, page.key);
    const point = getCanvasPoint(event, canvas, zoom);

    if (tool === 'select') {
      const hit = hitTestElement(point, annotations);
      if (hit) startSelectionDrag(event, hit.kind, hit.id, page.key);
      else clearSelection();
      return;
    }

    if (tool === 'lasso') {
      clearSelection();
      activeInkPointerIdRef.current = event.pointerId;
      lassoPointsRef.current = [point];
      capturePointerSafely(event.currentTarget, event.pointerId);
      void redrawPageOverlay(page.key, annotations, null, null, lassoPointsRef.current);
      return;
    }

    clearSelection();

    if (tool === 'eraser') {
      activeInkPointerIdRef.current = event.pointerId;
      setIsInking(true);
      eraserPathRef.current = [point];
      capturePointerSafely(event.currentTarget, event.pointerId);
      if (!eraseSessionRef.current) {
        pushUndo();
        eraseSessionRef.current = true;
      }
      eraseAlongPath([point]);
      return;
    }

    if (tool === 'space') {
      insertSpaceAt(point);
      return;
    }

    if (tool === 'text') {
      handleCreateTextBox(point);
      return;
    }

    if (tool === 'shape') {
      activeInkPointerIdRef.current = event.pointerId;
      setIsInking(true);
      const shape: ShapeBox = {
        id: makeId(),
        kind: shapeKind,
        x: point.x,
        y: point.y,
        width: 1,
        height: 1,
        color: shapeStrokeColour,
        strokeWidth: Math.max(1, strokeWidth),
        opacity,
        fillColor: shapeFillColour === 'transparent' ? undefined : shapeFillColour,
        z: nextZIndex(annotations)
      };
      currentShapeRef.current = shape;
      capturePointerSafely(event.currentTarget, event.pointerId);
      void redrawPageOverlay(page.key, annotations, null, shape);
      return;
    }

    activeInkPointerIdRef.current = event.pointerId;
    setIsInking(true);
    capturePointerSafely(event.currentTarget, event.pointerId);
    const stroke: Stroke = {
      id: makeId(),
      tool: tool === 'highlighter' ? 'highlighter' : 'pen',
      color: tool === 'highlighter' ? highlighterColour : colour,
      width: tool === 'highlighter' ? Math.max(16, strokeWidth * 4) : strokeWidth,
      opacity: tool === 'highlighter' ? HIGHLIGHTER_OPACITY : opacity,
      points: [point],
      z: nextZIndex(annotations)
    };
    currentStrokeRef.current = stroke;
    liveStrokeDrawnPointCountRef.current = 1;
    liveStrokePageKeyRef.current = page.key;
    overlayRenderTokenRef.current += 1;
  }


  function getCoalescedCanvasPoints(event: ReactPointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement): Point[] {
    const nativeEvent = event.nativeEvent as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] };
    const events = typeof nativeEvent.getCoalescedEvents === 'function' ? nativeEvent.getCoalescedEvents() : [nativeEvent];
    return events.map((item) => getCanvasPointFromClient(item.clientX, item.clientY, canvas, zoom, item.pressure || event.pressure || 0.5));
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>, indexOverride?: number) {
    if (event.pointerType === 'touch' && activeInkPointerIdRef.current !== event.pointerId && !isStylusLikeTouchPointer(event)) {
      handleCanvasTouchPointerMove(event);
      return;
    }
    if (activeInkPointerIdRef.current !== null && event.pointerId !== activeInkPointerIdRef.current) return;
    if (activeInkPointerIdRef.current !== null || currentStrokeRef.current || currentShapeRef.current || lassoPointsRef.current.length) {
      event.preventDefault();
      event.stopPropagation();
    }

    const doc = activeDocRef.current;
    const index = typeof indexOverride === 'number' ? indexOverride : pageIndexRef.current;
    const page = doc?.pages[index];
    const pageKey = currentDraftPageKeyRef.current || page?.key;
    const activePage = pageKey && doc ? doc.pages.find((item) => item.key === pageKey) : page;
    if (!doc || !activePage) return;
    const canvas = inkCanvasRefs.current[activePage.key] || event.currentTarget;
    const annotations = getPageAnnotations(doc, activePage.key);
    const points = getCoalescedCanvasPoints(event, canvas);
    const point = points[points.length - 1] || getCanvasPoint(event, canvas, zoom);

    const isActiveDrawingPointer = activeInkPointerIdRef.current === event.pointerId;

    if (tool === 'eraser' && (event.buttons === 1 || isActiveDrawingPointer)) {
      const previousPoint = eraserPathRef.current[eraserPathRef.current.length - 1];
      const path = previousPoint ? [previousPoint, ...points] : points;
      eraserPathRef.current = [...eraserPathRef.current, ...points].slice(-80);
      eraseAlongPath(path);
      return;
    }

    if (tool === 'lasso' && lassoPointsRef.current.length) {
      for (const nextPoint of points) {
        if (shouldKeepStrokePoint(lassoPointsRef.current, nextPoint, 1.5)) lassoPointsRef.current.push(nextPoint);
      }
      scheduleDraftOverlayRedraw(activePage.key, annotations, null, null, lassoPointsRef.current);
      return;
    }

    if (currentShapeRef.current && (event.buttons === 1 || isActiveDrawingPointer)) {
      currentShapeRef.current = {
        ...currentShapeRef.current,
        width: point.x - currentShapeRef.current.x,
        height: point.y - currentShapeRef.current.y
      };
      scheduleDraftOverlayRedraw(activePage.key, annotations, null, currentShapeRef.current);
      return;
    }

    if (!currentStrokeRef.current) return;
    const livePoints: Point[] = [];
    const keepDistance = currentStrokeRef.current.tool === 'highlighter' ? 0.32 : 0.24;
    for (const nextPoint of points) {
      if (shouldKeepStrokePoint(currentStrokeRef.current.points, nextPoint, keepDistance)) {
        currentStrokeRef.current.points.push(nextPoint);
        livePoints.push(nextPoint);
      }
    }
    if (livePoints.length) flushLiveStrokeDraw(activePage.key);
  }


  function handlePointerUp(event?: ReactPointerEvent<HTMLCanvasElement>) {
    if (event?.pointerType === 'touch' && activeInkPointerIdRef.current !== event.pointerId) {
      handleCanvasTouchPointerEnd(event);
      return;
    }
    if (event && activeInkPointerIdRef.current !== null && event.pointerId !== activeInkPointerIdRef.current) return;
    event?.preventDefault();
    event?.stopPropagation();
    const wasEraserSession = eraseSessionRef.current;
    activeInkPointerIdRef.current = null;
    setIsInking(false);
    touchPanRef.current = null;
    eraseSessionRef.current = false;
    eraserPathRef.current = [];
    const doc = activeDocRef.current;
    const pageKey = currentDraftPageKeyRef.current || getActivePageData()?.page.key;
    const page = pageKey && doc ? doc.pages.find((item) => item.key === pageKey) : null;
    const annotations = doc && page ? getPageAnnotations(doc, page.key) : currentAnnotations;

    if (wasEraserSession) {
      currentDraftPageKeyRef.current = null;
      const latest = activeDocRef.current;
      flushEraserStateCommit();
      if (page && latest) flushEraserOverlayRedraw(page.key);
      if (latest) {
        commitEraserState(latest);
        scheduleSave(latest);
      }
      setStatus(eraserMode === 'pixel' ? 'Pixel erased.' : 'Object erased.');
      return;
    }

    if (lassoPointsRef.current.length && page) {
      if (event) {
        const canvas = inkCanvasRefs.current[page.key] || event.currentTarget;
        const finalPoint = getCanvasPoint(event, canvas, zoom);
        if (shouldKeepStrokePoint(lassoPointsRef.current, finalPoint, 1.5)) lassoPointsRef.current.push(finalPoint);
      }
      let selected = selectElementsInsideLasso(annotations, lassoPointsRef.current, lassoFilter);
      if (selected.length === 0 && page.kind === 'pdf') {
        selected = createPdfContentRegionFromLasso(page, lassoPointsRef.current);
      }
      applySelection(selected);
      lassoPointsRef.current = [];
      currentDraftPageKeyRef.current = null;
      void redrawPageOverlay(page.key, getPageAnnotations(activeDocRef.current || doc!, page.key));
      setStatus(selected.length ? `${selected.length} item${selected.length === 1 ? '' : 's'} selected. Drag the box to move it, or use Delete/Duplicate above it.` : 'Nothing inside the lasso.');
      return;
    }

    if (currentShapeRef.current && page) {
      const finishedShape = currentShapeRef.current;
      currentShapeRef.current = null;
      currentDraftPageKeyRef.current = null;
      if (Math.abs(finishedShape.width) < 6 && Math.abs(finishedShape.height) < 6) {
        void redrawPageOverlay(page.key, annotations);
        return;
      }
      applyDocumentUpdate((draft) => {
        const nextAnnotations = getPageAnnotations(draft, page.key);
        setPageAnnotations(draft, page.key, { ...nextAnnotations, shapeBoxes: [...nextAnnotations.shapeBoxes, finishedShape] });
        return draft;
      });
      applySelection([elementKey('shape', finishedShape.id)]);
      setStatus('Shape added. Select it later to change type, colour, opacity, size or layer order.');
      return;
    }

    if (!currentStrokeRef.current || !page) return;
    flushLiveStrokeDraw(page.key);
    const finishedStroke = currentStrokeRef.current;
    currentStrokeRef.current = null;
    liveStrokePageKeyRef.current = null;
    liveStrokeDrawnPointCountRef.current = 0;
    currentDraftPageKeyRef.current = null;

    if (finishedStroke.points.length < 2) {
      void redrawPageOverlay(page.key, annotations);
      return;
    }
    const savedStroke = { ...finishedStroke, points: smoothStrokePoints(finishedStroke.points, finishedStroke.tool) };
    const scratchEraseTargets = getScribbleEraseTargetIds(savedStroke, annotations.strokes);
    if (scratchEraseTargets.length) {
      const targetSet = new Set(scratchEraseTargets);
      applyDocumentUpdate((draft) => {
        const nextAnnotations = getPageAnnotations(draft, page.key);
        setPageAnnotations(draft, page.key, {
          ...nextAnnotations,
          strokes: nextAnnotations.strokes.filter((stroke) => !targetSet.has(stroke.id))
        });
        return draft;
      });
      setStatus(`Scribble erased ${scratchEraseTargets.length} stroke${scratchEraseTargets.length === 1 ? '' : 's'}.`);
      return;
    }

    applyDocumentUpdate((draft) => {
      const nextAnnotations = getPageAnnotations(draft, page.key);
      setPageAnnotations(draft, page.key, { ...nextAnnotations, strokes: [...nextAnnotations.strokes, savedStroke] });
      return draft;
    });
  }


  async function saveLibraryDocument(doc: DocumentRecord) {
    const saved = normaliseDocument(await window.localNotes.saveDocument(doc), activeThemeId);
    setLibrary((previous) => ({
      documents: [saved, ...previous.documents.filter((item) => item.id !== saved.id)]
    }));
    return saved;
  }

  async function handleQuickNoteEditorChange(text: string) {
    if (!activeDoc || !isQuickNoteDoc(activeDoc)) return;
    const next = normaliseDocument(updateQuickNoteTextInDocument(activeDoc, text), activeThemeId);
    activeDocRef.current = next;
    setActiveDoc(next);
    setLibrary((previous) => ({ documents: previous.documents.map((item) => item.id === next.id ? next : item) }));
    await window.localNotes.saveDocument(next);
    setStatus('Scratch note saved locally.');
  }

  async function handleDeleteDocument(doc: DocumentRecord) {
    const confirmed = window.confirm(`Move "${doc.name}" to Trash? You can restore it later.`);
    if (!confirmed) return;

    const trashed = normaliseDocument({ ...doc, deletedAt: new Date().toISOString() }, activeThemeId);
    await saveLibraryDocument(trashed);
    if (activeDoc?.id === doc.id) {
      activeDocRef.current = null;
      setActiveDoc(null);
      pdfRef.current = null;
      setPageIndex(0);
      setStatus('Document moved to Trash.');
    } else {
      setStatus('Document moved to Trash.');
    }
  }

  async function handleRestoreDocument(doc: DocumentRecord) {
    const restored = normaliseDocument({ ...doc, deletedAt: null }, activeThemeId);
    await saveLibraryDocument(restored);
    setSidebarMode(isQuickNoteDoc(restored) ? 'notes' : 'library');
    setStatus('Document restored.');
  }

  async function handlePermanentDeleteDocument(doc: DocumentRecord) {
    const confirmed = window.confirm(`Permanently delete "${doc.name}"? This cannot be undone.`);
    if (!confirmed) return;
    await window.localNotes.deleteDocument(doc.id);
    setLibrary((previous) => ({ documents: previous.documents.filter((item) => item.id !== doc.id) }));
    setStatus('Document permanently deleted.');
  }

  async function handleEmptyTrash() {
    if (trashedDocuments.length === 0) return;
    const trashCount = trashedDocuments.length;
    const confirmed = window.confirm(`Permanently delete all ${trashCount} item${trashCount === 1 ? '' : 's'} in Trash? This cannot be undone.`);
    if (!confirmed) return;

    const deletedIds = new Set(trashedDocuments.map((doc) => doc.id));
    await Promise.all(trashedDocuments.map((doc) => window.localNotes.deleteDocument(doc.id)));
    setLibrary((previous) => ({ documents: previous.documents.filter((item) => !deletedIds.has(item.id)) }));
    if (activeDoc?.id && deletedIds.has(activeDoc.id)) {
      activeDocRef.current = null;
      setActiveDoc(null);
      pdfRef.current = null;
      setPageIndex(0);
    }
    setStatus(`Trash emptied. Deleted ${trashCount} item${trashCount === 1 ? '' : 's'}.`);
  }

  function handleAssignFolder(folder: string) {
    if (!activeDoc) return;
    const clean = folder === 'Unfiled' ? '' : folder.trim();
    if (clean) setCustomFolders((current) => saveCustomFolders([...current, clean]));
    applyDocumentUpdate((doc) => {
      doc.folder = clean;
      return doc;
    }, false);
    setStatus(clean ? `Moved to ${clean}.` : 'Removed from folder.');
  }

  function handleCreateFolder() {
    setSidebarMode('library');
    setIsCreatingFolder(true);
    setFolderDraft('');
  }

  async function commitFolderCreate() {
    if (folderCommitInProgressRef.current) return;
    folderCommitInProgressRef.current = true;
    const clean = folderDraft.trim();
    if (!clean) {
      setIsCreatingFolder(false);
      setFolderDraft('');
      folderCommitInProgressRef.current = false;
      return;
    }

    let createdPath = '';
    try {
      if (window.localNotes.createMappedFolder) {
        const created = await window.localNotes.createMappedFolder(clean);
        if (created?.path) createdPath = created.path;
      } else if (window.showDirectoryPicker) {
        const parentHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        const folderHandle = await parentHandle.getDirectoryHandle(clean, { create: true });
        await saveBrowserDirectoryHandle(clean, folderHandle);
        createdPath = 'Browser folder access granted';
      } else {
        window.alert('Real folder mapping requires Chrome, Edge, or the Dux Notes desktop app. Creating an in-app folder only.');
      }
    } catch (error) {
      console.warn('Folder mapping cancelled or failed:', error);
      setStatus('Folder picker cancelled. Created an in-app folder only.');
    }

    const next = saveCustomFolders([...customFolders, clean]);
    setCustomFolders(next);
    if (createdPath) {
      setFolderPaths((current) => saveFolderPaths({ ...current, [clean]: createdPath }));
    }
    setActiveFolderFilter(clean);
    setIsCreatingFolder(false);
    setFolderDraft('');
    folderCommitInProgressRef.current = false;
    setStatus(createdPath ? `Folder created on your computer: ${clean}.` : `Folder created in app: ${clean}.`);
  }

  function cancelFolderCreate() {
    folderCommitInProgressRef.current = false;
    setIsCreatingFolder(false);
    setFolderDraft('');
  }

  async function handleDeleteFolder(folder: string) {
    if (folder === 'All' || folder === 'Unfiled') return;
    const confirmed = window.confirm(`Delete folder '${folder}'? Documents inside will be moved to Unfiled. This will not delete any files from your computer.`);
    if (!confirmed) return;

    const nextFolders = saveCustomFolders(customFolders.filter((item) => item !== folder));
    setCustomFolders(nextFolders);
    const nextPaths = { ...folderPaths };
    delete nextPaths[folder];
    setFolderPaths(saveFolderPaths(nextPaths));
    await deleteBrowserDirectoryHandle(folder);

    const updates: DocumentRecord[] = [];
    setLibrary((current) => {
      const documents = current.documents.map((doc) => {
        if ((doc.folder || '').trim() !== folder) return doc;
        const nextDoc = normaliseDocument({ ...doc, folder: '' }, activeThemeId);
        updates.push(nextDoc);
        return nextDoc;
      });
      return { documents };
    });
    for (const doc of updates) await window.localNotes.saveDocument(doc);
    if (activeDocRef.current?.folder === folder) {
      const nextActive = normaliseDocument({ ...activeDocRef.current, folder: '' }, activeThemeId);
      activeDocRef.current = nextActive;
      setActiveDoc(nextActive);
      await window.localNotes.saveDocument(nextActive);
    }
    if (activeFolderFilter === folder) setActiveFolderFilter('All');
    setStatus(`Folder '${folder}' deleted. Documents moved to Unfiled.`);
  }

  function handleEditTags() {
    if (!activeDoc) return;
    const current = (activeDoc.tags || []).join(', ');
    const raw = window.prompt('Tags, separated by commas:', current);
    if (raw === null) return;
    const tags = cleanTags(raw);
    applyDocumentUpdate((doc) => {
      doc.tags = tags;
      return doc;
    }, false);
    setStatus(tags.length ? 'Tags updated.' : 'Tags cleared.');
  }

  function toggleUiMode() {
    setUiMode((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      window.localStorage.setItem(UI_MODE_STORAGE_KEY, next);
      return next;
    });
  }

  async function buildEditableSidecar() {
    if (!activeDoc) return null;
    const cleanDoc = cloneDocument(activeDoc);
    cleanDoc.thumbnailDataUrl = null;
    let originalPdfBase64: string | null = null;
    if (cleanDoc.pdfFileName) {
      try {
        const originalBytes = await window.localNotes.readPdf(cleanDoc.id);
        originalPdfBase64 = uint8ArrayToBase64(new Uint8Array(originalBytes));
      } catch (error) {
        console.warn('Could not include original PDF in editable sidecar:', error);
      }
    }
    return {
      app: 'Dux Notes',
      version: 2,
      exportedAt: new Date().toISOString(),
      note: 'Keep this .localnotes.json file next to the exported PDF if you want to re-import editable strokes, text, images, shapes, spacers, tags, and themes.',
      document: cleanDoc,
      originalPdfBase64
    };
  }

  async function buildCurrentPdfExport(docAtExportStart: DocumentRecord) {
    const exportDoc = await PDFDocument.create();
    const exportFont = await exportDoc.embedFont(StandardFonts.Helvetica);
    const pdfSource = pdfRef.current;
    const exportTheme = getDocumentTheme(docAtExportStart, customThemes);

    for (const page of docAtExportStart.pages) {
      const annotations = getPageAnnotations(docAtExportStart, page.key);
      const { canvas, size } = await renderBackgroundWithoutImages(page, pdfSource, exportTheme, 2);
      const backgroundBytes = dataUrlToUint8Array(canvas.toDataURL('image/png'));
      const background = await exportDoc.embedPng(backgroundBytes);
      const pdfPage = exportDoc.addPage([size.width, size.totalHeight]);
      pdfPage.drawImage(background, { x: 0, y: 0, width: size.width, height: size.totalHeight });

      for (const entry of orderedElements(annotations, true)) {
        if (entry.type === 'image') {
          try {
            const image = await exportDoc.embedPng(dataUrlToUint8Array(entry.item.dataUrl));
            pdfPage.drawImage(image, {
              x: entry.item.x,
              y: size.totalHeight - entry.item.y - entry.item.height,
              width: entry.item.width,
              height: entry.item.height
            });
          } catch (error) {
            console.warn('Could not embed image in PDF:', error);
          }
        } else if (entry.type === 'mathPlane') {
          drawMathPlaneOnPdfPage(pdfPage, entry.item, size.totalHeight, exportFont);
        } else {
          const overlayCanvas = await renderSingleElementOverlay(entry, size, 2);
          const overlayBytes = dataUrlToUint8Array(overlayCanvas.toDataURL('image/png'));
          const overlay = await exportDoc.embedPng(overlayBytes);
          pdfPage.drawImage(overlay, { x: 0, y: 0, width: size.width, height: size.totalHeight });
        }
      }
    }

    const bytes = await exportDoc.save();
    const sidecar = await buildEditableSidecar();
    const fileName = safePdfName(docAtExportStart.name);
    return { bytes, sidecar, fileName };
  }

  async function handleExportPdf() {
    if (!activeDoc) return;
    setIsExporting(true);
    setStatus('Preparing latest edits for PDF export...');
    let docAtExportStart = normaliseDocument(cloneDocument(activeDocRef.current || activeDoc), activeThemeId);
    docAtExportStart = await flushPendingAutoSave(docAtExportStart);
    setStatus('Building PDF export...');

    let bytes: Uint8Array | null = null;
    let sidecar: unknown = null;

    try {
      const built = await buildCurrentPdfExport(docAtExportStart);
      bytes = built.bytes;
      sidecar = built.sidecar;
      const pdfBuffer = bytesToTransferableBuffer(bytes);
      const localNotesPayload = bytesToLocalNotesPayload(bytes);
      let filePath: string | null = null;
      const folderName = docAtExportStart.folder?.trim();
      const mappedPath = folderName ? folderPaths[folderName] : '';
      const fileName = built.fileName;

      try {
        if (mappedPath && mappedPath !== 'Browser folder access granted' && window.localNotes.savePdfExportToFolder) {
          filePath = await window.localNotes.savePdfExportToFolder(mappedPath, fileName, localNotesPayload, sidecar);
        } else if (folderName && mappedPath === 'Browser folder access granted') {
          const handle = await loadBrowserDirectoryHandle(folderName);
          if (handle) {
            const fileHandle = await handle.getFileHandle(fileName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(new Blob([pdfBuffer], { type: 'application/pdf' }));
            await writable.close();
            if (sidecar) {
              const sidecarHandle = await handle.getFileHandle(`${fileName}.localnotes.json`, { create: true });
              const sidecarWritable = await sidecarHandle.createWritable();
              await sidecarWritable.write(new Blob([JSON.stringify(sidecar, null, 2)], { type: 'application/json' }));
              await sidecarWritable.close();
            }
            filePath = `${folderName}/${fileName}`;
          }
        }

        if (!filePath) {
          filePath = await window.localNotes.savePdfExport(fileName, localNotesPayload, sidecar);
        }

        setStatus(filePath ? `Saved PDF and editable sidecar to ${folderName && mappedPath ? folderName : 'your computer'}.` : 'PDF export cancelled.');
      } catch (saveError) {
        console.error('Native save failed, falling back to browser download:', saveError);
        downloadBrowserFile(fileName, pdfBuffer, 'application/pdf');
        if (sidecar) downloadBrowserFile(`${fileName}.localnotes.json`, JSON.stringify(sidecar, null, 2), 'application/json');
        setStatus('Native save failed, so I downloaded the PDF and editable sidecar instead.');
      }
    } catch (error) {
      console.error(error);
      if (bytes) {
        const fileName = safePdfName(docAtExportStart.name);
        const pdfBuffer = bytesToTransferableBuffer(bytes);
        downloadBrowserFile(fileName, pdfBuffer, 'application/pdf');
        if (sidecar) downloadBrowserFile(`${fileName}.localnotes.json`, JSON.stringify(sidecar, null, 2), 'application/json');
        setStatus('PDF was built but native saving failed, so I downloaded it instead.');
      } else {
        setStatus('PDF export failed. Check the terminal for details.');
      }
    } finally {
      setIsExporting(false);
    }
  }

  async function handleSharePdf() {
    if (!activeDoc || isQuickNoteDoc(activeDoc)) return;
    const docAtShareStart = normaliseDocument(cloneDocument(activeDocRef.current || activeDoc), activeThemeId);
    setIsExporting(true);
    setStatus('Preparing PDF to share...');

    try {
      const built = await buildCurrentPdfExport(docAtShareStart);
      const pdfBuffer = bytesToTransferableBuffer(built.bytes);
      const pdfBlob = new Blob([pdfBuffer], { type: 'application/pdf' });
      const pdfFile = new File([pdfBlob], built.fileName, { type: 'application/pdf' });
      const shareNavigator = navigator as Navigator & { canShare?: (data: { files?: File[] }) => boolean };

      if (typeof navigator.share === 'function' && (!shareNavigator.canShare || shareNavigator.canShare({ files: [pdfFile] }))) {
        await navigator.share({ title: displayName(docAtShareStart.name), text: 'Shared from Dux Notes', files: [pdfFile] } as ShareData & { files: File[] });
        setStatus('PDF shared.');
      } else {
        downloadBrowserFile(built.fileName, pdfBuffer, 'application/pdf');
        setStatus('Sharing is not available here, so I downloaded the PDF instead.');
      }
    } catch (error) {
      console.error('PDF share failed:', error);
      setStatus('Could not share the PDF. Try Save PDF instead.');
    } finally {
      setIsExporting(false);
    }
  }

  async function handleExportCurrentPagePng() {
    if (!activeDoc || !currentPage) return;
    try {
      const { canvas } = await renderExportCanvas(currentPage, currentAnnotations, pdfRef.current, activeTheme, 2);
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `${activeDoc.name.replace(/\.pdf$/i, '')}-page-${pageIndex + 1}.png`;
      link.click();
      setStatus('Exported the current page as a PNG.');
    } catch (error) {
      console.error(error);
      setStatus('PNG export failed.');
    }
  }

  function handleSpacerResizeStart(event: ReactPointerEvent<HTMLButtonElement>, spacer: PageSpacer, pageKey?: string, indexOverride?: number) {
    if (event.pointerType === 'touch') {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const doc = activeDocRef.current;
    const pageIndexValue = typeof indexOverride === 'number' ? indexOverride : pageIndexRef.current;
    const page = pageKey && doc ? doc.pages.find((item) => item.key === pageKey) : doc?.pages[pageIndexValue];
    if (!doc || !page) return;
    setActivePageIndex(pageIndexValue, false);
    event.preventDefault();
    event.stopPropagation();
    pushUndo();

    const visualStart = page.kind === 'pdf' ? sourceYToVisualY(spacer.y, page.spacers || []) : spacer.y;
    resizeRef.current = {
      originalDoc: cloneDocument(doc),
      spacerId: spacer.id,
      pageKey: page.key,
      pageIndex: pageIndexValue,
      startClientY: event.clientY,
      startHeight: spacer.height,
      visualEnd: visualStart + spacer.height
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }


  function handleSpacerResizeMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const resize = resizeRef.current;
    if (!resize) return;
    event.preventDefault();
    event.stopPropagation();

    const delta = (event.clientY - resize.startClientY) / zoom;
    const newHeight = clamp(resize.startHeight + delta, 60, 900);
    const shiftDelta = newHeight - resize.startHeight;
    const next = normaliseDocument(cloneDocument(resize.originalDoc), activeThemeId);
    const page = next.pages[resize.pageIndex];
    page.spacers = (page.spacers || []).map((item) => (item.id === resize.spacerId ? { ...item, height: newHeight } : item));
    const annotations = getPageAnnotations(next, resize.pageKey);
    setPageAnnotations(next, resize.pageKey, shiftAnnotationsAfterY(annotations, resize.visualEnd, shiftDelta));

    activeDocRef.current = next;
    setActiveDoc(next);
    setLibrary((current) => ({ documents: current.documents.map((doc) => (doc.id === next.id ? next : doc)) }));
  }


  function handleSpacerResizeEnd(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const current = activeDocRef.current;
    resizeRef.current = null;
    if (current) scheduleSave(current);
    setStatus('Space resized.');
  }

  function handleTextDragStart(event: ReactPointerEvent<HTMLElement>, box: TextBox) {
    if (event.pointerType === 'touch') {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const data = getActivePageData();
    if (!data) return;
    if (tool === 'select') {
      startSelectionDrag(event, 'text', box.id, data.page.key);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    pushUndo();
    applySelection([elementKey('text', box.id)]);
    textDragRef.current = {
      originalDoc: cloneDocument(data.doc),
      boxId: box.id,
      pageKey: data.page.key,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: box.x,
      startY: box.y
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }


  function handleTextDragMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = textDragRef.current;
    if (!drag) return;
    event.preventDefault();
    event.stopPropagation();
    const dx = (event.clientX - drag.startClientX) / zoom;
    const dy = (event.clientY - drag.startClientY) / zoom;
    const next = normaliseDocument(cloneDocument(drag.originalDoc), activeThemeId);
    const annotations = getPageAnnotations(next, drag.pageKey);
    const bounds = pageViewsRef.current[drag.pageKey] || pageView;
    const textBoxes = annotations.textBoxes.map((box) => {
      if (box.id !== drag.boxId) return box;
      return {
        ...box,
        x: clamp(drag.startX + dx, 0, Math.max(0, bounds.width - box.width)),
        y: clamp(drag.startY + dy, 0, Math.max(0, bounds.totalHeight - box.minHeight))
      };
    });
    setPageAnnotations(next, drag.pageKey, { ...annotations, textBoxes });
    activeDocRef.current = next;
    setActiveDoc(next);
    setLibrary((current) => ({ documents: current.documents.map((doc) => (doc.id === next.id ? next : doc)) }));
  }


  function handleTextDragEnd(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const current = activeDocRef.current;
    textDragRef.current = null;
    if (current) scheduleSave(current);
    setStatus('Text box moved.');
  }

  function handleTextResizeStart(event: ReactPointerEvent<HTMLButtonElement>, box: TextBox) {
    const data = getActivePageData();
    if (!data) return;
    event.preventDefault();
    event.stopPropagation();
    pushUndo();
    applySelection([elementKey('text', box.id)]);
    textResizeRef.current = {
      originalDoc: cloneDocument(data.doc),
      boxId: box.id,
      pageKey: data.page.key,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startWidth: box.width,
      startHeight: box.minHeight,
      startFontSize: box.fontSize
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }


  function handleTextResizeMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const resize = textResizeRef.current;
    if (!resize) return;
    event.preventDefault();
    event.stopPropagation();
    const dx = (event.clientX - resize.startClientX) / zoom;
    const dy = (event.clientY - resize.startClientY) / zoom;
    const next = normaliseDocument(cloneDocument(resize.originalDoc), activeThemeId);
    const annotations = getPageAnnotations(next, resize.pageKey);
    const bounds = pageViewsRef.current[resize.pageKey] || pageView;
    const textBoxes = annotations.textBoxes.map((box) => {
      if (box.id !== resize.boxId) return box;
      const width = clamp(resize.startWidth + dx, 90, Math.max(90, bounds.width - box.x));
      const minHeight = clamp(resize.startHeight + dy, 38, Math.max(38, bounds.totalHeight - box.y));
      const fontSize = clamp(resize.startFontSize + dy / 8, 8, 72);
      return { ...box, width, minHeight, fontSize };
    });
    setPageAnnotations(next, resize.pageKey, { ...annotations, textBoxes });
    activeDocRef.current = next;
    setActiveDoc(next);
    setLibrary((current) => ({ documents: current.documents.map((doc) => (doc.id === next.id ? next : doc)) }));
  }


  function handleTextResizeEnd(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const current = activeDocRef.current;
    textResizeRef.current = null;
    if (current) scheduleSave(current);
    setStatus('Text resized.');
  }

  function handleCanvasDragOver(event: ReactDragEvent<HTMLElement>) {
    const hasImage = Array.from(event.dataTransfer.items || []).some((item) => item.kind === 'file' && item.type.startsWith('image/'));
    if (hasImage) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  function handleCanvasDrop(event: ReactDragEvent<HTMLElement>) {
    const file = Array.from(event.dataTransfer.files || []).find((item) => item.type.startsWith('image/'));
    if (!file) return;
    event.preventDefault();
    const point = getPointFromClient(event.clientX, event.clientY) || undefined;
    void insertImageFromFile(file, point);
  }

  function renderSelectionOverlaysForPage(page: NotebookPage, annotations: PageAnnotations) {
    if (selectedElementKeys.length === 0) return null;
    const selectedBounds = selectedElementKeys
      .map((key) => ({ key, parsed: parseElementKey(key), bounds: getElementBounds(annotations, key) }))
      .filter((item): item is { key: string; parsed: SelectedElement; bounds: { x: number; y: number; width: number; height: number } } => Boolean(item.parsed && item.bounds));
    if (!selectedBounds.length) return null;
    const minX = Math.min(...selectedBounds.map((item) => item.bounds.x));
    const minY = Math.min(...selectedBounds.map((item) => item.bounds.y));
    const maxX = Math.max(...selectedBounds.map((item) => item.bounds.x + item.bounds.width));
    const maxY = Math.max(...selectedBounds.map((item) => item.bounds.y + item.bounds.height));
    const primary = selectedBounds[0].parsed;
    const singleShape = selectedBounds.length === 1 && primary.kind === 'shape'
      ? annotations.shapeBoxes.find((shape) => shape.id === primary.id) || null
      : null;
    const singleMathPlane = selectedBounds.length === 1 && primary.kind === 'mathPlane'
      ? annotations.mathPlaneBoxes.find((plane) => plane.id === primary.id) || null
      : null;
    const style = {
      left: minX * zoom,
      top: minY * zoom,
      width: Math.max(6, maxX - minX) * zoom,
      height: Math.max(6, maxY - minY) * zoom
    } as const;
    const focusSelectedTextFromOverlay = (event: ReactPointerEvent<HTMLDivElement>) => {
      if (selectedBounds.length !== 1 || primary.kind !== 'text' || event.target !== event.currentTarget) return false;
      const rect = event.currentTarget.getBoundingClientRect();
      const edge = 12;
      const insideTextArea = event.clientX > rect.left + edge
        && event.clientX < rect.right - edge
        && event.clientY > rect.top + edge
        && event.clientY < rect.bottom - edge;
      if (!insideTextArea) return false;
      event.preventDefault();
      event.stopPropagation();
      const targetPageIndex = activeDocRef.current?.pages.findIndex((item) => item.key === page.key) ?? pageIndexRef.current;
      if (targetPageIndex !== pageIndexRef.current) setActivePageIndex(targetPageIndex, false);
      focusTextBoxNow(primary.id);
      focusTextBoxSoon(primary.id);
      return true;
    };
    return (
      <div
        key={`${page.key}-selection-unified`}
        className={`selection-box unified ${selectedBounds.length === 1 && primary.kind === 'text' ? 'text-selection' : ''}`}
        style={style}
        onPointerDown={(event) => {
          if (focusSelectedTextFromOverlay(event)) return;
          startSelectionDrag(event, primary.kind, primary.id, page.key);
        }}
        onPointerMove={handleSelectionDragMove}
        onPointerUp={(event) => {
          if (!selectionDragRef.current && focusSelectedTextFromOverlay(event)) return;
          handleSelectionDragEnd(event);
        }}
        onPointerCancel={handleSelectionDragEnd}
      >
        <div className="selection-mini-toolbar" onPointerDown={(event) => event.stopPropagation()}>
          <span>Move</span>
          <button
            type="button"
            title="Delete selection"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setActivePageIndex(activeDocRef.current?.pages.findIndex((item) => item.key === page.key) ?? pageIndexRef.current, false);
              handleDeleteSelectedElements(page.key);
            }}
          >🗑</button>
          <button
            type="button"
            title="Duplicate selection"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setActivePageIndex(activeDocRef.current?.pages.findIndex((item) => item.key === page.key) ?? pageIndexRef.current, false);
              handleDuplicateSelectedElements(page.key);
            }}
          >⧉</button>
          <button type="button" title="Bring to front" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setActivePageIndex(activeDocRef.current?.pages.findIndex((item) => item.key === page.key) ?? pageIndexRef.current, false); handleLayerOrder('front'); }}>↑</button>
          <button type="button" title="Send to back" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setActivePageIndex(activeDocRef.current?.pages.findIndex((item) => item.key === page.key) ?? pageIndexRef.current, false); handleLayerOrder('back'); }}>↓</button>
          <button
            type="button"
            title="Close selection"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              clearSelection();
            }}
          >×</button>
        </div>
        {singleShape && (
          <>
            <button className="shape-resize-handle corner" title="Resize shape" onPointerDown={(event) => handleShapeResizeStart(event, singleShape, 'corner', page.key)} onPointerMove={handleShapeResizeMove} onPointerUp={handleShapeResizeEnd} onPointerCancel={handleShapeResizeEnd} />
            <button className="shape-resize-handle edge right" title="Resize shape" onPointerDown={(event) => handleShapeResizeStart(event, singleShape, 'edge-right', page.key)} onPointerMove={handleShapeResizeMove} onPointerUp={handleShapeResizeEnd} onPointerCancel={handleShapeResizeEnd} />
            <button className="shape-resize-handle edge bottom" title="Resize shape" onPointerDown={(event) => handleShapeResizeStart(event, singleShape, 'edge-bottom', page.key)} onPointerMove={handleShapeResizeMove} onPointerUp={handleShapeResizeEnd} onPointerCancel={handleShapeResizeEnd} />
            <button className="shape-resize-handle edge left" title="Resize shape" onPointerDown={(event) => handleShapeResizeStart(event, singleShape, 'edge-left', page.key)} onPointerMove={handleShapeResizeMove} onPointerUp={handleShapeResizeEnd} onPointerCancel={handleShapeResizeEnd} />
            <button className="shape-resize-handle edge top" title="Resize shape" onPointerDown={(event) => handleShapeResizeStart(event, singleShape, 'edge-top', page.key)} onPointerMove={handleShapeResizeMove} onPointerUp={handleShapeResizeEnd} onPointerCancel={handleShapeResizeEnd} />
          </>
        )}
        {singleMathPlane && (
          <>
            <button className="shape-resize-handle corner" title="Resize Cartesian plane" onPointerDown={(event) => handleMathPlaneResizeStart(event, singleMathPlane, 'corner', page.key)} onPointerMove={handleMathPlaneResizeMove} onPointerUp={handleMathPlaneResizeEnd} onPointerCancel={handleMathPlaneResizeEnd} />
            <button className="shape-resize-handle edge right" title="Resize Cartesian plane" onPointerDown={(event) => handleMathPlaneResizeStart(event, singleMathPlane, 'edge-right', page.key)} onPointerMove={handleMathPlaneResizeMove} onPointerUp={handleMathPlaneResizeEnd} onPointerCancel={handleMathPlaneResizeEnd} />
            <button className="shape-resize-handle edge bottom" title="Resize Cartesian plane" onPointerDown={(event) => handleMathPlaneResizeStart(event, singleMathPlane, 'edge-bottom', page.key)} onPointerMove={handleMathPlaneResizeMove} onPointerUp={handleMathPlaneResizeEnd} onPointerCancel={handleMathPlaneResizeEnd} />
            <button className="shape-resize-handle edge left" title="Resize Cartesian plane" onPointerDown={(event) => handleMathPlaneResizeStart(event, singleMathPlane, 'edge-left', page.key)} onPointerMove={handleMathPlaneResizeMove} onPointerUp={handleMathPlaneResizeEnd} onPointerCancel={handleMathPlaneResizeEnd} />
            <button className="shape-resize-handle edge top" title="Resize Cartesian plane" onPointerDown={(event) => handleMathPlaneResizeStart(event, singleMathPlane, 'edge-top', page.key)} onPointerMove={handleMathPlaneResizeMove} onPointerUp={handleMathPlaneResizeEnd} onPointerCancel={handleMathPlaneResizeEnd} />
          </>
        )}
      </div>
    );
  }

  function renderSpacerControlsForPage(page: NotebookPage, index: number, view: { width: number; baseHeight: number; totalHeight: number }) {
    let cumulative = 0;
    return sortedSpacers(page.spacers || []).map((spacer) => {
      const top = (spacer.y + cumulative) * zoom;
      cumulative += spacer.height;
      return (
        <div
          key={spacer.id}
          className="spacer-overlay"
          style={{ top, height: spacer.height * zoom, width: view.width * zoom }}
        />
      );
    });
  }

  function renderPageSurface(page: NotebookPage, index: number) {
    if (!activeDoc) return null;
    const annotations = getPageAnnotations(activeDoc, page.key);
    const view = pageViews[page.key] || pageViewsRef.current[page.key] || { width: DEFAULT_BLANK_WIDTH, baseHeight: DEFAULT_BLANK_HEIGHT, totalHeight: DEFAULT_BLANK_HEIGHT };
    const selectedOnPage = selectedElementKeys.some((key) => Boolean(getElementBounds(annotations, key)));
    return (
      <div className="continuous-page-shell" key={page.key}>
        <div className="continuous-page-label">Page {index + 1}</div>
        <div
          ref={(node) => {
            pageShadowRefs.current[page.key] = node;
            if (index === pageIndex) pageShadowRef.current = node;
          }}
          className={`page-shadow ${index === pageIndex ? 'active-page' : ''}`}
          style={{ width: view.width * zoom, minHeight: view.totalHeight * zoom }}
          onPointerDown={(event) => {
            if (event.pointerType === 'touch') {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            setActivePageIndex(index, false);
            if (event.target === event.currentTarget) clearSelection();
          }}
          onContextMenu={(event) => {
            if (event.target instanceof HTMLTextAreaElement || (event.target instanceof Element && event.target.closest('button, textarea, input, select'))) return;
            event.preventDefault();
            event.stopPropagation();
            setActivePageIndex(index, false);
            requestDeletePageAt(index);
          }}
        >
          <canvas
            ref={(node) => {
              baseCanvasRefs.current[page.key] = node;
              if (index === pageIndex) baseCanvasRef.current = node;
            }}
            className="base-canvas"
          />
          {renderSpacerControlsForPage(page, index, view)}
          <div className={`image-layer ${tool === 'select' ? 'interactive' : ''}`}>
            {annotations.imageBoxes.map((box) => {
              const selected = selectedImageId === box.id || selectedKeySet.has(elementKey('image', box.id));
              const style = {
                left: box.x * zoom,
                top: box.y * zoom,
                width: box.width * zoom,
                height: box.height * zoom,
                transform: box.rotation ? `rotate(${box.rotation}deg)` : undefined
              } as const;

              return (
                <div
                  key={box.id}
                  className={`image-box-frame ${selected ? 'selected' : ''} ${box.locked ? 'locked' : ''}`}
                  style={style}
                  title={box.name || 'Image'}
                  onPointerDown={(event) => handleImageDragStart(event, box, page.key)}
                  onPointerMove={handleImageDragMove}
                  onPointerUp={handleImageDragEnd}
                  onPointerCancel={handleImageDragEnd}
                >
                  {box.locked && <span className="image-lock-badge" title="Locked image">🔒</span>}
                  {selected && (
                    <>
                      <button
                        className="image-rotate-button"
                        title="Drag to rotate in 90° snaps. Tap for 90° rotation."
                        aria-label="Rotate image"
                        onPointerDown={(event) => handleImageRotateStart(event, box, page.key)}
                        onPointerMove={handleImageRotateMove}
                        onPointerUp={handleImageRotateEnd}
                        onPointerCancel={handleImageRotateEnd}
                      >⟳</button>
                      {!box.locked && <button className="image-resize-handle corner" onPointerDown={(event) => handleImageResizeStart(event, box, 'corner', page.key)} onPointerMove={handleImageResizeMove} onPointerUp={handleImageResizeEnd} onPointerCancel={handleImageResizeEnd} />}
                      {!box.locked && <button className="image-resize-handle edge right" onPointerDown={(event) => handleImageResizeStart(event, box, 'edge-right', page.key)} onPointerMove={handleImageResizeMove} onPointerUp={handleImageResizeEnd} onPointerCancel={handleImageResizeEnd} />}
                      {!box.locked && <button className="image-resize-handle edge bottom" onPointerDown={(event) => handleImageResizeStart(event, box, 'edge-bottom', page.key)} onPointerMove={handleImageResizeMove} onPointerUp={handleImageResizeEnd} onPointerCancel={handleImageResizeEnd} />}
                      {!box.locked && <button className="image-resize-handle edge left" onPointerDown={(event) => handleImageResizeStart(event, box, 'edge-left', page.key)} onPointerMove={handleImageResizeMove} onPointerUp={handleImageResizeEnd} onPointerCancel={handleImageResizeEnd} />}
                      {!box.locked && <button className="image-resize-handle edge top" onPointerDown={(event) => handleImageResizeStart(event, box, 'edge-top', page.key)} onPointerMove={handleImageResizeMove} onPointerUp={handleImageResizeEnd} onPointerCancel={handleImageResizeEnd} />}
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <canvas
            ref={(node) => {
              inkCanvasRefs.current[page.key] = node;
              if (index === pageIndex) inkCanvasRef.current = node;
            }}
            className="ink-canvas"
            style={inkCanvasStyle}
            onPointerDown={(event) => handlePointerDown(event, index)}
            onPointerMove={(event) => handlePointerMove(event, index)}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
          <div className={`text-layer ${tool === 'text' ? 'editable' : ''} ${tool === 'select' ? 'selectable' : ''}`}>
            {annotations.textBoxes.map((box) => {
              const boxFill = box.backgroundColor && box.backgroundColor !== 'transparent' ? box.backgroundColor : 'transparent';
              const style = {
                left: box.x * zoom,
                top: box.y * zoom,
                width: box.width * zoom,
                minHeight: box.minHeight * zoom,
                fontFamily: `"${box.fontFamily}", Arial, sans-serif`,
                fontSize: box.fontSize * zoom,
                color: box.color,
                fontWeight: box.fontWeight,
                background: boxFill,
                '--text-box-bg': boxFill
              } as CSSProperties;

              return (
                <div
                  key={box.id}
                  className={`text-box-frame ${selectedTextId === box.id || selectedKeySet.has(elementKey('text', box.id)) ? 'selected' : ''}`}
                  style={style}
                  onPointerDown={(event) => {
                    setActivePageIndex(index, false);
                    if (tool === 'select') startSelectionDrag(event, 'text', box.id, page.key);
                  }}
                  onPointerMove={handleSelectionDragMove}
                  onPointerUp={handleSelectionDragEnd}
                  onPointerCancel={handleSelectionDragEnd}
                  onDoubleClick={() => {
                    setActivePageIndex(index, false);
                    chooseTool('text');
                    applySelection([elementKey('text', box.id)]);
                    focusTextBoxSoon(box.id);
                  }}
                  onContextMenu={(event) => {
                    if (tool === 'select' || tool === 'text') {
                      event.preventDefault();
                      event.stopPropagation();
                      applySelection([elementKey('text', box.id)]);
                      openFlashcardFromText(box.text || '');
                    }
                  }}
                >
                  <button
                    type="button"
                    className="text-drag-handle"
                    title="Drag to move this text box"
                    onPointerDown={(event) => { setActivePageIndex(index, false); handleTextDragStart(event, box); }}
                    onPointerMove={handleTextDragMove}
                    onPointerUp={handleTextDragEnd}
                    onPointerCancel={handleTextDragEnd}
                  >↕</button>
                  <textarea
                    className="text-box"
                    data-text-id={box.id}
                    value={box.text}
                    placeholder="Type here..."
                    onPointerDown={(event) => {
                      setActivePageIndex(index, false);
                      applySelection([elementKey('text', box.id)]);
                      event.stopPropagation();
                      event.currentTarget.focus();
                      event.currentTarget.setSelectionRange(event.currentTarget.value.length, event.currentTarget.value.length);
                      rememberTextCursor(event.currentTarget, page.key);
                      if (tool === 'select') focusTextBoxSoon(box.id);
                    }}
                    onPointerUp={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      event.currentTarget.focus();
                      event.currentTarget.setSelectionRange(event.currentTarget.value.length, event.currentTarget.value.length);
                      rememberTextCursor(event.currentTarget, page.key);
                      focusTextBoxSoon(box.id);
                    }}
                    onSelect={(event) => rememberTextCursor(event.currentTarget, page.key)}
                    onKeyUp={(event) => rememberTextCursor(event.currentTarget, page.key)}
                    onFocus={() => {
                      setActivePageIndex(index, false);
                      applySelection([elementKey('text', box.id)]);
                      textEditSnapshotRef.current = activeDocRef.current ? JSON.stringify(activeDocRef.current) : null;
                    }}
                    onChange={(event) => {
                      if (textEditSnapshotRef.current) {
                        undoStackRef.current.push(JSON.parse(textEditSnapshotRef.current));
                        if (undoStackRef.current.length > 50) undoStackRef.current.shift();
                        redoStackRef.current = [];
                        setRedoCount(0);
                        setUndoCount(undoStackRef.current.length);
                        textEditSnapshotRef.current = null;
                      }
                      updateTextBox(box.id, { text: event.target.value }, false, page.key);
                      rememberTextCursor(event.currentTarget, page.key);
                    }}
                    onBlur={(event) => {
                      textEditSnapshotRef.current = null;
                      const textValue = event.currentTarget.value;
                      const lineEstimate = Math.max(1, textValue.split('\n').length);
                      updateTextBox(box.id, {
                        text: textValue,
                        minHeight: Math.max(DEFAULT_TEXT_HEIGHT, box.minHeight, Math.ceil((lineEstimate + 1) * box.fontSize * 1.5))
                      }, false, page.key);
                    }}
                  />
                  {(selectedTextId === box.id || selectedKeySet.has(elementKey('text', box.id))) && (
                    <button
                      type="button"
                      className="text-resize-handle"
                      title="Drag to resize text box and font"
                      onPointerDown={(event) => { setActivePageIndex(index, false); handleTextResizeStart(event, box); }}
                      onPointerMove={handleTextResizeMove}
                      onPointerUp={handleTextResizeEnd}
                      onPointerCancel={handleTextResizeEnd}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <div className="selection-layer">{selectedOnPage ? renderSelectionOverlaysForPage(page, annotations) : null}</div>
        </div>
      </div>
    );
  }

  const chrome = getThemeChrome(activeTheme, uiMode);
  const isDarkChrome = uiMode === 'dark' || activeThemeId === 'cyberpunk' || colourLuminance(chrome.uiBg) < 0.42;
  const neoRaised = isDarkChrome
    ? '-3px -3px 7px rgba(255, 255, 255, 0.06), 3px 3px 7px rgba(0, 0, 0, 0.5)'
    : '-4px -4px 8px rgba(255, 255, 255, 0.6), 4px 4px 8px rgba(0, 0, 0, 0.12)';
  const neoPressed = isDarkChrome
    ? 'inset -3px -3px 7px rgba(255, 255, 255, 0.06), inset 3px 3px 7px rgba(0, 0, 0, 0.5)'
    : 'inset -2px -2px 5px rgba(255, 255, 255, 0.6), inset 2px 2px 5px rgba(0, 0, 0, 0.12)';
  const neoStrong = isDarkChrome
    ? '-5px -5px 12px rgba(255, 255, 255, 0.07), 8px 8px 18px rgba(0, 0, 0, 0.58)'
    : '-8px -8px 18px rgba(255, 255, 255, 0.58), 10px 10px 24px rgba(0, 0, 0, 0.14)';
  const neoModal = isDarkChrome
    ? '-8px -8px 18px rgba(255, 255, 255, 0.06), 14px 14px 34px rgba(0, 0, 0, 0.62)'
    : '-12px -12px 30px rgba(255, 255, 255, 0.62), 18px 18px 42px rgba(0, 0, 0, 0.16)';
  const neoPaper = isDarkChrome
    ? '-6px -6px 14px rgba(255, 255, 255, 0.06), 12px 12px 30px rgba(0, 0, 0, 0.6)'
    : '-8px -8px 18px rgba(255, 255, 255, 0.62), 14px 18px 38px rgba(0, 0, 0, 0.18)';
  const neoAccentGlow = `0 0 8px rgba(${activeTheme.accentRgb}, ${isDarkChrome ? '0.42' : '0.2'})`;
  const neoCardRaised = isDarkChrome
    ? '-3px -3px 7px rgba(255, 255, 255, 0.06), 3px 3px 7px rgba(0, 0, 0, 0.5)'
    : '-3px -3px 7px rgba(255, 255, 255, 0.55), 3px 3px 7px rgba(0, 0, 0, 0.15)';
  const neoCardPressed = isDarkChrome
    ? 'inset -3px -3px 7px rgba(255, 255, 255, 0.06), inset 3px 3px 7px rgba(0, 0, 0, 0.5)'
    : 'inset -2px -2px 5px rgba(255, 255, 255, 0.55), inset 2px 2px 5px rgba(0, 0, 0, 0.15)';
  const neoSearchInset = isDarkChrome
    ? 'inset -3px -3px 7px rgba(255, 255, 255, 0.06), inset 3px 3px 7px rgba(0, 0, 0, 0.5)'
    : 'inset -2px -2px 4px rgba(255, 255, 255, 0.6), inset 2px 2px 4px rgba(0, 0, 0, 0.1)';
  const neoBottomInset = isDarkChrome
    ? 'inset -2px -2px 5px rgba(255, 255, 255, 0.055), inset 2px 2px 5px rgba(0, 0, 0, 0.46)'
    : 'inset -1px -1px 3px rgba(255, 255, 255, 0.42), inset 1px 1px 3px rgba(0, 0, 0, 0.09)';
  const neoPageStrong = isDarkChrome
    ? '-7px -7px 16px rgba(255, 255, 255, 0.06), 10px 10px 22px rgba(0, 0, 0, 0.62)'
    : '-8px -8px 16px rgba(255, 255, 255, 0.7), 8px 8px 16px rgba(0, 0, 0, 0.18)';
  const neoTrayInset = isDarkChrome
    ? 'inset 0 2px 5px rgba(0, 0, 0, 0.38), inset 0 -1px 3px rgba(255, 255, 255, 0.08)'
    : 'inset 0 2px 5px rgba(0, 0, 0, 0.08), inset 0 -1px 3px rgba(255, 255, 255, 0.4)';
  const neoSmallRaised = isDarkChrome
    ? '-2px -2px 4px rgba(255, 255, 255, 0.08), 2px 2px 4px rgba(0, 0, 0, 0.42)'
    : '-2px -2px 4px rgba(255, 255, 255, 0.5), 2px 2px 4px rgba(0, 0, 0, 0.1)';
  const neoSmallPressed = isDarkChrome
    ? 'inset -2px -2px 4px rgba(255, 255, 255, 0.08), inset 2px 2px 4px rgba(0, 0, 0, 0.42)'
    : 'inset -2px -2px 4px rgba(255, 255, 255, 0.5), inset 2px 2px 4px rgba(0, 0, 0, 0.1)';
  const neoSidebarBg = mixHex(chrome.sidebarBg, '#000000', isDarkChrome ? 0.08 : 0.10);
  const buttonScale = buttonSizeMode === 'large' ? 1.28 : buttonSizeMode === 'compact' ? 0.92 : 1;
  const appStyle = {
    '--color-background-primary': 'var(--ui-panel)',
    '--color-background-secondary': 'var(--ui-bg)',
    '--color-border-tertiary': 'var(--ui-border)',
    '--border-radius-lg': '26px',
    '--theme-bg': activeTheme.background,
    '--theme-accent': activeTheme.accent,
    '--theme-text': activeTheme.text,
    '--theme-muted': activeTheme.muted,
    '--theme-bg-rgb': activeTheme.backgroundRgb,
    '--theme-accent-rgb': activeTheme.accentRgb,
    '--theme-text-rgb': activeTheme.textRgb,
    '--theme-muted-rgb': activeTheme.mutedRgb,
    '--ui-bg': chrome.uiBg,
    '--ui-panel': chrome.uiPanel,
    '--ui-panel-2': chrome.uiPanel2,
    '--ui-text': chrome.uiText,
    '--ui-muted': chrome.uiMuted,
    '--ui-border': chrome.uiBorder,
    '--ui-shadow': chrome.uiShadow,
    '--sidebar-bg': chrome.sidebarBg,
    '--topbar-bg': chrome.topbarBg,
    '--toolbar-bg': chrome.toolbarBg,
    '--button-bg': chrome.buttonBg,
    '--button-fg': chrome.buttonFg,
    '--chip-bg': chrome.chipBg,
    '--chip-fg': chrome.chipFg,
    '--chip-active-bg': chrome.chipActiveBg,
    '--chip-active-fg': chrome.chipActiveFg,
    '--canvas-bg': chrome.canvasBg,
    '--danger': chrome.danger,
    '--neo-raised': neoRaised,
    '--neo-pressed': neoPressed,
    '--neo-strong': neoStrong,
    '--neo-modal': neoModal,
    '--neo-paper': neoPaper,
    '--neo-accent-glow': neoAccentGlow,
    '--neo-card-raised': neoCardRaised,
    '--neo-card-pressed': neoCardPressed,
    '--neo-search-inset': neoSearchInset,
    '--neo-bottom-inset': neoBottomInset,
    '--neo-page-strong': neoPageStrong,
    '--neo-tray-inset': neoTrayInset,
    '--neo-small-raised': neoSmallRaised,
    '--neo-small-pressed': neoSmallPressed,
    '--neo-sidebar-bg': neoSidebarBg,
    '--button-scale': buttonScale
  } as CSSProperties;
  const saveFailureVisible = status.startsWith('Save failed') || status.startsWith('PDF export failed') || status.startsWith('Native save failed') || status.startsWith('PDF was built but native saving failed');

  function getOnboardingTooltipStyle(): CSSProperties {
    if (!onboardingHighlight) return {};
    const width = 300;
    const gap = 18;
    const appearsLeft = onboardingHighlight.left + onboardingHighlight.width / 2 > window.innerWidth / 2;
    let left = appearsLeft ? onboardingHighlight.left - width - gap : onboardingHighlight.left + onboardingHighlight.width + gap;
    left = clamp(left, 16, Math.max(16, window.innerWidth - width - 16));

    const isNearBottom = onboardingHighlight.top + onboardingHighlight.height + 190 > window.innerHeight;
    const top = isNearBottom
      ? clamp(onboardingHighlight.top - 190, 16, Math.max(16, window.innerHeight - 220))
      : clamp(onboardingHighlight.top, 16, Math.max(16, window.innerHeight - 220));

    return { left, top, width };
  }

  function goToNextOnboardingStep() {
    if (onboardingStepIndex >= ONBOARDING_STEPS.length - 1) {
      setOnboardingPhase('complete');
      setOnboardingHighlight(null);
      setOnboardingTooltipReady(false);
      return;
    }
    setOnboardingStepIndex((index) => index + 1);
  }

  function skipOnboarding() {
    completeOnboarding();
  }

  function finishOnboardingWithAction(action: 'import' | 'create') {
    completeOnboarding();
    if (action === 'import') void handleImportPdf();
    else setCreateDialogOpen(true);
  }


  function renderLayerControls(extra?: ReactNode) {
    if (selectedElementKeys.length === 0) return null;
    return (
      <div className="selected-object-actions" aria-label="Layer ordering">
        <button type="button" onClick={() => handleLayerOrder('front')}>Front</button>
        <button type="button" onClick={() => handleLayerOrder('back')}>Back</button>
        <button type="button" onClick={() => handleLayerOrder('forward')}>Forward</button>
        <button type="button" onClick={() => handleLayerOrder('backward')}>Backward</button>
        {extra}
      </div>
    );
  }

  function renderColourPicker(
    target: ColourPickerTarget,
    label: string,
    value: string,
    presets: { name: string; value: string }[],
    onChange: (next: string) => void,
    options?: { highlighter?: boolean }
  ) {
    const isOpen = activeColourPicker === target;
    const displayColour = value === 'transparent' ? 'transparent' : value;
    const nativeColourValue = safeHexColour(value, target === 'shapeFill' ? '#FFFFFF' : activeTheme.text);
    return (
      <div className="colour-picker-wrap">
        <button
          type="button"
          className="colour-picker-button"
          onClick={(event) => {
            event.stopPropagation();
            setActiveColourPicker((open) => (open === target ? null : target));
          }}
        >
          <span
            className={`colour-picker-swatch ${value === 'transparent' ? 'transparent' : ''}`}
            style={{ background: displayColour, opacity: options?.highlighter ? HIGHLIGHTER_OPACITY : 1 }}
          />
          {label}
        </button>
        {isOpen && (
          <div className="colour-palette" onClick={(event) => event.stopPropagation()}>
            <div className="colour-palette-grid">
              {presets.map((preset) => (
                <button
                  type="button"
                  key={`${target}-${preset.name}-${preset.value}`}
                  className={value.toLowerCase() === preset.value.toLowerCase() ? 'active' : ''}
                  onClick={() => {
                    onChange(preset.value);
                    setActiveColourPicker(null);
                  }}
                  title={preset.name}
                >
                  <span
                    className={preset.value === 'transparent' ? 'transparent' : ''}
                    style={{ background: preset.value, opacity: options?.highlighter ? HIGHLIGHTER_OPACITY : 1 }}
                  />
                  <small>{preset.name}</small>
                </button>
              ))}
            </div>
            <div className="custom-colour-row">
              <span>Custom</span>
              <input
                key={`${target}-${value}`}
                className="custom-colour-hex"
                type="text"
                defaultValue={value === 'transparent' ? '' : value}
                placeholder="#RRGGBB"
                onBlur={(event) => {
                  const next = event.target.value.trim();
                  if (/^#[0-9a-fA-F]{6}$/.test(next)) onChange(next);
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  const targetInput = event.currentTarget;
                  const next = targetInput.value.trim();
                  if (/^#[0-9a-fA-F]{6}$/.test(next)) onChange(next);
                }}
              />
              <input
                type="color"
                value={nativeColourValue}
                onChange={(event) => onChange(event.target.value)}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderMathsPanel() {
    if (!mathsPanelOpen) return null;
    const tabs: { id: MathsTab; label: string }[] = [
      { id: 'symbols', label: 'Symbols' },
      { id: 'templates', label: 'Templates' },
      { id: 'plane', label: 'Plane' },
      { id: 'builders', label: 'Builders' }
    ];

    return (
      <aside className="maths-panel" aria-label="Maths toolkit" onPointerDown={(event) => event.stopPropagation()}>
        <div className="maths-panel-heading">
          <div>
            <strong>Maths</strong>
            <span>Symbols, formulas and graph paper</span>
          </div>
          <button type="button" aria-label="Close maths toolkit" onClick={() => setMathsPanelOpen(false)}>×</button>
        </div>
        <div className="maths-tabs" role="tablist" aria-label="Maths toolkit sections">
          {tabs.map((tab) => (
            <button key={tab.id} type="button" className={mathsTab === tab.id ? 'active' : ''} onClick={() => setMathsTab(tab.id)} role="tab" aria-selected={mathsTab === tab.id}>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="maths-panel-body">
          {mathsTab === 'symbols' && (
            <div className="maths-symbols">
              {MATH_SYMBOL_GROUPS.map((group) => (
                <section key={group.label} className="maths-symbol-group">
                  <h3>{group.label}</h3>
                  <div className="maths-symbol-grid">
                    {group.symbols.map((symbol) => (
                      <button
                        key={`${group.label}-${symbol.value}-${symbol.name}`}
                        type="button"
                        title={symbol.name}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => insertMathText(symbol.value, true)}
                      >
                        {symbol.value}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

          {mathsTab === 'templates' && (
            <div className="math-template-grid">
              {MATH_TEMPLATES.map((template) => (
                <button key={template.label} type="button" className="math-template-card" onClick={() => insertMathText(template.formula, false)}>
                  <strong>{template.label}</strong>
                  <span>{template.formula}</span>
                </button>
              ))}
            </div>
          )}

          {mathsTab === 'plane' && (
            <div className="math-plane-config">
              <div className="math-field-grid two">
                <label>X min<input type="number" value={mathPlaneConfig.xMin} onChange={(event) => updateMathPlaneConfig('xMin', Number(event.target.value))} /></label>
                <label>X max<input type="number" value={mathPlaneConfig.xMax} onChange={(event) => updateMathPlaneConfig('xMax', Number(event.target.value))} /></label>
                <label>Y min<input type="number" value={mathPlaneConfig.yMin} onChange={(event) => updateMathPlaneConfig('yMin', Number(event.target.value))} /></label>
                <label>Y max<input type="number" value={mathPlaneConfig.yMax} onChange={(event) => updateMathPlaneConfig('yMax', Number(event.target.value))} /></label>
              </div>
              <label>
                Grid style
                <select value={mathPlaneConfig.gridStyle} onChange={(event) => updateMathPlaneConfig('gridStyle', event.target.value as MathPlaneBox['gridStyle'])}>
                  <option value="lines">Lines</option>
                  <option value="dotted">Dotted</option>
                  <option value="none">None</option>
                </select>
              </label>
              <label>
                Grid spacing
                <input type="number" min="0.1" step="0.5" value={mathPlaneConfig.gridSpacing} onChange={(event) => updateMathPlaneConfig('gridSpacing', Number(event.target.value))} />
              </label>
              <div className="math-toggle-row">
                <label><input type="checkbox" checked={mathPlaneConfig.showAxisLabels} onChange={(event) => updateMathPlaneConfig('showAxisLabels', event.target.checked)} /> Axis labels</label>
                <label><input type="checkbox" checked={mathPlaneConfig.showTickMarks} onChange={(event) => updateMathPlaneConfig('showTickMarks', event.target.checked)} /> Tick marks</label>
              </div>
              <div className="math-field-grid two">
                <label>Axis colour<input type="color" value={safeHexColour(mathPlaneConfig.axisColor, activeTheme.text)} onChange={(event) => updateMathPlaneConfig('axisColor', event.target.value)} /></label>
                <label>Grid colour<input type="color" value={safeHexColour(mathPlaneConfig.gridColor, activeTheme.accent)} onChange={(event) => updateMathPlaneConfig('gridColor', event.target.value)} /></label>
              </div>
              <label>
                Size on page
                <select value={mathPlaneConfig.size} onChange={(event) => updateMathPlaneConfig('size', event.target.value as MathPlaneSize)}>
                  <option value="small">Small 200×200px</option>
                  <option value="medium">Medium 350×350px</option>
                  <option value="large">Large 500×500px</option>
                </select>
              </label>
              <button type="button" className="primary-button maths-insert-button" onClick={insertConfiguredMathPlane} disabled={!currentPage}>Insert plane</button>
            </div>
          )}

          {mathsTab === 'builders' && (
            <div className="math-builders">
              <section className="math-builder-card fraction-builder">
                <h3>Fraction</h3>
                <input aria-label="Numerator" value={mathBuilderDraft.numerator} onChange={(event) => setMathBuilderDraft((draft) => ({ ...draft, numerator: event.target.value }))} />
                <span />
                <input aria-label="Denominator" value={mathBuilderDraft.denominator} onChange={(event) => setMathBuilderDraft((draft) => ({ ...draft, denominator: event.target.value }))} />
                <button type="button" onClick={insertStackedFraction}>Insert fraction</button>
              </section>

              <section className="math-builder-card">
                <h3>Power</h3>
                <div className="math-inline-fields">
                  <input aria-label="Base" value={mathBuilderDraft.powerBase} onChange={(event) => setMathBuilderDraft((draft) => ({ ...draft, powerBase: event.target.value }))} />
                  <input aria-label="Exponent" value={mathBuilderDraft.exponent} onChange={(event) => setMathBuilderDraft((draft) => ({ ...draft, exponent: event.target.value }))} />
                </div>
                <button type="button" onClick={() => insertMathBuilder('power')}>Insert power</button>
              </section>

              <section className="math-builder-card">
                <h3>Subscript</h3>
                <div className="math-inline-fields">
                  <input aria-label="Base" value={mathBuilderDraft.subscriptBase} onChange={(event) => setMathBuilderDraft((draft) => ({ ...draft, subscriptBase: event.target.value }))} />
                  <input aria-label="Subscript" value={mathBuilderDraft.subscript} onChange={(event) => setMathBuilderDraft((draft) => ({ ...draft, subscript: event.target.value }))} />
                </div>
                <button type="button" onClick={() => insertMathBuilder('subscript')}>Insert subscript</button>
              </section>

              <section className="math-builder-card">
                <h3>Root and value</h3>
                <label>√<input value={mathBuilderDraft.root} onChange={(event) => setMathBuilderDraft((draft) => ({ ...draft, root: event.target.value }))} /></label>
                <button type="button" onClick={() => insertMathBuilder('root')}>Insert square root</button>
                <label>| |<input value={mathBuilderDraft.absolute} onChange={(event) => setMathBuilderDraft((draft) => ({ ...draft, absolute: event.target.value }))} /></label>
                <button type="button" onClick={() => insertMathBuilder('absolute')}>Insert absolute value</button>
              </section>

              <section className="math-builder-card">
                <h3>Vector notation</h3>
                <input value={mathBuilderDraft.vector} onChange={(event) => setMathBuilderDraft((draft) => ({ ...draft, vector: event.target.value }))} aria-label="Vector variable" />
                <div className="segmented-control math-vector-mode">
                  <button type="button" className={mathBuilderDraft.vectorMode === 'arrow' ? 'active' : ''} onClick={() => setMathBuilderDraft((draft) => ({ ...draft, vectorMode: 'arrow' }))}>→v</button>
                  <button type="button" className={mathBuilderDraft.vectorMode === 'bar' ? 'active' : ''} onClick={() => setMathBuilderDraft((draft) => ({ ...draft, vectorMode: 'bar' }))}>v̄</button>
                </div>
                <button type="button" onClick={() => insertMathBuilder('vector')}>Insert vector</button>
              </section>
            </div>
          )}
        </div>
      </aside>
    );
  }

  function buildDuxAiResponse(rawQuestion: string, history: ChatMessage[]): string {
    const question = rawQuestion.trim();
    const q = question.toLowerCase();
    const lastAssistant = [...history].reverse().find((message) => message.role === 'assistant')?.text || '';

    if (looksLikeGreetingOnly(question)) {
      return 'Hey, I’m good. I’m ready to help. I can explain HSC topics, solve Maths steps, check answers, improve English paragraphs, make flashcard ideas and help plan study. Paste the exact question or just ask something like “explain vector magnitude” or “integral of x”.';
    }

    if (/^(thanks|thank you|cheers|ta)[!.\s]*$/i.test(question)) {
      return 'All good. Send the next question or paste your answer and I’ll check it properly.';
    }

    if (/\b(what can you do|help me|how can you help|what are you)\b/i.test(question)) {
      return `I’m Dux AI, a local HSC study companion inside Dux Notes. I can:

1. Explain HSC topics in Chemistry, Physics, Maths Advanced, Extension 1, Extension 2, English Advanced and Studies of Religion I.
2. Solve common Maths steps like algebra, quadratics, differentiation and integration.
3. Check answers and paragraphs for marks.
4. Turn topics into flashcard ideas or quiz questions.
5. Help plan study blocks and revision priorities.

Best way to use me: paste the exact question, your working, or your paragraph. Then say what you want: explain, solve, mark, improve, quiz me, or make flashcards.`;
    }

    if (/^(explain that|explain more|more|why|how come|expand|go deeper|make it clearer)/i.test(question) && lastAssistant) {
      return `Here is the same idea unpacked more clearly:\n\n${lastAssistant}\n\nTo turn that into marks, write it as: definition first, then cause/effect, then one example, equation, quote, case study or diagram point.`;
    }

    if (q.includes('current document') || q.includes('what subject is this') || q.includes('this note')) {
      if (!activeDoc) return 'No notebook is open right now. Open a document first and I can use its name and folder as context.';
      const folderContext = activeDoc.folder || 'Unfiled';
      const guesses = getDuxAiGuideMatches(`${activeDoc.name} ${folderContext}`, 2);
      if (guesses.length) {
        return `The current document is **${activeDoc.name}**, filed under **${folderContext}**.\n\nBest subject guess: ${guesses[0].guide.subject} - ${guesses[0].guide.title}.\n\nGood next move: make flashcards from the key headings, then use the Study schedule to block revision time for this document.`;
      }
      return `The current document is **${activeDoc.name}**. It is filed under **${folderContext}**. If you are making study material, use the file name and folder as your topic context.`;
    }

    if (/\b(mark this|check my answer|check this|is this right|feedback|grade this|can you mark|rate this)\b/i.test(question)) {
      const content = commandContent(question);
      if (content.split(/\s+/).filter(Boolean).length >= 12) return buildMarkingFeedback(question);
      return `Paste your full answer and the question, then I’ll check it properly:

1. What is correct.
2. What is missing.
3. What would lose marks.
4. A cleaner Band 6-style version.

For Maths or Physics, include your working. For English or SOR, include the question and your paragraph.`;
    }

    if (/\b(make|create|generate).{0,20}flashcards?\b/i.test(question)) {
      const earlyCards = getDuxAiBankMatches(question, 8);
      return buildFlashcardIdeasResponse(question, earlyCards);
    }

    if (q.includes('how do i use') || q.includes('dux notes') || q.includes('app help') || q.includes('flashcard') || q.includes('study schedule') || q.includes('scratch') || q.includes('pdf')) {
      if (q.includes('flashcard')) return 'To use flashcards: open Flashcards from the sidebar, choose or create a deck, add cards manually, or generate cards from a topic. In review mode, press Space to flip, then rate Again, Hard, Good, or Easy so the next review date updates.';
      if (q.includes('schedule')) return 'To use the study schedule: open Study schedule from the sidebar, add a study block, choose a folder/subject, optionally link a note or flashcard deck, then use Month or Week view to plan your work. Use Reset schedule only when you want to clear every study block.';
      if (q.includes('scratch')) return 'Scratch is for quick capture. Open it from the bottom bar or with Cmd/Ctrl + Shift + Space, type a quick note, then Send to Notes when you want it saved as a separate text note.';
      if (q.includes('pdf')) return 'To work with PDFs: import a PDF, choose Pen, Highlighter, Text, Image, Shape, or Add space, then Save PDF. Keep the .localnotes.json sidecar file beside the exported PDF if you want annotations to reopen as editable objects.';
      return 'Dux Notes lets you import PDFs, create blank notebooks, annotate pages, make flashcards, plan study sessions, ask the local Dux AI helper, and save scratch notes locally on your computer.';
    }

    const superscriptMap: Record<string, string> = { '²': '2', '³': '3', '⁴': '4', '⁵': '5' };
    const normalised = q.replace(/[²³⁴⁵]/g, (match) => superscriptMap[match] || match).replace(/\s+/g, ' ');

    const vectorMagnitude = buildVectorMagnitudeResponse(question);
    if (vectorMagnitude) return vectorMagnitude;

    const simpleIntegral = buildSimpleIntegralResponse(question);
    if (simpleIntegral) return simpleIntegral;

    const simpleDerivative = buildSimpleDerivativeResponse(question);
    if (simpleDerivative) return simpleDerivative;

    const knownTopic = buildKnownTopicResponse(question);
    if (knownTopic) return knownTopic;

    const quickCalculation = trySimpleCalculation(question);
    if (quickCalculation) return quickCalculation;

    const linear = parseLinearEquation(question);
    if (linear) {
      return `Step by step:
1. Start with ${linear.a}x${linear.b >= 0 ? ` + ${linear.b}` : ` - ${Math.abs(linear.b)}`} = ${linear.c}.
2. Move the constant term across: ${linear.a}x = ${formatNumber(linear.c - linear.b)}.
3. Divide by ${linear.a}.

Answer: **x = ${formatNumber(linear.x)}**.`;
    }

    const quadratic = parseQuadraticEquation(question);
    if (quadratic) {
      if (quadratic.discriminant < 0) return `For ${quadratic.a}x² ${quadratic.b >= 0 ? '+' : '-'} ${Math.abs(quadratic.b)}x ${quadratic.c >= 0 ? '+' : '-'} ${Math.abs(quadratic.c)} = 0, the discriminant is ${quadratic.discriminant}. Since it is negative, there are no real roots.`;
      const [r1, r2] = quadratic.roots;
      return `Step by step:
1. Identify a = ${quadratic.a}, b = ${quadratic.b}, c = ${quadratic.c}.
2. Discriminant: b² - 4ac = ${quadratic.discriminant}.
3. Use x = (-b ± √(b² - 4ac)) / 2a.

Answer: **x = ${formatNumber(r1)}** or **x = ${formatNumber(r2)}**.`;
    }

    const derivativeMatch = normalised.match(/(?:derivative|differentiate|d\/dx).*?([+-]?\d*)x\^?(\d+)/) || normalised.match(/(?:derivative|differentiate|d\/dx).*?x\^?(\d+)/);
    if (derivativeMatch) {
      const hasCoeff = derivativeMatch.length >= 3;
      const coefficientRaw = hasCoeff ? derivativeMatch[1] : '1';
      const coefficient = coefficientRaw === '' || coefficientRaw === '+' ? 1 : coefficientRaw === '-' ? -1 : Number(coefficientRaw);
      const power = Number(hasCoeff ? derivativeMatch[2] : derivativeMatch[1]);
      if (Number.isFinite(power) && Number.isFinite(coefficient)) {
        const newCoeff = coefficient * power;
        const newPower = power - 1;
        return `Step by step:\n1. Use the power rule: d/dx(axⁿ) = anxⁿ⁻¹.\n2. Here a = ${coefficient} and n = ${power}.\n3. Multiply the coefficient by the power: ${coefficient} × ${power} = ${newCoeff}.\n4. Reduce the power by 1: ${power} - 1 = ${newPower}.\n\nAnswer: **${newCoeff}x^${newPower}**.`;
      }
    }

    const integralMatch = normalised.match(/(?:integral|integrate).*?([+-]?\d*)x\^?(\d+)/) || normalised.match(/(?:integral|integrate).*?x\^?(\d+)/);
    if (integralMatch) {
      const hasCoeff = integralMatch.length >= 3;
      const coefficientRaw = hasCoeff ? integralMatch[1] : '1';
      const coefficient = coefficientRaw === '' || coefficientRaw === '+' ? 1 : coefficientRaw === '-' ? -1 : Number(coefficientRaw);
      const power = Number(hasCoeff ? integralMatch[2] : integralMatch[1]);
      if (Number.isFinite(power) && Number.isFinite(coefficient)) {
        const newPower = power + 1;
        return `Step by step:\n1. Use the reverse power rule: ∫axⁿ dx = a·xⁿ⁺¹/(n+1) + C.\n2. Here a = ${coefficient} and n = ${power}.\n3. Increase the power to ${newPower}.\n\nAnswer: **${coefficient}x^${newPower}/${newPower} + C**. You can simplify the coefficient if needed.`;
      }
    }

    if (q.includes('quadratic formula')) return 'The quadratic formula is x = (-b ± √(b² - 4ac)) / 2a. Use it when a quadratic is in the form ax² + bx + c = 0. The discriminant b² - 4ac tells you whether there are two, one or no real solutions.';
    if (q.includes('pythagoras') || q.includes('pythagorean')) return 'Pythagoras applies only to right-angled triangles: a² + b² = c², where c is the hypotenuse. Square the two shorter sides, add them, then square root to find the longest side.';
    if (q.includes('scalar product') || q.includes('dot product')) return 'Scalar product is a vector tool that returns a number, not a vector. Use **a · b = |a||b|cosθ**. In exams, it is mainly used to find angles, test perpendicularity, or find projections. If a · b = 0, the vectors are perpendicular. The trap is forgetting that the answer is a scalar.';
    if (q.includes('binomial theorem')) return 'The binomial theorem expands (a + b)ⁿ without multiplying brackets one by one. The general term is useful when the question asks for a coefficient. Exam move: track the sign, use nCr correctly, and remember the powers of the two terms must add to n.';
    if (q.includes('mathematical induction') || q.includes('induction')) return 'Mathematical induction has four parts: prove the base case, assume the statement is true for n = k, prove it for n = k + 1, then write the conclusion. The conclusion matters. Without it, the proof feels unfinished and you can lose marks.';
    if (q.includes('human experiences')) return 'For English Advanced Common Module, human experiences are not just emotions. They are individual and collective experiences shaped by memory, pressure, conflict, connection and change. A strong paragraph links the experience to a technique and then to what the text reveals about people.';
    if (q.includes('religion and peace') || q.includes('inner peace') || q.includes('world peace')) return 'For Studies of Religion, separate inner peace from world peace. Inner peace is personal spiritual harmony. World peace is social harmony, justice and reconciliation. A strong answer uses a specific teaching or sacred text, then explains how it guides adherents into action.';

    const bankMatches = getDuxAiBankMatches(question, 8);
    const guideMatches = getDuxAiGuideMatches(question, 3);

    const offlinePractice = buildOfflineHscPracticeSet(question, guideMatches, bankMatches);
    if (offlinePractice) return offlinePractice;

    const miniRunThrough = buildMiniRunThrough(question, guideMatches, bankMatches);
    if (miniRunThrough) return miniRunThrough;

    const quizResponse = buildQuizResponse(question, bankMatches);
    if (quizResponse) return quizResponse;

    const flashcardIdeas = buildFlashcardIdeasResponse(question, bankMatches);
    if (flashcardIdeas) return flashcardIdeas;

    const examCommandResponse = buildExamCommandResponse(question, guideMatches, bankMatches);
    if (examCommandResponse && /\b(explain|assess|evaluate|compare|analyse|analyze|describe|discuss|how|why)\b/i.test(question)) return examCommandResponse;

    if (guideMatches.length && guideMatches[0].score >= 18) {
      return formatDuxAiGuideAnswer(guideMatches, bankMatches);
    }

    if (bankMatches.length && bankMatches[0].score >= 14) {
      return buildTargetedBankAnswer(bankMatches);
    }

    const broadSubject = [
      { keys: ['chemistry', 'chem'], answer: 'For Chemistry, start by identifying the module, then anchor the answer in structure, bonding, equilibrium, reactions, calculations or analysis. For HSC answers, define the idea, give the equation or reaction where relevant, then explain the observation or trend.' },
      { keys: ['physics', 'phys'], answer: 'For Physics, write the model first, then the equation, then substitute values with units. Most marks come from linking the physical principle to the situation: force causes acceleration, changing flux induces emf, photons carry quantised energy, or fields transfer forces.' },
      { keys: ['maths', 'mathematics', 'calculus', 'trig'], answer: 'For Maths, identify the problem type first: algebraic manipulation, graphing, trigonometry, calculus, probability or proof. Then write the rule you are using before doing the calculation. That stops your working from turning into random lines.' },
      { keys: ['english', 'essay', 'quote', 'analysis'], answer: 'For English, your answer needs an argument, not a summary. Use this pattern: thesis, topic sentence, quote, technique, effect, link to question. The technique only matters if you explain how it shapes meaning.' },
      { keys: ['economics', 'inflation', 'unemployment', 'gdp'], answer: 'For Economics, build cause-and-effect chains. Example: higher interest rates reduce consumption and investment, lowering aggregate demand, easing inflationary pressure but possibly increasing unemployment.' },
      { keys: ['software', 'programming', 'algorithm', 'database'], answer: 'For Software Engineering, explain the problem, the data, the algorithm, the test cases and the trade-off. Strong answers justify why a design choice fits the user requirement.' },
      { keys: ['studies of religion', 'sor', 'sor1', 'religion'], answer: 'For Studies of Religion, define the religious idea first, then connect it to belief, practice, ethics or adherent impact. Strong responses use specific tradition examples and avoid vague lines like “religion teaches people to be good”.' }
    ];
    const subjectMatch = broadSubject.find((entry) => entry.keys.some((key) => q.includes(key)));
    if (subjectMatch) return subjectMatch.answer;

    const generalFallback = buildGeneralQuestionFallback(question);
    if (generalFallback) return generalFallback;

    return buildStudyCompanionFallback(question);
  }


  async function sendAiChatMessage() {
    const text = aiChatInput.trim();
    if (!text || aiChatTyping) return;

    const userMessage: ChatMessage = { id: makeId(), role: 'user', text };
    const nextHistory = [...aiChatMessages, userMessage].slice(-AI_CHAT_MEMORY_LIMIT);
    setAiChatMessages(nextHistory);
    setAiChatInput('');
    setAiChatTyping(true);

    const context = {
      documentName: activeDoc?.name || '',
      documentKind: activeDoc?.docKind || '',
      page: activeDoc ? pageIndex + 1 : null,
      pageCount,
      folder: activeDoc?.folder || '',
      label: activeDoc ? getDocumentTagOption(activeDoc).name : '',
      selectedText: selectedTextId ? currentAnnotations.textBoxes.find((box) => box.id === selectedTextId)?.text || '' : '',
      quickNotePreview: quickNoteText.slice(0, 1200)
    };

    try {
      const answer = await requestDuxAiAnswer(nextHistory, context);
      setAiChatMessages((messages) => [...messages.slice(-AI_CHAT_MEMORY_LIMIT + 1), { id: makeId(), role: 'assistant', text: answer }]);
    } catch (error) {
      console.warn('Dux AI backend unavailable, using offline helper.', error);
      const offlineAnswer = buildDuxAiResponse(text, nextHistory);
      const answer = `${offlineAnswer}

Offline note: I could not reach the Gemini backend, so I used the built-in Dux AI helper for this reply.`;
      setAiChatMessages((messages) => [...messages.slice(-AI_CHAT_MEMORY_LIMIT + 1), { id: makeId(), role: 'assistant', text: answer }]);
    } finally {
      setAiChatTyping(false);
    }
  }

  return (
    <div ref={appShellRef} className={`app-shell ${uiMode === 'dark' ? 'dark-ui' : ''} ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${saveFailureVisible ? 'save-failed' : ''} ${onboardingVisible && activeOnboardingStep?.animationClass ? activeOnboardingStep.animationClass : ''}`} style={appStyle}>
      {saveFailureVisible && (
        <div className="save-failure-overlay" role="alert" aria-live="assertive">
          <div className="save-failure-card">
            <strong>Save failed</strong>
            <span>{status}. Export a fresh PDF copy from here so the app chrome stays out of the way.</span>
            <button
              type="button"
              className="save-failure-primary"
              onClick={handleExportPdf}
              disabled={!activeDoc || isQuickNoteDoc(activeDoc) || isExporting}
            >
              {isExporting ? 'Saving...' : 'Save PDF copy'}
            </button>
          </div>
        </div>
      )}
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`} data-tour-id="sidebar">
        <div className="brand-block">
          <button
            type="button"
            className="logo-mark logo-collapse-button"
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            title={sidebarCollapsed ? 'Press DN to open the library' : 'Press DN to collapse the library'}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            DN
          </button>
          <div>
            <h1>Dux Notes</h1>
            <p>Local PDF notes, no cloud needed</p>
            <small className="brand-collapse-hint">Press DN to collapse the library.</small>
          </div>
        </div>

        <div className="sidebar-actions">
          <button type="button" className="primary-button" onClick={handleImportPdf}>Import PDF</button>
          <button type="button" className="secondary-button" onClick={() => setCreateDialogOpen(true)}>Create PDF</button>
        </div>

        <div className="search-block">
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search notebooks, notes, tags, folders"
          />
        </div>

        <div className="library-tabs">
          <button className={sidebarMode === 'library' ? 'active' : ''} onClick={() => setSidebarMode('library')}>
            Library <span>{activeDocuments.length}</span>
          </button>
          <button className={sidebarMode === 'notes' ? 'active' : ''} onClick={() => setSidebarMode('notes')}>
            Notes <span>{quickNoteDocuments.length}</span>
          </button>
          <button className={sidebarMode === 'trash' ? 'active' : ''} onClick={() => setSidebarMode('trash')}>
            Trash <span>{trashedDocuments.length}</span>
          </button>
        </div>

        {sidebarMode === 'library' && (
          <div className="folder-panel">
            <div className="folder-heading">
              <strong>Folders</strong>
              <button onClick={handleCreateFolder}>+ Folder</button>
            </div>
            {isCreatingFolder && (
              <input
                ref={folderInputRef}
                className="folder-inline-input"
                value={folderDraft}
                onChange={(event) => setFolderDraft(event.target.value)}
                onBlur={commitFolderCreate}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitFolderCreate();
                  if (event.key === 'Escape') cancelFolderCreate();
                }}
                placeholder="Folder name"
              />
            )}
            <div className="folder-list">
              {folderNames.map((folder) => {
                const canDelete = folder !== 'All' && folder !== 'Unfiled';
                return (
                  <button
                    key={folder}
                    className={`folder-chip ${activeFolderFilter === folder ? 'active' : ''} ${canDelete ? 'deletable' : ''}`}
                    onClick={() => setActiveFolderFilter(folder)}
                    title={folderPaths[folder] ? `Mapped to ${folderPaths[folder]}` : folder}
                  >
                    <span>{folderPaths[folder] ? '📁 ' : ''}{folder}</span>
                    {canDelete && (
                      <span
                        className="folder-remove"
                        title={`Delete ${folder}`}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void handleDeleteFolder(folder);
                        }}
                      >×</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {sidebarMode === 'trash' && trashedDocuments.length > 0 && (
          <div className="trash-actions" aria-label="Trash actions">
            <span>{trashedDocuments.length} in Trash</span>
            <button type="button" className="danger-button empty-trash-button" onClick={() => void handleEmptyTrash()}>
              Delete all
            </button>
          </div>
        )}

        <div className="document-list">
          {visibleDocuments.length === 0 && (
            <p className="empty-message">
              {sidebarMode === 'trash' ? 'Trash is empty.' : sidebarMode === 'notes' ? 'No scratch notes yet.' : 'No notebooks match this view.'}
            </p>
          )}
          {visibleDocuments.map((doc) => {
            const docTheme = getDocumentTheme(doc, customThemes);
            const folder = doc.folder?.trim() || 'Unfiled';
            const isNote = isQuickNoteDoc(doc);
            if (sidebarMode === 'notes' && isNote) {
              const noteText = extractQuickNoteText(doc);
              const firstLine = noteText.split(/\r?\n/).find((line) => line.trim()) || 'Empty note';
              return (
                <article key={doc.id} className={`note-card ${activeDoc?.id === doc.id ? 'active' : ''}`}>
                  <button className="note-card-main" onClick={() => loadDocument(doc)}>
                    <strong>{displayName(doc.name)}</strong>
                    <span>{formatEdited(doc.createdAt)}</span>
                    <p>{firstLine}</p>
                  </button>
                  <button className="delete-button" title="Move to Trash" onClick={() => handleDeleteDocument(doc)}>×</button>
                </article>
              );
            }
            return (
              <article key={doc.id} className={`document-card ${activeDoc?.id === doc.id ? 'active' : ''}`}>
                <button className="document-main" onClick={() => sidebarMode === 'trash' ? undefined : loadDocument(doc)}>
                  <div
                    className="doc-thumbnail"
                    style={{
                      '--doc-thumb-bg': docTheme.background,
                      '--doc-thumb-text': docTheme.text,
                      '--doc-thumb-accent': docTheme.accent
                    } as CSSProperties}
                  >
                    {doc.thumbnailDataUrl ? (
                      <img src={doc.thumbnailDataUrl} alt="" />
                    ) : (
                      <>
                        <span className="thumb-type">{doc.pdfFileName ? 'PDF' : 'NOTE'}</span>
                        <span className="thumb-line" style={{ background: docTheme.accent }} />
                        <span className="thumb-line short" style={{ background: docTheme.accent }} />
                        <span className="thumb-line" style={{ background: docTheme.accent }} />
                      </>
                    )}
                  </div>
                  <div className="doc-info">
                    <strong>{displayName(doc.name)}</strong>
                    <span>{formatEdited(doc.updatedAt)}</span>
                    <span>{doc.pages?.length ? `${doc.pages.length} pages` : doc.pdfFileName ? 'PDF, not opened yet' : 'Blank notebook'}</span>
                    <div className="doc-meta-row">
                      <small>{folder}</small>
                      {(doc.label || getDocumentCustomTags(doc).length > 0) && (() => {
                        const label = getDocumentTagOption(doc);
                        return <small className="label-pill small" style={{ background: label.bg, color: label.fg }}>{label.icon} {label.name}</small>;
                      })()}
                    </div>
                  </div>
                </button>
                <div className="document-actions">
                  {sidebarMode === 'trash' ? (
                    <>
                      <button className="restore-button" title="Restore" onClick={() => handleRestoreDocument(doc)}>↩</button>
                      <button className="delete-button" title="Delete forever" onClick={() => handlePermanentDeleteDocument(doc)}>×</button>
                    </>
                  ) : (
                    <button className="delete-button" title="Move to Trash" onClick={() => handleDeleteDocument(doc)}>×</button>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        <div className="sidebar-study-footer">
          <button className="study-schedule-button sidebar-study-button" data-tour-id="study-schedule" onClick={openStudyPlanner}>📅 Study schedule</button>
          <button className="study-schedule-button sidebar-flashcard-button" data-tour-id="flashcards" onClick={() => { setFlashcardModalOpen(true); resetFlashcardReview(); }}>🃏 Flashcards</button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="active-title">
            {activeDoc && isRenaming ? (
              <input
                ref={renameInputRef}
                className="rename-input"
                value={renameDraft}
                onChange={(event) => setRenameDraft(event.target.value)}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitRename();
                  if (event.key === 'Escape') cancelRename();
                }}
              />
            ) : (
              <strong>{activeDoc ? displayName(activeDoc.name) : 'No notebook selected'}</strong>
            )}
            <span>{activeDoc ? (isQuickNoteDoc(activeDoc) ? 'Plain note stored locally' : `${pageCount} page${pageCount === 1 ? '' : 's'} stored locally`) : 'Create or import to start writing'}</span>
          </div>

          {activeDoc && (() => {
            const label = getDocumentTagOption(activeDoc);
            return (
              <div className="label-menu-wrap">
                <button
                  className="label-pill"
                  style={{ background: label.bg, color: label.fg }}
                  onClick={() => setLabelMenuOpen((open) => !open)}
                  title="Choose document tag"
                >
                  {label.icon} {label.name}
                </button>
                {labelMenuOpen && (
                  <div className="label-menu">
                    {LABEL_OPTIONS.map((option) => (
                      <button
                        key={option.id || 'none'}
                        style={{ background: option.bg, color: option.fg }}
                        onClick={() => handleSetLabel(option.id)}
                      >
                        {option.icon} {option.name}
                      </button>
                    ))}
                    {availableCustomTags.length > 0 && (
                      <>
                        <span className="tag-menu-divider">Custom tags</span>
                        {availableCustomTags.map((tag) => {
                          const option = makeCustomTagOption(tag);
                          return (
                            <div className="custom-tag-row" key={`custom-${tag}`} style={{ background: option.bg, color: option.fg }}>
                              <button type="button" className="custom-tag-select" onClick={() => handleSetCustomTag(tag)}>
                                {option.icon} {option.name}
                              </button>
                              <button
                                type="button"
                                className="custom-tag-delete"
                                aria-label={`Delete custom tag ${tag}`}
                                title={`Delete custom tag ${tag}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleDeleteCustomTag(tag);
                                }}
                              >
                                ×
                              </button>
                            </div>
                          );
                        })}
                      </>
                    )}
                    <button className="custom-tag-button" onClick={() => handleSetCustomTag()}>
                      + Custom tag
                    </button>
                  </div>
                )}
              </div>
            );
          })()}

          {!isQuickNoteDoc(activeDoc) && (
            <div className="doc-organise-strip">
              <label>
                Folder
                <select value={activeDoc?.folder?.trim() || 'Unfiled'} onChange={(event) => handleAssignFolder(event.target.value)} disabled={!activeDoc}>
                  {folderNames.filter((folder) => folder !== 'All').map((folder) => (
                    <option key={folder} value={folder}>{folder}</option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <div className="topbar-actions">
            <button className="ghost-button" onClick={handleRename} disabled={!activeDoc || isRenaming}>Rename</button>
            <button className="ghost-button" onClick={() => setContentsOpen(true)} disabled={!activeDoc || isQuickNoteDoc(activeDoc)}>Contents</button>
            <button className="ghost-button" onClick={() => setHelpOpen(true)}>Help</button>
            <button className="ghost-button" onClick={() => setSettingsOpen(true)}>Settings</button>
            <button className="ghost-button" onClick={toggleUiMode}>{uiMode === 'dark' ? 'Light mode' : 'Dark mode'}</button>
            <button className="ghost-button share-button" onClick={handleSharePdf} disabled={!activeDoc || isQuickNoteDoc(activeDoc) || isExporting}>Share</button>
            <button className="save-button" onClick={handleExportPdf} disabled={!activeDoc || isQuickNoteDoc(activeDoc) || isExporting}>{isExporting ? 'Saving...' : 'Save PDF'}</button>
          </div>
        </header>

        {openDocTabs.length > 0 && (
          <div className="document-tab-strip" aria-label="Open document tabs">
            {openDocTabs.map((id) => {
              const doc = library.documents.find((item) => item.id === id && !item.deletedAt);
              if (!doc) return null;
              return (
                <button
                  key={id}
                  type="button"
                  className={`${activeDoc?.id === id ? 'active' : ''} ${draggingDocTabId === id ? 'is-dragging' : ''}`}
                  data-doc-tab-id={id}
                  onPointerDown={(event) => handleDocTabPointerDown(event, id)}
                  onPointerMove={handleDocTabPointerMove}
                  onPointerUp={(event) => handleDocTabPointerUp(event, doc)}
                  onPointerCancel={handleDocTabPointerCancel}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    void loadDocument(doc);
                  }}
                  title={doc.name}
                >
                  <span className="document-tab-icon" aria-hidden="true">📄</span>
                  <span className="document-tab-title">{displayName(doc.name)}</span>
                  <b
                    className="document-tab-close"
                    role="button"
                    aria-label={`Close ${displayName(doc.name)}`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpenDocTabs((tabs) => tabs.filter((tabId) => tabId !== id));
                    }}
                  >×</b>
                </button>
              );
            })}
          </div>
        )}

        {!isQuickNoteDoc(activeDoc) && <section className="toolbar" aria-label="Notebook tools" data-tour-id="toolbar">
          <div className="tool-clusters">
            <div className="tool-group main-tools icon-toolbar" aria-label="Drawing tools">
              <button title="Select (S)" data-tooltip="Select" aria-label="Select tool" className={tool === 'select' ? 'selected' : ''} onClick={() => chooseTool('select')}><ToolIcon name="select" /></button>
              <button title="Lasso (L)" data-tooltip="Lasso" aria-label="Lasso tool" className={tool === 'lasso' ? 'selected' : ''} onClick={() => chooseTool('lasso')}><ToolIcon name="lasso" /></button>
              <button title="Pen (B)" data-tooltip="Pen" aria-label="Pen tool" className={tool === 'pen' ? 'selected' : ''} onClick={() => chooseTool('pen')}><ToolIcon name="pen" /><span className="tool-swatch" style={{ background: colour }} /></button>
              <button title="Highlighter (H)" data-tooltip="Highlighter" aria-label="Highlighter tool" className={tool === 'highlighter' ? 'selected' : ''} onClick={() => chooseTool('highlighter')}><ToolIcon name="highlighter" /><span className="tool-swatch" style={{ background: highlighterColour, opacity: HIGHLIGHTER_OPACITY }} /></button>
              <button title="Eraser (E)" data-tooltip="Eraser" aria-label="Eraser tool" className={tool === 'eraser' ? 'selected' : ''} onClick={() => chooseTool('eraser')}><ToolIcon name="eraser" /></button>
            </div>
            <div className="tool-divider" />
            <div className="tool-group main-tools icon-toolbar" aria-label="Text and image tools">
              <button title="Text (T)" data-tooltip="Text" aria-label="Text tool" className={tool === 'text' ? 'selected' : ''} onClick={() => chooseTool('text')}><ToolIcon name="text" /></button>
              <button title="Add image" data-tooltip="Image" aria-label="Add image" onClick={() => { setMathsPanelOpen(false); imageInputRef.current?.click(); }} disabled={!currentPage}><ToolIcon name="image" /></button>
              <button title="Shape (R)" data-tooltip="Shape" aria-label="Shape tool" className={tool === 'shape' ? 'selected' : ''} onClick={() => chooseTool('shape')}><ToolIcon name="shape" /><span className="tool-swatch split" style={{ background: `linear-gradient(135deg, ${shapeFillColour === 'transparent' ? 'transparent' : shapeFillColour} 0 48%, ${shapeStrokeColour} 52% 100%)` }} /></button>
              <button title="Maths toolkit" data-tooltip="Maths" aria-label="Maths toolkit" className={mathsPanelOpen ? 'selected' : ''} onClick={(event) => { event.stopPropagation(); setMoreMenuOpen(false); setSecondaryBarOpen(false); setActiveColourPicker(null); setMathsPanelOpen((open) => !open); }} aria-expanded={mathsPanelOpen}><ToolIcon name="maths" /></button>
              <input
                ref={imageInputRef}
                className="hidden-file-input"
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                onChange={handleImagePickerChange}
              />
            </div>
            <div className="tool-divider" />
            <div className="tool-group main-tools icon-toolbar" aria-label="Layout tools">
              <button title="Add space" data-tooltip="Add space" aria-label="Add space" className={tool === 'space' ? 'selected' : ''} onClick={() => chooseTool('space')}><ToolIcon name="space" /></button>
              <button title="Scroll" data-tooltip="Scroll" aria-label="Scroll mode" className={tool === 'hand' ? 'selected' : ''} onClick={() => chooseTool('hand')}><ToolIcon name="hand" /></button>
            </div>
          </div>

          <div className="more-menu-wrap">
            <button className="more-button" data-tooltip="More" title="More actions" aria-label="More actions" onClick={() => setMoreMenuOpen((open) => !open)} aria-expanded={moreMenuOpen}>⋯</button>
            {moreMenuOpen && (
              <div className="more-menu">
                <button onClick={() => { handleRotateCurrentPage(); setMoreMenuOpen(false); }} disabled={!currentPage}>Rotate page</button>
                <button onClick={() => { handleCropCurrentPdfPage(); setMoreMenuOpen(false); }} disabled={!currentPage || currentPage.kind !== 'pdf'}>Crop PDF page</button>
                <button onClick={() => { handleAddBottomSpace(); setMoreMenuOpen(false); }} disabled={!currentPage}>Space below</button>
                <button onClick={() => { handleExportCurrentPagePng(); setMoreMenuOpen(false); }} disabled={!currentPage}>PNG page</button>
              </div>
            )}
          </div>

          <div className="toolbar-quick-actions" aria-label="Scratch and Dux AI" data-tour-id="right-utility">
            <button className="quick-note-toggle" data-tooltip="Scratch" onClick={(event) => { event.stopPropagation(); setScratchpadOpen((open) => !open); }} title="Scratch, Cmd/Ctrl+Shift+Space" aria-label="Scratch" aria-expanded={scratchpadOpen}><UtilityIcon name="scratch" /></button>
            <button className="ask-ai-toggle" data-tour-id="dux-ai" data-tooltip="Dux AI" onClick={() => { setTipPopupOpen(false); setAiChatOpen((open) => !open); }} title="Ask Dux AI" aria-label="Ask Dux AI" aria-expanded={aiChatOpen}><UtilityIcon name="ai" /></button>
          </div>

          {renderMathsPanel()}

          <div className={`context-panel ${secondarySettingsVisible ? 'is-open' : 'is-collapsed'} ${selectedObjectSettingsVisible ? 'selected-object-settings' : ''} ${tool === 'lasso' ? 'lasso-settings-panel' : ''} ${isInking && (tool === 'pen' || tool === 'highlighter' || tool === 'eraser' || tool === 'shape') ? 'is-inking-fade' : ''}`} aria-hidden={!secondarySettingsVisible}>
            {tool === 'select' && hasSelectedTextBox && (
              <>
                <span className="context-hint strong">Selected text box</span>
                {renderLayerControls(<button type="button" onClick={() => { if (!selectedTextBox) return; chooseTool('text'); focusTextBoxSoon(selectedTextBox.id); }}>Edit text</button>)}
                <label>
                  Colour
                  <input type="color" value={colour} onChange={(event) => handleTextColourChange(event.target.value)} />
                </label>
                <label>
                  Font
                  <select value={fontFamily} onChange={(event) => handleTextFontFamilyChange(event.target.value)}>
                    {FONT_OPTIONS.map((font) => <option key={font} value={font}>{font}</option>)}
                  </select>
                </label>
                <label>
                  Size
                  <input type="number" min="8" max="80" value={fontSize} onChange={(event) => handleTextFontSizeChange(Number(event.target.value))} />
                </label>
                <label>
                  W
                  <input type="number" min="90" max="1600" value={Math.round(selectedTextBox?.width || DEFAULT_TEXT_WIDTH)} onChange={(event) => handleSelectedTextWidthChange(Number(event.target.value))} />
                </label>
                <label>
                  H
                  <input type="number" min="38" max="1800" value={Math.round(selectedTextBox?.minHeight || DEFAULT_TEXT_HEIGHT)} onChange={(event) => handleSelectedTextHeightChange(Number(event.target.value))} />
                </label>
                <label>
                  Weight
                  <select value={fontWeight} onChange={(event) => handleTextWeightChange(event.target.value as '400' | '600' | '700')}>
                    <option value="400">Regular</option>
                    <option value="600">Semi</option>
                    <option value="700">Bold</option>
                  </select>
                </label>
                <label>
                  Box fill
                  <select value={textBoxBackground} onChange={(event) => applyTextBoxBackground(event.target.value)}>
                    <option value="transparent">Transparent</option>
                    <option value="#FFFFFF">White</option>
                    <option value="#000000">Black</option>
                    <option value={activeTheme.background}>Paper colour</option>
                  </select>
                </label>
              </>
            )}
            {tool === 'select' && hasSelectedImageBox && (
              <>
                <span className="context-hint strong">Selected image</span>
                {renderLayerControls(<button type="button" onClick={toggleSelectedImageLock}>{selectedImageBox?.locked ? 'Unlock' : 'Lock'}</button>)}
                <button type="button" className="mini-action-button" onClick={() => currentPage && rotateSelectedImage(currentPage.key)}>Rotate 90°</button>
              </>
            )}
            {tool === 'select' && hasSelectedShapeBox && (
              <>
                <span className="context-hint strong">Selected shape</span>
                {renderLayerControls()}
                <label>
                  Shape
                  <select value={shapeKind} onChange={(event) => handleShapeKindChange(event.target.value as ShapeKind)}>
                    {SHAPE_OPTION_GROUPS.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </label>
                {renderColourPicker('shapeStroke', 'Shape border', shapeStrokeColour, SHAPE_PRESETS.filter((item) => item.value !== 'transparent'), handleShapeStrokeColourChange)}
                {renderColourPicker('shapeFill', 'Shape fill', shapeFillColour, SHAPE_PRESETS, handleShapeFillColourChange)}
                <label>
                  Width
                  <input type="range" min="1" max="18" value={strokeWidth} onChange={(event) => handleShapeStrokeWidthChange(Number(event.target.value))} />
                  <b>{strokeWidth}px</b>
                </label>
                <label>
                  Opacity
                  <input type="range" min="0.05" max="1" step="0.05" value={opacity} onChange={(event) => handleShapeOpacityChange(Number(event.target.value))} />
                  <b>{Math.round(opacity * 100)}%</b>
                </label>
                <label>
                  W
                  <input type="number" min="12" max="1600" value={Math.round(normaliseRect(selectedShapeBox?.x || 0, selectedShapeBox?.y || 0, selectedShapeBox?.width || 120, selectedShapeBox?.height || 120).width)} onChange={(event) => handleSelectedShapeWidthChange(Number(event.target.value))} />
                </label>
                <label>
                  H
                  <input type="number" min="12" max="1600" value={Math.round(normaliseRect(selectedShapeBox?.x || 0, selectedShapeBox?.y || 0, selectedShapeBox?.width || 120, selectedShapeBox?.height || 120).height)} onChange={(event) => handleSelectedShapeHeightChange(Number(event.target.value))} />
                </label>
              </>
            )}
            {tool === 'select' && hasSelectedMathPlaneBox && (
              <>
                <span className="context-hint strong">Selected Cartesian plane</span>
                {renderLayerControls()}
                <label>X min<input type="number" value={selectedMathPlaneBox?.xMin ?? -10} onChange={(event) => handleSelectedMathPlaneNumberChange('xMin', Number(event.target.value))} /></label>
                <label>X max<input type="number" value={selectedMathPlaneBox?.xMax ?? 10} onChange={(event) => handleSelectedMathPlaneNumberChange('xMax', Number(event.target.value))} /></label>
                <label>Y min<input type="number" value={selectedMathPlaneBox?.yMin ?? -10} onChange={(event) => handleSelectedMathPlaneNumberChange('yMin', Number(event.target.value))} /></label>
                <label>Y max<input type="number" value={selectedMathPlaneBox?.yMax ?? 10} onChange={(event) => handleSelectedMathPlaneNumberChange('yMax', Number(event.target.value))} /></label>
                <label>
                  Grid
                  <select value={selectedMathPlaneBox?.gridStyle || 'lines'} onChange={(event) => handleSelectedMathPlaneGridStyleChange(event.target.value as MathPlaneBox['gridStyle'])}>
                    <option value="lines">Lines</option>
                    <option value="dotted">Dotted</option>
                    <option value="none">None</option>
                  </select>
                </label>
                <label>Spacing<input type="number" min="0.1" step="0.5" value={selectedMathPlaneBox?.gridSpacing ?? 1} onChange={(event) => handleSelectedMathPlaneNumberChange('gridSpacing', Number(event.target.value))} /></label>
                <label>Axis<input type="color" value={safeHexColour(selectedMathPlaneBox?.axisColor || activeTheme.text, activeTheme.text)} onChange={(event) => handleSelectedMathPlaneColourChange('axisColor', event.target.value)} /></label>
                <label>Grid colour<input type="color" value={safeHexColour(selectedMathPlaneBox?.gridColor || activeTheme.accent, activeTheme.accent)} onChange={(event) => handleSelectedMathPlaneColourChange('gridColor', event.target.value)} /></label>
                <label className="context-checkbox"><input type="checkbox" checked={selectedMathPlaneBox?.showAxisLabels ?? true} onChange={(event) => handleSelectedMathPlaneToggle('showAxisLabels', event.target.checked)} /> Labels</label>
                <label className="context-checkbox"><input type="checkbox" checked={selectedMathPlaneBox?.showTickMarks ?? true} onChange={(event) => handleSelectedMathPlaneToggle('showTickMarks', event.target.checked)} /> Ticks</label>
                <label>W<input type="number" min="80" max="1600" value={Math.round(selectedMathPlaneBox?.width || 350)} onChange={(event) => handleSelectedMathPlaneNumberChange('width', Number(event.target.value))} /></label>
                <label>H<input type="number" min="80" max="1600" value={Math.round(selectedMathPlaneBox?.height || 350)} onChange={(event) => handleSelectedMathPlaneNumberChange('height', Number(event.target.value))} /></label>
              </>
            )}
            {tool === 'pen' && (
              <>
                {renderColourPicker('pen', 'Pen colour', colour, PEN_PRESETS, setColour)}
                <label>
                  Width
                  <input type="range" min="1" max="18" value={strokeWidth} onChange={(event) => setStrokeWidth(Number(event.target.value))} />
                  <b>{strokeWidth}px</b>
                </label>
                <label>
                  Opacity
                  <input type="range" min="0.1" max="1" step="0.05" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} />
                  <b>{Math.round(opacity * 100)}%</b>
                </label>
              </>
            )}
            {tool === 'highlighter' && (
              <>
                {renderColourPicker('highlighter', 'Highlighter colour', highlighterColour, HIGHLIGHTER_PRESETS, setHighlighterColour, { highlighter: true })}
                <label>
                  Width
                  <input type="range" min="1" max="18" value={strokeWidth} onChange={(event) => setStrokeWidth(Number(event.target.value))} />
                  <b>{Math.max(16, strokeWidth * 4)}px</b>
                </label>
                <span className="context-hint">Opacity locked at {Math.round(HIGHLIGHTER_OPACITY * 100)}% so it still reads like a real highlighter.</span>
              </>
            )}
            {tool === 'eraser' && (
              <>
                <div className="segmented-control eraser-mode-control" aria-label="Eraser mode">
                  <button type="button" className={eraserMode === 'pixel' ? 'active' : ''} onClick={() => setEraserMode('pixel')}>Pixel eraser</button>
                  <button type="button" className={eraserMode === 'object' ? 'active' : ''} onClick={() => setEraserMode('object')}>Object eraser</button>
                </div>
                <label>
                  Eraser size
                  <input type="range" min="1" max="18" value={strokeWidth} onChange={(event) => setStrokeWidth(Number(event.target.value))} />
                  <b>{Math.max(12, strokeWidth * 3)}px</b>
                </label>
              </>
            )}
            {tool === 'text' && (
              <>
                <label>
                  Colour
                  <input type="color" value={colour} onChange={(event) => handleTextColourChange(event.target.value)} />
                </label>
                <label>
                  Font
                  <select value={fontFamily} onChange={(event) => handleTextFontFamilyChange(event.target.value)}>
                    {FONT_OPTIONS.map((font) => <option key={font} value={font}>{font}</option>)}
                  </select>
                </label>
                <label>
                  Size
                  <input type="number" min="8" max="80" value={fontSize} onChange={(event) => handleTextFontSizeChange(Number(event.target.value))} />
                </label>
                <label>
                  Weight
                  <select value={fontWeight} onChange={(event) => handleTextWeightChange(event.target.value as '400' | '600' | '700')}>
                    <option value="400">Regular</option>
                    <option value="600">Semi</option>
                    <option value="700">Bold</option>
                  </select>
                </label>
                <label>
                  Box fill
                  <select value={textBoxBackground} onChange={(event) => applyTextBoxBackground(event.target.value)}>
                    <option value="transparent">Transparent</option>
                    <option value="#FFFFFF">White</option>
                    <option value="#000000">Black</option>
                    <option value={activeTheme.background}>Paper colour</option>
                  </select>
                </label>
              </>
            )}
            {tool === 'shape' && (
              <>
                <label>
                  Shape
                  <select value={shapeKind} onChange={(event) => handleShapeKindChange(event.target.value as ShapeKind)}>
                    {SHAPE_OPTION_GROUPS.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </label>
                {renderColourPicker('shapeStroke', 'Shape border', shapeStrokeColour, SHAPE_PRESETS.filter((item) => item.value !== 'transparent'), handleShapeStrokeColourChange)}
                {renderColourPicker('shapeFill', 'Shape fill', shapeFillColour, SHAPE_PRESETS, handleShapeFillColourChange)}
                <label>
                  Width
                  <input type="range" min="1" max="18" value={strokeWidth} onChange={(event) => handleShapeStrokeWidthChange(Number(event.target.value))} />
                  <b>{strokeWidth}px</b>
                </label>
                <label>
                  Opacity
                  <input type="range" min="0.05" max="1" step="0.05" value={opacity} onChange={(event) => handleShapeOpacityChange(Number(event.target.value))} />
                  <b>{Math.round(opacity * 100)}%</b>
                </label>
              </>
            )}
            {tool === 'lasso' && (
              <>
                <span className="context-hint">Select</span>
                <div className="segmented-control lasso-filter-control" aria-label="Lasso selection filter">
                  <button type="button" className={lassoFilter === 'all' ? 'active' : ''} onPointerDown={(event) => event.stopPropagation()} onClick={() => setLassoFilter('all')}>All</button>
                  <button type="button" className={lassoFilter === 'handwriting' ? 'active' : ''} onPointerDown={(event) => event.stopPropagation()} onClick={() => setLassoFilter('handwriting')}>Ink</button>
                  <button type="button" className={lassoFilter === 'images' ? 'active' : ''} onPointerDown={(event) => event.stopPropagation()} onClick={() => setLassoFilter('images')}>Images</button>
                  <button type="button" className={lassoFilter === 'text' ? 'active' : ''} onPointerDown={(event) => event.stopPropagation()} onClick={() => setLassoFilter('text')}>Text</button>
                  <button type="button" className={lassoFilter === 'shapes' ? 'active' : ''} onPointerDown={(event) => event.stopPropagation()} onClick={() => setLassoFilter('shapes')}>Shapes</button>
                </div>
              </>
            )}
            {tool === 'space' && (
              <label>
                Inserted space
                <input type="range" min="80" max="700" step="20" value={spaceHeight} onChange={(event) => setSpaceHeight(Number(event.target.value))} />
                <b>{spaceHeight}px</b>
              </label>
            )}
            {tool === 'hand' && <span className="context-hint">Scroll mode is on. Select a tool to write again.</span>}
          </div>

          <div className="toolbar-actions">
            <button data-tooltip="Redo" title="Redo" aria-label="Redo" onClick={handleRedo} disabled={redoCount === 0}><UtilityIcon name="redo" /></button>
            <button data-tooltip="Undo" title="Undo" aria-label="Undo" onClick={handleUndo} disabled={undoCount === 0}><UtilityIcon name="undo" /></button>
            <button className="danger-button" data-tooltip="Clear page" title="Clear page" aria-label="Clear page" onClick={handleClearPage} disabled={!currentPage}><UtilityIcon name="clear" /></button>
          </div>
        </section>}

        {activeDoc && !isQuickNoteDoc(activeDoc) && (
          <div className="page-rail-popover">
            <button
              type="button"
              className="page-rail-toggle"
              onClick={() => setPageRailOpen((open) => !open)}
              aria-expanded={pageRailOpen}
              aria-label="Show page thumbnails"
            >
              Pages <b>{pageIndex + 1}</b> ▾
            </button>
            {pageRailOpen && (
              <div className="page-rail" aria-label="Page thumbnails">
                {activeDoc.pages.map((page, index) => (
                  <button
                    key={page.key}
                    className={`page-thumb-card ${index === pageIndex ? 'active' : ''}`}
                    onClick={() => {
                      setActivePageIndex(index, true);
                      setPageRailOpen(false);
                    }}
                    onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); requestDeletePageAt(index); }}
                    title={`${getPageDisplayTitle(activeDoc, page, index)}. Right-click to delete page.`}
                  >
                    <span className="page-thumb-paper">
                      {page.kind === 'blank' ? (page.template === 'grid' ? '▦' : page.template === 'plain' ? '□' : page.template === 'cornell' ? '⊞' : '☰') : 'PDF'}
                    </span>
                    {activeDoc.bookmarks?.[page.key] && <span className="page-thumb-bookmark">★</span>}
                    <b>{index + 1}</b>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {activeDoc && !isQuickNoteDoc(activeDoc) && (
          <div className="bookmark-rail" aria-label="Bookmarked pages">
            <button type="button" className="bookmark-rail-heading" onClick={() => setContentsOpen(true)} title="Open editable contents and bookmarks">★ Marks</button>
            <div className="bookmark-rail-list">
              {activeDoc.pages.map((page, index) => activeDoc.bookmarks?.[page.key] ? (
                <button key={page.key} type="button" onClick={() => jumpToPageKey(page.key)} title={`Go to ${getPageDisplayTitle(activeDoc, page, index)}`}>
                  <span>{index + 1}</span>
                  <strong>{getPageDisplayTitle(activeDoc, page, index)}</strong>
                </button>
              ) : null)}
              {!Object.values(activeDoc.bookmarks || {}).some(Boolean) && <span className="bookmark-rail-empty">Use Contents to star pages.</span>}
            </div>
          </div>
        )}

        <section
          ref={canvasStageRef}
          className={`canvas-stage ${!activeDoc ? 'empty-state' : ''} ${tool === 'hand' ? 'scroll-mode' : ''} ${tool === 'select' ? 'select-mode' : ''} ${tool === 'lasso' ? 'lasso-mode' : ''}`}
          onDragOver={handleCanvasDragOver}
          onDrop={handleCanvasDrop}
          onTouchStart={handleCanvasStageTouchStart}
          onTouchMove={handleCanvasStageTouchMove}
          onTouchEnd={handleCanvasStageTouchEnd}
          onTouchCancel={handleCanvasStageTouchEnd}
          onContextMenu={(event) => {
            if (shouldGuardCanvasTouch(event.target)) event.preventDefault();
          }}
        >
          {!activeDoc && (
            <div className="welcome-card">
              <h2>Create a clean local notebook</h2>
              <p>Import a PDF or create a blank PDF, write by hand, type notes, erase mistakes, insert space, resize that space, and save the final notebook back to your computer.</p>
              <div className="shortcut-strip">
                <span>S Select</span>
                <span>B Pen</span>
                <span>H Highlighter</span>
                <span>E Eraser</span>
                <span>T Text</span>
                <span>Cmd/Ctrl Z Undo</span>
              </div>
              <div className="welcome-actions">
                <button type="button" className="primary-button" onClick={handleImportPdf}>Import PDF</button>
                <button type="button" className="secondary-button" onClick={() => setCreateDialogOpen(true)}>Create PDF</button>
              </div>
            </div>
          )}

          {activeDoc && isQuickNoteDoc(activeDoc) && (
            <div className="quick-note-editor-surface">
              <div className="quick-note-editor-card">
                <div className="quick-note-editor-heading">
                  <span>Notes</span>
                  <strong>{displayName(activeDoc.name)}</strong>
                  <small>{formatEdited(activeDoc.updatedAt)}</small>
                </div>
                <textarea
                  value={quickNoteText}
                  onChange={(event) => void handleQuickNoteEditorChange(event.target.value)}
                  placeholder="Write your note here..."
                />
              </div>
            </div>
          )}

          {activeDoc && !isQuickNoteDoc(activeDoc) && (
            <div className="continuous-pages">
              {activeDoc.pages.map((page, index) => renderPageSurface(page, index))}
            </div>
          )}
        </section>

        <section className="bottom-bar" aria-label="Workspace status and controls" data-tour-id="bottom-bar">
          <div className="bottom-status-group" aria-label="Time and tip">
            <span className="live-clock" title={formatAestFullDate(clockNow)}>{formatAestClock(clockNow)}</span>
            <div className="tips-popover-wrap">
              <button
                ref={tipButtonRef}
                className={`tips-inline ${tipPopupOpen ? 'active' : ''}`}
                onClick={(event) => {
                  event.stopPropagation();
                  const rect = event.currentTarget.getBoundingClientRect();
                  setAiChatOpen(false);
                  setTipPopupPosition({
                    left: clamp(rect.left + rect.width / 2 - 130, 14, window.innerWidth - 274),
                    bottom: Math.max(72, window.innerHeight - rect.top + 12)
                  });
                  setTipPopupOpen((open) => !open);
                }}
                title="Show study tip"
                aria-label="Show study tip"
                aria-expanded={tipPopupOpen}
              >
                <span>💡</span>
                <strong>Tip</strong>
              </button>
              {tipPopupOpen && (
                <div ref={tipPopupRef} className="tip-popup" style={tipPopupPosition ? ({ '--tip-left': `${tipPopupPosition.left}px`, '--tip-bottom': `${tipPopupPosition.bottom}px` } as CSSProperties) : undefined} role="dialog" aria-label="Study tip">
                  <div>
                    <strong>Quick tip</strong>
                    <button type="button" onClick={() => setTipPopupOpen(false)} aria-label="Close tip">×</button>
                  </div>
                  <p>{TIPS[tipIndex]}</p>
                  <div className="tip-popup-actions">
                    <button type="button" onClick={() => setTipIndex((index) => (index + 1) % TIPS.length)}>Next tip</button>
                    <button type="button" onClick={() => { setTipPopupOpen(false); setAiChatOpen(true); }}>Ask Dux AI</button>
                    <button type="button" onClick={() => { setTipPopupOpen(false); openStudyPlanner(); }}>Plan study</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bottom-control-group" aria-label="Page, zoom and AI controls">
            <div className="blank-page-menu-wrap">
              <button
                type="button"
                className="blank-page-toggle"
                onClick={() => setBlankPageMenuOpen((open) => !open)}
                disabled={!activeDoc || isQuickNoteDoc(activeDoc)}
                title="Choose the type of blank page to insert"
                aria-label="Choose blank page type"
                aria-expanded={blankPageMenuOpen}
              >
                ＋ <span>Blank page</span> ▾
              </button>
              {blankPageMenuOpen && (
                <div className="blank-page-menu" role="menu" aria-label="Blank page type">
                  <button type="button" onClick={() => handleInsertBlankPage('ruled')}>Ruled page</button>
                  <button type="button" onClick={() => handleInsertBlankPage('grid')}>Grid page</button>
                  <button type="button" onClick={() => handleInsertBlankPage('plain')}>Plain page</button>
                  <button type="button" onClick={() => handleInsertBlankPage('cornell')}>Cornell notes page</button>
                </div>
              )}
            </div>
            <button
              type="button"
              className="delete-page-toggle"
              onClick={handleDeleteCurrentPage}
              disabled={!activeDoc || isQuickNoteDoc(activeDoc) || pageCount <= 1}
              title="Delete current page"
              aria-label="Delete current page"
            >
              🗑 <span>Delete page</span>
            </button>
            <div className="page-nav compact-page-indicator editable-page-indicator" title="Type a page number and press Enter">
              {activeDoc && !isQuickNoteDoc(activeDoc) ? (
                <>
                  <span>Page</span>
                  <input
                    aria-label="Current page number"
                    inputMode="numeric"
                    min={1}
                    max={pageCount}
                    value={pageJumpDraft}
                    onChange={(event) => setPageJumpDraft(event.target.value.replace(/[^0-9]/g, ''))}
                    onKeyDown={handlePageJumpKeyDown}
                  />
                  <span>of {pageCount}</span>
                </>
              ) : (
                <span>{activeDoc ? 'Text note' : 'No document selected'}</span>
              )}
            </div>
            <label className="zoom-control" title="Zoom canvas">
              Zoom
              <input type="range" min={MIN_PAGE_ZOOM} max={MAX_PAGE_ZOOM} step="0.05" value={zoom} onChange={(event) => setZoom(clamp(Number(event.target.value), MIN_PAGE_ZOOM, MAX_PAGE_ZOOM))} />
              <b>{Math.round(zoom * 100)}%</b>
            </label>
          </div>

          <div className="bottom-workspace-group" aria-label="Document status">
            <span className="status-text" title={isLoadingPdf ? 'Loading...' : status}>{isLoadingPdf ? 'Loading...' : status}</span>
          </div>
        </section>

      </main>

      {aiChatOpen && (
        <div className="ai-chat-panel">
          <div className="ai-chat-header">
            <div>
              <strong>Dux AI</strong>
              <span>HSC study assistant</span>
            </div>
            <div className="ai-chat-header-actions">
              <button onClick={() => setAiChatMessages([])}>Clear chat</button>
              <button onClick={() => setAiChatOpen(false)}>×</button>
            </div>
          </div>
          <div className="ai-chat-history">
            {aiChatMessages.length === 0 && (
              <div className="ai-chat-welcome">Hi! I'm Dux AI. Ask me anything: HSC topics, study help, explanations, maths problems, essay advice, or app help.</div>
            )}
            {aiChatMessages.map((message) => (
              <div key={message.id} className={`ai-chat-row ${message.role}`}>
                <div className="ai-chat-bubble">
                  {message.role === 'assistant' ? <AiMessageText text={message.text} /> : message.text}
                </div>
              </div>
            ))}
            {aiChatTyping && (
              <div className="ai-chat-row assistant">
                <div className="ai-chat-bubble typing-dots"><span /> <span /> <span /></div>
              </div>
            )}
          </div>
          <div className="ai-chat-input-row">
            <input
              value={aiChatInput}
              onChange={(event) => setAiChatInput(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') sendAiChatMessage(); }}
              placeholder="Ask Dux AI..."
            />
            <button onClick={sendAiChatMessage} disabled={!aiChatInput.trim() || aiChatTyping}>Send</button>
          </div>
        </div>
      )}

      {scratchpadOpen && (
        <div className="scratchpad-panel" ref={scratchpadRef}>
          <div className="scratchpad-heading">
            <div>
              <strong>✏ Scratch</strong>
              <span>{scratchSavedAt ? `Saved ${scratchSavedAt.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}` : 'Autosaves every 2 seconds'}</span>
            </div>
            <button onClick={() => setScratchpadOpen(false)}>×</button>
          </div>
          <textarea
            value={scratchpadText}
            onChange={(event) => setScratchpadText(event.target.value)}
            placeholder="Jot something down fast..."
            autoFocus
          />
          <div className="scratchpad-actions">
            <button className="secondary-button" onClick={clearScratchpad}>Clear</button>
            <button className="primary-button" onClick={() => void sendScratchpadToLibrary()}>Send to Notes →</button>
          </div>
        </div>
      )}

      {onboardingVisible && (
        <div className={`onboarding-layer onboarding-${onboardingPhase} ${activeOnboardingStep?.animationClass || ''}`} role="dialog" aria-modal="true" aria-label="Dux Notes onboarding">
          {onboardingPhase === 'tour' && onboardingHighlight && (
            <div
              className="onboarding-spotlight"
              style={{
                top: onboardingHighlight.top,
                left: onboardingHighlight.left,
                width: onboardingHighlight.width,
                height: onboardingHighlight.height,
                borderRadius: onboardingHighlight.radius
              }}
            />
          )}

          {onboardingPhase === 'intro' && (
            <div className="onboarding-intro" aria-hidden="true">
              <div className="onboarding-intro-logo">DN</div>
              <div className="onboarding-intro-ring" />
              <span>Dux Notes</span>
            </div>
          )}

          {onboardingPhase === 'welcome' && (
            <div className="onboarding-modal onboarding-welcome">
              <div className="modal-heading">
                <div>
                  <h2>Welcome to Dux Notes</h2>
                  <p>A quick tour of everything — takes under a minute.</p>
                </div>
              </div>
              <div className="modal-actions">
                <button className="secondary-button" onClick={skipOnboarding}>Skip tutorial</button>
                <button className="primary-button" onClick={() => setOnboardingPhase('tour')}>Let's go →</button>
              </div>
            </div>
          )}

          {onboardingPhase === 'tour' && activeOnboardingStep && onboardingHighlight && (
            <div className={`onboarding-tooltip ${onboardingTooltipReady ? 'is-ready' : ''}`} style={getOnboardingTooltipStyle()}>
              <h3>{activeOnboardingStep.title}</h3>
              <p>{activeOnboardingStep.text}</p>
              <div className="onboarding-tooltip-footer">
                <button className="onboarding-skip" onClick={skipOnboarding}>Skip</button>
                <div className="onboarding-dots" aria-label={`Step ${onboardingStepIndex + 1} of ${ONBOARDING_STEPS.length}`}>
                  {ONBOARDING_STEPS.map((step, index) => <span key={step.title} className={index === onboardingStepIndex ? 'active' : ''} />)}
                </div>
                <button className="primary-button" onClick={goToNextOnboardingStep}>
                  {onboardingStepIndex === ONBOARDING_STEPS.length - 1 ? 'Finish ✓' : 'Next →'}
                </button>
              </div>
            </div>
          )}

          {onboardingPhase === 'complete' && (
            <div className="onboarding-modal onboarding-complete">
              <div className="onboarding-confetti" aria-hidden="true">
                {Array.from({ length: 18 }, (_, index) => <span key={index} style={{ '--i': index } as CSSProperties} />)}
              </div>
              <svg className="onboarding-check" viewBox="0 0 72 72" aria-hidden="true">
                <path d="M20 37.5 31 48 53 24" />
              </svg>
              <div className="modal-heading">
                <div>
                  <h2>You're all set</h2>
                  <p>Import a PDF to annotate or create a blank notebook to start writing.</p>
                </div>
              </div>
              <div className="modal-actions">
                <button className="secondary-button" onClick={() => finishOnboardingWithAction('import')}>Import PDF</button>
                <button className="secondary-button" onClick={completeOnboarding}>Exit</button>
                <button className="primary-button" onClick={() => finishOnboardingWithAction('create')}>Create PDF</button>
              </div>
            </div>
          )}
        </div>
      )}

      {flashcardCreateOpen && !flashcardModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setFlashcardCreateOpen(false)}>
          <div className="flashcard-create-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <h2>Make flashcard</h2>
                <p>Create a card from selected note text or add one manually.</p>
              </div>
              <button className="modal-close" onClick={() => setFlashcardCreateOpen(false)}>×</button>
            </div>
            <label className="field-block">
              Front
              <textarea value={flashcardDraft.front} onChange={(event) => setFlashcardDraft((current) => ({ ...current, front: event.target.value }))} placeholder="Question, term, or prompt" />
            </label>
            <label className="field-block">
              Back
              <textarea value={flashcardDraft.back} onChange={(event) => setFlashcardDraft((current) => ({ ...current, back: event.target.value }))} placeholder="Answer, definition, or explanation" />
            </label>
            <label className="field-block">
              Deck
              <select value={flashcardDraft.deck} onChange={(event) => setFlashcardDraft((current) => ({ ...current, deck: event.target.value }))}>
                {flashcardDeckNames.map((deck) => <option key={deck} value={deck}>{deck}</option>)}
              </select>
            </label>
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setFlashcardCreateOpen(false)}>Cancel</button>
              <button className="primary-button" onClick={saveFlashcardDraft}>Save flashcard</button>
            </div>
          </div>
        </div>
      )}

      {flashcardModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => { setFlashcardModalOpen(false); setFlashcardGeneratorOpen(false); setFlashcardCreateOpen(false); resetFlashcardReview(); }}>
          <div className="flashcard-review-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <h2>Flashcards</h2>
                <p>Review decks with basic spaced repetition. Again returns today, Hard tomorrow, Good in 3 days, Easy in 7 days.</p>
              </div>
              <button className="modal-close" onClick={() => { setFlashcardModalOpen(false); setFlashcardGeneratorOpen(false); setFlashcardCreateOpen(false); resetFlashcardReview(); }}>×</button>
            </div>
            <input
              ref={ankiImportInputRef}
              type="file"
              accept=".apkg,.apkg2,.apkj,.txt,.csv"
              className="hidden-file-input"
              onChange={handleAnkiImportFile}
            />

            {!reviewStarted ? (
              flashcardCreateOpen ? (
                <section className="flashcard-generator-panel flashcard-add-panel">
                  <div className="generator-note">
                    <strong>Add flashcard</strong>
                    <span>Create a card manually, or use selected text from your notes as the front.</span>
                  </div>
                  <label className="field-block">
                    Front
                    <textarea value={flashcardDraft.front} onChange={(event) => setFlashcardDraft((current) => ({ ...current, front: event.target.value }))} placeholder="Question, term, or prompt" />
                  </label>
                  <label className="field-block">
                    Back
                    <textarea value={flashcardDraft.back} onChange={(event) => setFlashcardDraft((current) => ({ ...current, back: event.target.value }))} placeholder="Answer, definition, or explanation" />
                  </label>
                  <label className="field-block">
                    Deck
                    <select value={flashcardDraft.deck} onChange={(event) => setFlashcardDraft((current) => ({ ...current, deck: event.target.value }))}>
                      {flashcardDeckNames.map((deck) => <option key={deck} value={deck}>{deck}</option>)}
                    </select>
                  </label>
                  <div className="modal-actions">
                    <button className="secondary-button" onClick={() => setFlashcardCreateOpen(false)}>Cancel</button>
                    <button className="primary-button" onClick={saveFlashcardDraft}>Save card</button>
                  </div>
                </section>
              ) : flashcardGeneratorOpen ? (
                <section className="flashcard-generator-panel">
                  <div className="generator-note">
                    <strong>✨ Smart flashcard generator</strong>
                    <span>Dux AI creates stronger cards when online. If the backend is unavailable, the expanded offline HSC bank creates original exam-style revision cards from syllabus and past-paper patterns.</span>
                  </div>
                  {flashcardGeneratorWarning && <div className="generator-warning">{flashcardGeneratorWarning}</div>}
                  <label className="field-block">
                    What do you want to revise?
                    <textarea
                      value={flashcardGeneratorPrompt}
                      onChange={(event) => setFlashcardGeneratorPrompt(event.target.value)}
                      placeholder="Generate 10 questions from Module 7 Chemistry HSC covering equilibrium, Le Chatelier's principle and acids and bases"
                    />
                  </label>
                  <div className="field-grid compact">
                    <label className="field-block">
                      Deck
                      <select value={flashcardGeneratorDeck} onChange={(event) => setFlashcardGeneratorDeck(event.target.value)}>
                        {flashcardDeckNames.map((deck) => <option key={deck} value={deck}>{deck}</option>)}
                        <option value="__new__">Create new deck</option>
                      </select>
                    </label>
                    {flashcardGeneratorDeck === '__new__' && (
                      <label className="field-block">
                        New deck name
                        <input value={flashcardGeneratorNewDeck} onChange={(event) => setFlashcardGeneratorNewDeck(event.target.value)} placeholder="e.g. Chemistry Module 7" />
                      </label>
                    )}
                  </div>
                  <div className="modal-actions generator-actions">
                    <button className="secondary-button" onClick={() => { setFlashcardGeneratorOpen(false); setFlashcardGeneratorPreview([]); setFlashcardGeneratorWarning(''); }}>Back to decks</button>
                    <button className="secondary-button" onClick={runLocalFlashcardGenerator}>{flashcardGeneratorPreview.length ? 'Regenerate' : 'Generate flashcards'}</button>
                    <button className="primary-button" disabled={!flashcardGeneratorPreview.length} onClick={saveGeneratedFlashcards}>Save {flashcardGeneratorPreview.length || 0} cards to {resolveFlashcardGeneratorDeck()}</button>
                  </div>
                  <div className="generated-flashcard-preview">
                    {flashcardGeneratorPreview.length === 0 ? (
                      <p className="empty-message">Generated cards will appear here before saving.</p>
                    ) : flashcardGeneratorPreview.map((card) => (
                      <article key={card.id} className="generated-card-row">
                        <div>
                          <strong>{card.front}</strong>
                          <span>{card.back}</span>
                        </div>
                        <button className="danger-button" onClick={() => removeFlashcardPreview(card.id)}>×</button>
                      </article>
                    ))}
                  </div>
                </section>
              ) : (
              <div className="flashcard-start-grid">
                <section className="deck-list-panel">
                  <div className="study-date-heading">
                    <div>
                      <span>Decks</span>
                      <strong>{flashcards.length} cards total</strong>
                    </div>
                    <div className="flashcard-heading-actions"><button className="secondary-button" onClick={openManualFlashcard}>Add card</button><button className="secondary-button" onClick={openFlashcardGenerator}>✨ Generate flashcards</button><button className="secondary-button" onClick={openAnkiImportPicker}>Import Anki</button></div>
                  </div>
                  {(ankiImportStatus || ankiImportPreview) && (
                    <div className="anki-import-panel">
                      <div className="generator-note">
                        <strong>Anki import</strong>
                        <span>{ankiImportStatus || 'Choose an Anki .apkg package or tab-separated export.'}</span>
                      </div>
                      {ankiImportPreview && (
                        <>
                          <label className="field-block">
                            New deck name
                            <input value={ankiImportPreview.deckName} onChange={(event) => setAnkiImportPreview((preview) => preview ? { ...preview, deckName: event.target.value } : preview)} />
                          </label>
                          <div className="anki-import-preview">
                            <strong>{ankiImportPreview.cards.length} cards from {ankiImportPreview.fileName}</strong>
                            <span>{ankiImportPreview.cards[0]?.front} → {ankiImportPreview.cards[0]?.back}</span>
                          </div>
                          <div className="modal-actions generator-actions">
                            <button className="secondary-button" onClick={cancelAnkiImport}>Cancel import</button>
                            <button className="primary-button" onClick={saveAnkiImportDeck}>Save imported deck</button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  <div className="deck-list">
                    {flashcardDeckStats.map((deck) => (
                      <article key={deck.deck} className={`deck-card ${reviewSelectedDecks.includes(deck.deck) ? 'selected' : ''}`}>
                        <button onClick={() => toggleReviewDeck(deck.deck)}>
                          <strong>{deck.deck}</strong>
                          <span>{deck.count} cards · {deck.due} due today</span>
                        </button>
                        <button className="danger-button" onClick={() => deleteFlashcardDeck(deck.deck)}>Delete deck</button>
                      </article>
                    ))}
                  </div>
                  <button className="primary-button wide" disabled={!flashcards.length} onClick={startFlashcardReview}>Start review</button>
                </section>
                <section className="card-manage-panel">
                  <strong>Cards</strong>
                  <div className="card-list-mini">
                    {flashcards.length === 0 ? <p className="empty-message">No flashcards yet.</p> : flashcards.slice(0, 80).map((card) => (
                      <article key={card.id} className="mini-card-row">
                        <div>
                          <b>{card.front}</b>
                          <span>{card.deck} · due {formatScheduleDate(card.dueDate)}</span>
                        </div>
                        <button className="danger-button" onClick={() => deleteFlashcard(card.id)}>×</button>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
              )
            ) : reviewIndex >= reviewQueue.length ? (
              <div className="review-finished-card">
                <h3>Review complete</h3>
                <p>Again: {reviewSummary.again} · Hard: {reviewSummary.hard} · Good: {reviewSummary.good} · Easy: {reviewSummary.easy}</p>
                <div className="modal-actions">
                  <button className="secondary-button" onClick={resetFlashcardReview}>Review again</button>
                  <button className="primary-button" onClick={() => { setFlashcardModalOpen(false); setFlashcardGeneratorOpen(false); setFlashcardCreateOpen(false); resetFlashcardReview(); }}>Close</button>
                </div>
              </div>
            ) : (
              <div className="flashcard-review-panel">
                <div className="review-progress">
                  <span>Card {Math.min(reviewIndex + 1, reviewQueue.length)} of {reviewQueue.length}</span>
                  <div><i style={{ width: `${((reviewIndex) / Math.max(1, reviewQueue.length)) * 100}%` }} /></div>
                </div>
                <button className={`review-card ${reviewFlipped ? 'flipped' : ''}`} onClick={() => setReviewFlipped((value) => !value)}>
                  <small>{reviewFlipped ? 'Back' : 'Front'} · click or press Space to flip</small>
                  <strong>{reviewFlipped ? (reviewQueue[reviewIndex]?.back || 'No answer added yet.') : reviewQueue[reviewIndex]?.front}</strong>
                </button>
                {reviewFlipped && (
                  <div className="rating-row">
                    <button onClick={() => rateFlashcard('again')}>Again</button>
                    <button onClick={() => rateFlashcard('hard')}>Hard</button>
                    <button onClick={() => rateFlashcard('good')}>Good</button>
                    <button onClick={() => rateFlashcard('easy')}>Easy</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {studyNotifications.length > 0 && (
        <div className="study-notification-stack">
          {studyNotifications.map((notification) => (
            <article key={notification.id} className={`study-notification-banner ${notification.kind}`}>
              <div>
                <strong>{notification.message}</strong>
                {notification.kind === 'soon' && <span>Get ready before the block starts.</span>}
                {notification.kind === 'complete' && <span>Lock it in while it is still fresh.</span>}
              </div>
              <div className="study-notification-actions">
                {notification.linkedDocId && notification.kind !== 'complete' && (
                  <button onClick={() => openNotificationLinkedNote(notification)}>Open note →</button>
                )}
                {notification.kind === 'complete' && <button onClick={() => markStudyNotificationDone(notification)}>Mark done</button>}
                <button onClick={() => dismissStudyNotification(notification.id)}>Dismiss</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {toastMessage && <div className="toast-message">{toastMessage}</div>}

      {helpOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Dux Notes help" onClick={() => setHelpOpen(false)}>
          <div className="create-modal help-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <span>Dux Notes guide</span>
                <h2>Help and tools</h2>
                <p>Everything important in one place, so you can write faster and keep the page clear.</p>
              </div>
              <button className="modal-close" onClick={() => setHelpOpen(false)}>×</button>
            </div>

            <div className="help-grid">
              <section>
                <h3>Writing tools</h3>
                <ul>
                  <li><b>Select</b> moves text, images, shapes and selected ink.</li>
                  <li><b>Lasso</b> draws around objects to select a group. Use its filter to grab all items, handwriting only, images, text or shapes.</li>
                  <li><b>Pen</b> writes freehand. Pick colour, width and opacity in the settings panel. Scribble firmly across existing handwriting to scratch it out quickly.</li>
                  <li><b>Highlighter</b> marks notes with a wider transparent stroke.</li>
                  <li><b>Eraser</b> has Pixel eraser for parts of strokes and Object eraser for whole objects.</li>
                  <li><b>Text</b> inserts typed boxes. Select a text box later to change colour, font, size, weight or transparent, white, black or paper fill.</li>
                  <li><b>Image</b> inserts PNG, JPG, WebP or GIF images. Select an image to rotate it, change its layer order or lock it so you can draw over it safely.</li>
                  <li><b>Shape</b> adds diagrams, arrows, frames and flowchart-style symbols. Select a shape later to resize it, change its style or change its layer order.</li>
                  <li><b>Add space</b> inserts writing room inside a page. Drag the handle to resize it.</li>
                  <li><b>Scroll</b> lets you move around the notebook without writing.</li>
                </ul>
              </section>

              <section>
                <h3>Page controls</h3>
                <ul>
                  <li><b>Blank page</b> opens a picker for Ruled, Grid, Plain or Cornell notes pages and adds the new page after the current one.</li>
                  <li><b>Delete page</b> removes the current page. You can also right-click a page thumbnail or the page surface to delete a page.</li>
                  <li><b>Page box</b> lets you type a page number and press Enter to jump there.</li>
                  <li><b>Zoom</b> changes the page size. On iPad, pinch with two fingers. On laptop trackpads, pinch over the notebook to zoom the page instead of the browser.</li>
                  <li><b>More</b> has extra export and layout tools such as Rotate page, Crop PDF page, Space below and PNG page.</li>
                  <li><b>Contents</b> lets you rename pages, add bookmarks and jump to important parts of a notebook.</li>
                  <li><b>Document tabs</b> keep recently opened notebooks across the top so you can swap between notes and PDFs quickly.</li>
                  <li><b>Layer controls</b> let selected text, images, shapes or lasso groups move to the front or back.</li>
                  <li><b>Bookmarks rail</b> appears beside the page thumbnails so starred pages stay visible while writing.</li>
                  <li><b>Save PDF</b> exports your marked-up notebook.</li>
                </ul>
              </section>

              <section>
                <h3>iPad and laptop gestures</h3>
                <ul>
                  <li>Use Apple Pencil or mouse to write.</li>
                  <li>Use two fingers to pan around the notebook on iPad.</li>
                  <li>Pinch two fingers apart to zoom in and pinch together to zoom out.</li>
                  <li>Finger and palm touches are guarded so they do not create random ink. Use Apple Pencil or a mouse for actual writing.</li>
                  <li>Tap the same tool a second time to hide its extra settings panel.</li>
                  <li>Click or tap the blurred area outside most popups to close them quickly.</li>
                  <li>While using Pen, Highlighter, Eraser or Shape, the settings panel fades so it stays out of your way.</li>
                </ul>
              </section>

              <section>
                <h3>Study features</h3>
                <ul>
                  <li><b>Dux AI</b> answers study questions, explains topics, checks working and helps with HSC-style responses.</li>
                  <li><b>Flashcards</b> lets you add cards, generate local cards and review with spaced-repetition ratings.</li>
                  <li><b>Study schedule</b> builds study blocks. If you give time slots, it places the work inside those slots.</li>
                  <li><b>Scratch</b> is a quick note area for thoughts that do not need a full notebook.</li>
                  <li><b>Tip</b> rotates quick study and app-use ideas.</li>
                </ul>
              </section>

              <section>
                <h3>Themes and custom colours</h3>
                <ul>
                  <li><b>Default themes</b> are Focused Ecru, Sage & Slate, Terracotta & Parchment, Cyberpunk Night and Lavender Mist.</li>
                  <li><b>Settings</b> lets you switch between the default themes and any themes you have saved.</li>
                  <li><b>Custom themes</b> let you choose your own background, accent and text colours.</li>
                  <li><b>Image theme</b> can pull the main colours from an uploaded image and use them as an app colour scheme.</li>
                  <li><b>Save theme</b> keeps your named colour scheme so you can use it again later.</li>
                </ul>
              </section>

              <section>
                <h3>Get started</h3>
                <ul>
                  <li><b>Study schedule prompt:</b> “I am free Monday 4pm-6pm and Wednesday 7pm-9pm. Plan Chemistry Module 8, Maths Extension 1 vectors and English essay practice.”</li>
                  <li><b>Study schedule prompt:</b> “Make a 7-day HSC plan. I can study weekdays 6:30pm-8pm and Sunday 10am-1pm.”</li>
                  <li><b>Flashcards prompt:</b> “Create flashcards for Chemistry Module 8: equilibrium, Ksp, galvanic cells and electrolysis.”</li>
                  <li><b>Flashcards prompt:</b> “Make Maths Extension 1 vector flashcards with formulas, common traps and exam-style checks.”</li>
                </ul>
              </section>
            </div>

            <div className="help-tips">
              <strong>Fast workflow:</strong> Import or create a PDF, pick Pen, write, tap Pen again to hide settings, use two fingers to move around, bookmark key pages in Contents, customise the theme in Settings if you want a different look, then Save PDF when finished.
            </div>
            <div className="help-actions">
              <button className="secondary-button" onClick={restartOnboarding}>Restart tutorial</button>
            </div>
          </div>
        </div>
      )}

      {contentsOpen && activeDoc && !isQuickNoteDoc(activeDoc) && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Bookmarks and table of contents" onClick={() => setContentsOpen(false)}>
          <div className="create-modal contents-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <span>Notebook navigation</span>
                <h2>Bookmarks and table of contents</h2>
                <p>Name pages, bookmark important spots, then jump straight to them later.</p>
              </div>
              <button className="modal-close" onClick={() => setContentsOpen(false)}>×</button>
            </div>
            <div className="contents-list">
              {activeDoc.pages.map((page, index) => (
                <article key={page.key} className="contents-row">
                  <button type="button" className="contents-jump" onClick={() => jumpToPageKey(page.key)}>Page {index + 1}</button>
                  <input
                    value={activeDoc.pageTitles?.[page.key] || ''}
                    onChange={(event) => updatePageTitle(page.key, event.target.value)}
                    placeholder={`Title for page ${index + 1}`}
                    aria-label={`Title for page ${index + 1}`}
                  />
                  <button
                    type="button"
                    className={`bookmark-toggle ${activeDoc.bookmarks?.[page.key] ? 'active' : ''}`}
                    onClick={() => togglePageBookmark(page.key)}
                    aria-pressed={Boolean(activeDoc.bookmarks?.[page.key])}
                    title={activeDoc.bookmarks?.[page.key] ? 'Remove bookmark' : 'Add bookmark'}
                  >★</button>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setSettingsOpen(false)}>
          <div className="create-modal settings-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <h2>Settings</h2>
                <p>Choose the note theme here. It stays out of the writing toolbar so the canvas stays clean.</p>
              </div>
              <button className="modal-close" onClick={() => setSettingsOpen(false)}>×</button>
            </div>

            <div className="settings-row">
              <div>
                <strong>App appearance</strong>
                <p>Dark mode changes the app frame, not the paper colour inside your notes.</p>
              </div>
              <button className="secondary-button" onClick={toggleUiMode}>{uiMode === 'dark' ? 'Use light mode' : 'Use dark mode'}</button>
            </div>

            <div className="settings-row accessibility-row">
              <div>
                <strong>Accessibility</strong>
                <p>Change button size for easier tapping on iPad or a denser desktop workspace.</p>
              </div>
              <div className="button-size-control" aria-label="Button size">
                <button type="button" className={buttonSizeMode === 'compact' ? 'active' : ''} onClick={() => setButtonSizeMode('compact')}>Compact</button>
                <button type="button" className={buttonSizeMode === 'standard' ? 'active' : ''} onClick={() => setButtonSizeMode('standard')}>Standard</button>
                <button type="button" className={buttonSizeMode === 'large' ? 'active' : ''} onClick={() => setButtonSizeMode('large')}>Large</button>
              </div>
            </div>


            <h3 className="section-title">Note colour theme</h3>
            <div className="modal-theme-grid">
              {themeOptions.map((theme) => (
                <button
                  key={theme.id}
                  className={`theme-card ${activeThemeId === theme.id ? 'active' : ''}`}
                  onClick={() => handleThemeChange(theme.id)}
                  style={{ background: theme.background, color: theme.text, borderColor: theme.accent }}
                >
                  <span className="theme-swatch" style={{ background: theme.accent }} />
                  <strong>{theme.name}</strong>
                  <small>{theme.description}</small>
                </button>
              ))}
            </div>

            <section className="custom-theme-builder">
              <div className="custom-theme-heading">
                <div>
                  <strong>Create your own background</strong>
                  <p>Pick colours manually, or upload an image and Dux Notes will pull out the main colours.</p>
                </div>
                <label className="image-theme-upload">
                  Upload image
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleCustomThemeImage} />
                </label>
              </div>

              <div className="custom-theme-form">
                <label>
                  Scheme name
                  <input value={customThemeName} onChange={(event) => setCustomThemeName(event.target.value)} placeholder="Beach study" />
                </label>
                <label>
                  Background
                  <input type="color" value={customThemeBackground} onChange={(event) => setCustomThemeBackground(event.target.value)} />
                </label>
                <label>
                  Accent
                  <input type="color" value={customThemeAccent} onChange={(event) => setCustomThemeAccent(event.target.value)} />
                </label>
                <label>
                  Text
                  <input type="color" value={customThemeText} onChange={(event) => setCustomThemeText(event.target.value)} />
                </label>
                <button className="primary-button" onClick={saveCustomThemeFromDraft}>Save scheme</button>
              </div>

              <div className="custom-theme-preview" style={{ background: customThemeBackground, color: customThemeText, borderColor: customThemeAccent }}>
                <span style={{ background: customThemeAccent }} />
                <strong>{customThemeName || 'Custom theme'}</strong>
                <small>This is how your saved scheme will feel.</small>
              </div>

              {imageThemeStatus && <p className="image-theme-status">{imageThemeStatus}</p>}
              {customThemes.length > 0 && (
                <div className="custom-theme-list">
                  {customThemes.map((theme) => (
                    <div key={theme.id} className="custom-theme-row">
                      <span style={{ background: theme.accent }} />
                      <strong>{theme.name}</strong>
                      <button className="secondary-button" onClick={() => handleThemeChange(theme.id)}>Use</button>
                      <button className="danger-button" onClick={() => deleteCustomTheme(theme.id)}>Delete</button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div className="modal-actions single">
              <button className="primary-button" onClick={() => setSettingsOpen(false)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {studyPlannerOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setStudyPlannerOpen(false)}>
          <div className={`create-modal study-modal ${aiPanelOpen ? 'ai-mode' : ''}`} onClick={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <h2>Study schedule</h2>
                <p>Plan study blocks, link them to a notebook, then open that note straight from the schedule.</p>
              </div>
              <button className="modal-close" onClick={() => setStudyPlannerOpen(false)}>×</button>
            </div>

            <div className="study-mode-switch">
              <button className={studyView === 'month' ? 'active' : ''} onClick={() => setStudyView('month')}>Month</button>
              <button className={studyView === 'week' ? 'active' : ''} onClick={() => setStudyView('week')}>Week</button>
              <button className={aiPanelOpen ? 'active ai-active' : ''} onClick={openAiGenerator}>✨ Free generator</button>
            </div>

            {aiSummary && <div className="ai-summary-banner">{aiSummary}</div>}

            {aiPanelOpen && (
              <section className="ai-generator-panel">
                <div className="ai-generator-heading">
                  <div>
                    <strong>Smart study schedule generator</strong>
                    <p>Describe your exams, available times, session length and breaks. Dux AI plans online when available; offline it now uses HSC-style revision cycles, active recall, past-paper drills and matching flashcard decks.</p>
                  </div>
                  <button className="ghost-button" onClick={() => setAiPanelOpen(false)}>Back to calendar</button>
                </div>

                <div className="ai-key-card">
                  <strong>Reads your actual time slots</strong>
                  <p>Give exact windows like Monday 4pm-6pm and Wednesday 7pm-9pm. The planner puts sessions inside those times.</p>
                </div>

                <label className="field-block">
                  What do you need planned?
                  <textarea
                    value={aiPrompt}
                    onChange={(event) => setAiPrompt(event.target.value)}
                    placeholder="I have Physics, Maths and Chemistry exams in 2 weeks. I can study 4pm to 6pm on weekdays and 10am to 1pm on weekends. Give me 45 minute sessions with 10 minute breaks."
                  />
                </label>

                <div className="field-grid ai-date-grid">
                  <label className="field-block">
                    Schedule start date
                    <input type="date" value={aiStartDate} onChange={(event) => setAiStartDate(event.target.value)} />
                  </label>
                  <label className="field-block">
                    Schedule end date
                    <input type="date" value={aiEndDate} onChange={(event) => setAiEndDate(event.target.value)} />
                  </label>
                </div>

                {aiError && <div className="ai-error">{aiError}</div>}
                <div className="modal-actions">
                  <button className="secondary-button" onClick={() => setAiPanelOpen(false)}>Cancel</button>
                  <button className="primary-button" onClick={generateScheduleWithAi} disabled={aiLoading}>
                    {aiLoading ? <span className="loading-spinner" /> : null}
                    {aiLoading ? 'Generating...' : 'Generate schedule'}
                  </button>
                </div>
              </section>
            )}

            <div className={`study-planner-shell ${studyView === 'week' ? 'week-layout' : ''}`}>
              <section className="study-calendar-panel">
                {studyView === 'month' ? (
                  <>
                    <div className="study-calendar-top">
                      <button className="ghost-button" onClick={() => setStudyMonth((value) => addMonths(value, -1))}>‹</button>
                      <strong>{monthLabel(studyMonth)}</strong>
                      <button className="ghost-button" onClick={() => setStudyMonth((value) => addMonths(value, 1))}>›</button>
                    </div>

                    <div className="study-calendar-grid" aria-label="Study calendar">
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day} className="study-weekday">{day}</span>)}
                      {getCalendarCells(studyMonth).map((cell) => {
                        const stats = studyStatsByDate[cell.iso];
                        const isToday = cell.iso === todayIsoDate();
                        const selected = cell.iso === selectedStudyDate;
                        const allDone = Boolean(stats?.total && stats.done === stats.total);
                        return (
                          <button
                            key={cell.iso}
                            className={`study-day ${cell.inMonth ? '' : 'muted'} ${selected ? 'selected' : ''} ${isToday ? 'today' : ''} ${allDone ? 'done-day' : ''}`}
                            onClick={() => selectStudyDate(cell.iso)}
                          >
                            <span>{cell.day}</span>
                            {stats?.total ? <b>{allDone ? '✓' : stats.total}</b> : null}
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="study-week-view">
                    <div className="study-calendar-top week-topbar">
                      <button className="ghost-button" onClick={() => { const d = toDateFromIso(selectedStudyDate); d.setDate(d.getDate() - 7); selectStudyDate(formatLocalIsoDate(d)); }}>‹</button>
                      <strong>Week of {formatScheduleDate(weekDates[0].iso)}</strong>
                      <button className="ghost-button" onClick={() => { const d = toDateFromIso(selectedStudyDate); d.setDate(d.getDate() + 7); selectStudyDate(formatLocalIsoDate(d)); }}>›</button>
                      <div className="week-zoom-controls" title="Zoom week calendar">
                        <button className="ghost-button" onClick={() => changeWeekZoom(-1)}>−</button>
                        <span>{getWeekZoomLabel(weekRowHeight)}</span>
                        <button className="ghost-button" onClick={() => changeWeekZoom(1)}>+</button>
                      </div>
                    </div>
                    <div className="week-grid precise-week-grid" ref={weekGridScrollRef} style={{ '--week-row-height': `${weekRowHeight}px` } as CSSProperties}>
                      <div className="week-corner" />
                      {weekDates.map((day) => (
                        <button key={day.iso} className={`week-day-head ${day.iso === selectedStudyDate ? 'selected' : ''}`} onClick={() => selectStudyDate(day.iso)}>
                          <span>{day.label}</span>
                          <b>{day.day}</b>
                        </button>
                      ))}
                      <div className="week-time-column">
                        {Array.from({ length: WEEK_END_HOUR - WEEK_START_HOUR + 1 }, (_, slot) => slot + WEEK_START_HOUR).map((hour) => (
                          <div key={hour} className="week-time-fixed">{formatHourLabel(hour)}</div>
                        ))}
                      </div>
                      {weekDates.map((day) => (
                        <div key={day.iso} className="week-day-column">
                          {Array.from({ length: WEEK_END_HOUR - WEEK_START_HOUR + 1 }, (_, slot) => slot + WEEK_START_HOUR).map((hour) => (
                            <div
                              key={`${day.iso}-${hour}`}
                              className="week-hour-row"
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={(event) => {
                                event.preventDefault();
                                const id = weekDragSessionIdRef.current || event.dataTransfer.getData('text/plain');
                                if (id) moveStudySessionToSlot(id, day.iso, hour);
                                weekDragSessionIdRef.current = null;
                              }}
                            />
                          ))}
                          {layoutOverlappingWeekItems(weekStudyItems.filter((item) => item.date === day.iso))
                            .map(({ item, column, columns }) => {
                              const visibleStart = WEEK_START_HOUR * 60;
                              const visibleEnd = (WEEK_END_HOUR + 1) * 60;
                              const startMin = clamp(timeToMinutes(item.startTime), visibleStart, visibleEnd);
                              const endMin = clamp(timeToMinutes(item.endTime), visibleStart, visibleEnd);
                              const safeEnd = Math.max(endMin, startMin + 15);
                              const top = ((startMin - visibleStart) / 60) * weekRowHeight;
                              const height = Math.max(24, ((safeEnd - startMin) / 60) * weekRowHeight);
                              const widthPct = 100 / columns;
                              const leftPct = widthPct * column;
                              return (
                                <button
                                  key={item.id}
                                  draggable
                                  className={`week-session-block precise ${item.completed ? 'completed' : ''} ${highlightedStudyIds.includes(item.id) ? 'fresh-ai' : ''}`}
                                  style={{ borderLeftColor: item.colour, top, height, left: `calc(${leftPct}% + 2px)`, width: `calc(${widthPct}% - 4px)` }}
                                  onDragStart={(event) => { weekDragSessionIdRef.current = item.id; event.dataTransfer.setData('text/plain', item.id); }}
                                  onClick={() => editStudySession(item)}
                                >
                                  <strong>{item.completed ? '✓ ' : ''}{item.title}{item.linkedDeck ? ' 🃏' : ''}</strong>
                                  <span>{formatTimeLabel(item.startTime)} to {formatTimeLabel(item.endTime)}</span>
                                </button>
                              );
                            })}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="upcoming-study-card">
                  <strong>Next study blocks</strong>
                  {upcomingStudyItems.length === 0 ? (
                    <p>No upcoming sessions yet. Add one on the right.</p>
                  ) : upcomingStudyItems.map((item) => (
                    <button key={item.id} className={`mini-study-row ${item.completed ? 'completed' : ''} ${highlightedStudyIds.includes(item.id) ? 'fresh-ai' : ''}`} onClick={() => editStudySession(item)}>
                      <span style={{ background: item.colour }} />
                      <b>{item.completed ? '✓ ' : ''}{item.title}{item.linkedDeck ? ' 🃏' : ''}</b>
                      <small>{formatScheduleDate(item.date)} · {formatTimeLabel(item.startTime)}</small>
                    </button>
                  ))}
                </div>
              </section>

              <section className="study-editor-panel">
                <div className="study-date-heading">
                  <div>
                    <span>Selected day</span>
                    <strong>{formatScheduleDate(selectedStudyDate)}</strong>
                  </div>
                  <div className="study-header-actions">
                    <button className="secondary-button" onClick={() => startNewStudySession(selectedStudyDate)}>New session</button>
                    <button className="danger-button subtle-danger" onClick={resetStudySchedule} disabled={studySchedule.length === 0}>Reset schedule</button>
                  </div>
                </div>

                <div className="study-day-list">
                  {studyItemsForSelectedDate.length === 0 ? (
                    <p className="empty-message">No sessions on this day yet.</p>
                  ) : studyItemsForSelectedDate.map((item) => (
                    <article key={item.id} className={`study-session-card ${item.completed ? 'completed' : ''} ${highlightedStudyIds.includes(item.id) ? 'fresh-ai' : ''}`} style={{ borderLeftColor: item.colour }}>
                      <button className="study-session-main" onClick={() => editStudySession(item)}>
                        <span className={`study-done-mark ${item.completed ? 'done' : ''}`}>{item.completed ? '✓' : ''}</span>
                        <div>
                          <strong>{item.title}</strong>
                          <small>{formatTimeLabel(item.startTime)} to {formatTimeLabel(item.endTime)}{item.subject ? ` · ${item.subject}` : ''}</small>
                          {item.linkedDocName && <em>Linked to {item.linkedDocName}</em>}
                          {item.linkedDeck && <em>🃏 {item.linkedDeck} flashcards</em>}
                        </div>
                      </button>
                      <div className="study-session-actions">
                        <button title="Mark done" onClick={() => toggleStudySessionDone(item.id)}>{item.completed ? '↺' : '✓'}</button>
                        {(item.linkedDocId || item.linkedDeck) && <button title="Open linked item" onClick={() => openStudyItemTarget(item)}>↗</button>}
                        <button title="Delete" className="danger-button" onClick={() => deleteStudySession(item.id)}>×</button>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="study-form-card">
                  <div className="study-form-title">
                    <strong>{editingScheduleId ? 'Edit study block' : 'Add study block'}</strong>
                    {editingScheduleId && <button className="ghost-button" onClick={() => startNewStudySession(selectedStudyDate)}>Cancel</button>}
                  </div>

                  <label className="field-block">
                    Title
                    <input value={studyDraft.title} onChange={(event) => updateStudyDraft({ title: event.target.value })} placeholder="e.g. Chemistry revision" />
                  </label>

                  <div className="field-grid compact">
                    <label className="field-block custom-date-field">
                      Date
                      <button type="button" className="date-picker-button" onClick={() => { setDatePickerOpen((open) => !open); setDatePickerMonth(toDateFromIso(studyDraft.date || selectedStudyDate)); }}>
                        {formatScheduleDate(studyDraft.date || selectedStudyDate)} <span>▾</span>
                      </button>
                      {datePickerOpen && (
                        <div className="date-picker-popover">
                          <div className="study-calendar-top compact-nav">
                            <button className="ghost-button" onClick={() => setDatePickerMonth((value) => addMonths(value, -1))}>‹</button>
                            <strong>{monthLabel(datePickerMonth)}</strong>
                            <button className="ghost-button" onClick={() => setDatePickerMonth((value) => addMonths(value, 1))}>›</button>
                          </div>
                          <div className="mini-date-grid">
                            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
                            {getCalendarCells(datePickerMonth).map((cell) => (
                              <button
                                key={cell.iso}
                                className={`${cell.inMonth ? '' : 'muted'} ${cell.iso === studyDraft.date ? 'selected' : ''}`}
                                onClick={() => chooseStudyDate(cell.iso)}
                              >{cell.day}</button>
                            ))}
                          </div>
                        </div>
                      )}
                    </label>
                    <label className="field-block">
                      Colour
                      <input type="color" value={studyDraft.colour} onChange={(event) => updateStudyDraft({ colour: event.target.value })} />
                    </label>
                  </div>

                  <div className="field-grid compact">
                    <label className="field-block">
                      Start
                      <input type="time" value={studyDraft.startTime} onChange={(event) => updateStudyDraft({ startTime: event.target.value })} />
                    </label>
                    <label className="field-block">
                      End
                      <input type="time" value={studyDraft.endTime} onChange={(event) => updateStudyDraft({ endTime: event.target.value })} />
                    </label>
                  </div>

                  <label className="field-block">
                    Subject or folder
                    <select
                      value={subjectMode || (subjectFolderOptions.includes(studyDraft.subject) ? studyDraft.subject : studyDraft.subject ? 'Other' : '')}
                      onChange={(event) => {
                        const value = event.target.value;
                        setSubjectMode(value);
                        if (value === 'Other') updateStudyDraft({ subject: '' });
                        else updateStudyDraft({ subject: value });
                      }}
                    >
                      <option value="">Choose a folder or subject</option>
                      {subjectFolderOptions.map((folder) => <option key={folder} value={folder}>{folder}</option>)}
                      <option value="Other">Other</option>
                    </select>
                  </label>
                  {(subjectMode === 'Other' || (!subjectFolderOptions.includes(studyDraft.subject) && studyDraft.subject)) && (
                    <label className="field-block compact-field">
                      Other subject
                      <input value={studyDraft.subject} onChange={(event) => updateStudyDraft({ subject: event.target.value })} placeholder="e.g. Physics prac" />
                    </label>
                  )}

                  <label className="field-block">
                    Notes
                    <textarea value={studyDraft.note} onChange={(event) => updateStudyDraft({ note: event.target.value })} placeholder="What exactly needs to be done?" />
                  </label>

                  <div className="linked-note-box">
                    <div>
                      <strong>Linked note</strong>
                      <p>{studyDraft.linkedDocName || 'No note linked yet.'}</p>
                      {studyDraft.linkedDocId && <button className="open-linked-note-button" onClick={() => void openLinkedStudyNote(studyDraft)}>Open note →</button>}
                    </div>
                    <div className="link-picker-wrap">
                      <button className="secondary-button" onClick={linkStudyDraftToCurrentNote}>Link note</button>
                      {studyDraft.linkedDocName && <button className="ghost-button" onClick={clearStudyDraftLink}>Remove link</button>}
                      {linkPickerOpen && (
                        <div className="link-picker-popover">
                          <input value={linkSearch} onChange={(event) => setLinkSearch(event.target.value)} placeholder="Search notes..." autoFocus />
                          <div className="link-picker-list">
                            {linkableDocuments.length === 0 ? <p>No matching notes.</p> : linkableDocuments.map((doc) => (
                              <button key={doc.id} onClick={() => linkScheduleToDocument(doc)}>
                                <strong>{doc.docKind === 'quick-note' || doc.tags?.includes('quick-note') ? '✏ ' : ''}{displayName(doc.name)}</strong>
                                <small>{doc.folder?.trim() || 'Unfiled'} · {doc.pages?.length || 0} pages</small>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <label className="field-block">
                    Linked flashcard deck
                    <select value={studyDraft.linkedDeck} onChange={(event) => updateStudyDraft({ linkedDeck: event.target.value })}>
                      <option value="">No flashcard deck</option>
                      {flashcardDeckNames.map((deck) => <option key={deck} value={deck}>{deck}</option>)}
                    </select>
                  </label>

                  <label className="study-checkbox">
                    <input type="checkbox" checked={studyDraft.completed} onChange={(event) => updateStudyDraft({ completed: event.target.checked })} />
                    Mark as done
                  </label>

                  <div className="modal-actions">
                    <button className="secondary-button" onClick={() => setStudyPlannerOpen(false)}>Close</button>
                    <button className="primary-button" onClick={saveStudySession}>{editingScheduleId ? 'Save changes' : 'Add to schedule'}</button>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {createDialogOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setCreateDialogOpen(false)}>
          <div className="create-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <h2>Create blank PDF</h2>
                <p>This creates usable blank pages now. Use Save PDF later to write the final file to your computer.</p>
              </div>
              <button className="modal-close" onClick={() => setCreateDialogOpen(false)}>×</button>
            </div>

            <label className="field-block">
              PDF name
              <input value={newNotebookName} onChange={(event) => setNewNotebookName(event.target.value)} placeholder="Study notes" />
            </label>

            <div className="field-grid">
              <label className="field-block">
                Pages
                <input type="number" min="1" max="100" value={newNotebookPages} onChange={(event) => setNewNotebookPages(Number(event.target.value))} />
              </label>
              <label className="field-block">
                Page style
                <select value={newNotebookTemplate} onChange={(event) => setNewNotebookTemplate(event.target.value as BlankPageTemplate)}>
                  <option value="ruled">Ruled</option>
                  <option value="plain">Plain</option>
                  <option value="cornell">Cornell notes</option>
                  <option value="grid">Grid</option>
                </select>
              </label>
            </div>

            <h3 className="section-title">Note colour theme</h3>
            <div className="modal-theme-grid">
              {themeOptions.map((theme) => (
                <button
                  key={theme.id}
                  className={`theme-card ${newNotebookThemeId === theme.id ? 'active' : ''}`}
                  onClick={() => setNewNotebookThemeId(theme.id)}
                  style={{ background: theme.background, color: theme.text, borderColor: theme.accent }}
                >
                  <span className="theme-swatch" style={{ background: theme.accent }} />
                  <strong>{theme.name}</strong>
                  <small>{theme.description}</small>
                </button>
              ))}
            </div>

            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setCreateDialogOpen(false)}>Cancel</button>
              <button type="button" className="primary-button" onClick={handleCreateNotebook}>Create PDF</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
