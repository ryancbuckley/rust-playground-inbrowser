import { PayloadAction, createSlice } from '@reduxjs/toolkit';

import {
  Edition,
  Editor,
  FileView,
  Mode,
  Orientation,
  PairCharacters,
  PrimaryAction,
  PrimaryActionAuto,
  Theme,
} from '../types';

interface State {
  fileView: FileView;
  fileViewAutomaticallyChangedFrom?: FileView;
  editor: Editor;
  ace: {
    keybinding: string;
    theme: string;
    pairCharacters: PairCharacters;
  };
  monaco: {
    theme: string;
  };
  theme: Theme;
  orientation: Orientation;
  primaryAction: PrimaryAction;
  mode: Mode;
  edition: Edition;
  /** Run the primary action again after every change. */
  autoRun: boolean;
  /** Stop programs that run longer, in seconds (0: no limit). Compiling has none. */
  runLimit: number;
  /** Add Clippy's lints to the compiler's warnings when running. */
  clippyOnRun: boolean;
}

const initialState: State = {
  fileView: FileView.Single,
  editor: Editor.Ace,
  ace: {
    keybinding: 'ace',
    theme: 'github',
    pairCharacters: PairCharacters.Enabled,
  },
  monaco: {
    theme: 'vs',
  },
  theme: Theme.System,
  orientation: Orientation.Automatic,
  primaryAction: PrimaryActionAuto.Auto,
  mode: Mode.Debug,
  edition: Edition.Rust2024,
  autoRun: true,
  runLimit: 10,
  clippyOnRun: true,
};

const slice = createSlice({
  name: 'configuration',
  initialState,
  reducers: {
    acknowledgeAutomaticFileView: (state) => {
      delete state.fileViewAutomaticallyChangedFrom;
    },

    changeAceTheme: (state, action: PayloadAction<string>) => {
      state.ace.theme = action.payload;
    },

    changeAutoRun: (state, action: PayloadAction<boolean>) => {
      state.autoRun = action.payload;
    },

    changeClippyOnRun: (state, action: PayloadAction<boolean>) => {
      state.clippyOnRun = action.payload;
    },

    changeEdition: (state, action: PayloadAction<Edition>) => {
      state.edition = action.payload;
    },

    changeEditor: (state, action: PayloadAction<Editor>) => {
      state.editor = action.payload;
    },

    changeFileView: (state, action: PayloadAction<FileView>) => {
      state.fileView = action.payload;
    },

    changeFileViewAutomatically: (state, action: PayloadAction<FileView>) => {
      if (state.fileView !== action.payload) {
        state.fileViewAutomaticallyChangedFrom = state.fileView;
      }
      state.fileView = action.payload;
    },

    changeKeybinding: (state, action: PayloadAction<string>) => {
      state.ace.keybinding = action.payload;
    },

    changeMode: (state, action: PayloadAction<Mode>) => {
      state.mode = action.payload;
    },

    changeMonacoTheme: (state, action: PayloadAction<string>) => {
      state.monaco.theme = action.payload;
    },

    changeTheme: (state, action: PayloadAction<Theme>) => {
      state.theme = action.payload;
    },

    changeOrientation: (state, action: PayloadAction<Orientation>) => {
      state.orientation = action.payload;
    },

    changePairCharacters: (state, action: PayloadAction<PairCharacters>) => {
      state.ace.pairCharacters = action.payload;
    },

    changePrimaryAction: (state, action: PayloadAction<PrimaryAction>) => {
      state.primaryAction = action.payload;
    },

    changeRunLimit: (state, action: PayloadAction<number>) => {
      state.runLimit = action.payload;
    },
  },
});

export const {
  acknowledgeAutomaticFileView,
  changeAceTheme,
  changeAutoRun,
  changeClippyOnRun,
  changeEdition,
  changeEditor,
  changeFileView,
  changeFileViewAutomatically,
  changeKeybinding,
  changeMode,
  changeMonacoTheme,
  changeTheme,
  changeOrientation,
  changePairCharacters,
  changePrimaryAction,
  changeRunLimit,
} = slice.actions;

export default slice.reducer;
