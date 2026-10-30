import * as z from 'zod';

type ValuesOf<T> = T[keyof T];

export type Page = 'index' | 'help';

export interface Position {
  line: number;
  column: number;
}

export const makePosition = (line: string | number, column: string | number): Position => ({
  line: +line,
  column: +column,
});

export interface Selection {
  start?: Position;
  end?: Position;
}

export const Crate = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
});

export type Crate = z.infer<typeof Crate>;

const CodeFile = z.object({ name: z.string(), content: z.string() });
type CodeFile = z.infer<typeof CodeFile>;

export const Code = z.string().or(z.array(CodeFile));
export type Code = z.infer<typeof Code>;

export type FileId = number;

export interface CommonEditorProps {
  code: string;
  execute: () => void;
  onEditCode: (_: string) => void;
  position: Position;
  selection: Selection;
  crates: Crate[];
  activeFileId: FileId;
  fileIds: FileId[];
}

export const FileView = {
  Single: 'single',
  Multiple: 'multiple',
} as const;
export type FileView = ValuesOf<typeof FileView>;
export const FileViewSchema = z.enum(Object.values(FileView));

export const Editor = {
  Simple: 'simple',
  Ace: 'ace',
  Monaco: 'monaco',
} as const;
export type Editor = ValuesOf<typeof Editor>;
export const EditorSchema = z.enum(Object.values(Editor));

export const PairCharacters = {
  Enabled: 'enabled',
  Disabled: 'disabled',
} as const;
export type PairCharacters = ValuesOf<typeof PairCharacters>;
export const PairCharactersSchema = z.enum(Object.values(PairCharacters));

export const Orientation = {
  Automatic: 'automatic',
  Horizontal: 'horizontal',
  Vertical: 'vertical',
} as const;
export type Orientation = ValuesOf<typeof Orientation>;
export const OrientationSchema = z.enum(Object.values(Orientation));

export const Theme = {
  Light: 'light',
  Dark: 'dark',
  System: 'system',
} as const;
export type Theme = ValuesOf<typeof Theme>;
export const ThemeSchema = z.enum(Object.values(Theme));

export const PrimaryActionAuto = {
  Auto: 'auto',
} as const;
export type PrimaryActionAuto = ValuesOf<typeof PrimaryActionAuto>;

export const PrimaryActionCore = {
  Compile: 'compile',
  Execute: 'execute',
  Hir: 'hir',
  Mir: 'mir',
  Test: 'test',
} as const;
export type PrimaryActionCore = ValuesOf<typeof PrimaryActionCore>;

export const PrimaryAction = { ...PrimaryActionAuto, ...PrimaryActionCore };
export type PrimaryAction = ValuesOf<typeof PrimaryAction>;
export const PrimaryActionSchema = z.enum(Object.values(PrimaryAction));

export const Mode = {
  Debug: 'debug',
  Release: 'release',
} as const;
export type Mode = ValuesOf<typeof Mode>;
const ModeSchema = z.enum(Object.values(Mode));

export function parseMode(s?: string): Mode | null {
  const p = ModeSchema.safeParse(s);
  return p.success ? p.data : null;
}

export const Edition = {
  Rust2015: '2015',
  Rust2018: '2018',
  Rust2021: '2021',
  Rust2024: '2024',
} as const;
export type Edition = ValuesOf<typeof Edition>;
const EditionSchema = z.enum(Object.values(Edition));

export function parseEdition(s?: string): Edition | null {
  const p = EditionSchema.safeParse(s);
  return p.success ? p.data : null;
}

export const Focus = {
  Clippy: 'clippy',
  MacroExpansion: 'macro-expansion',
  Mir: 'mir',
  Hir: 'hir',
  Execute: 'execute',
  Format: 'format',
  Share: 'share',
} as const;
export type Focus = ValuesOf<typeof Focus>;

export const Notification = {
  MultipleFiles: 'multiple-files',
} as const;
export type Notification = ValuesOf<typeof Notification>;
