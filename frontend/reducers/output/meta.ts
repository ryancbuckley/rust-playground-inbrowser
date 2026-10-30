import { PayloadAction, createSlice } from '@reduxjs/toolkit';

import { Focus } from '../../types';
import { performClippy } from './clippy';
import { executeBegin } from './execute';
import { performFormat } from './format';
import { performCompileHir } from './hir';
import { performMacroExpansion } from './macroExpansion';
import { performCompileMir } from './mir';

const initialState: State = {};

interface State {
  focus?: Focus;
}

const slice = createSlice({
  name: 'output/meta',
  initialState,
  reducers: {
    changeFocus: (state, action: PayloadAction<Focus | undefined>) => {
      state.focus = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(performClippy.pending, (state) => {
        state.focus = Focus.Clippy;
      })

      .addCase(performMacroExpansion.pending, (state) => {
        state.focus = Focus.MacroExpansion;
      })

      .addCase(executeBegin, (state) => {
        state.focus = Focus.Execute;
      })

      .addCase(performCompileHir.pending, (state) => {
        state.focus = Focus.Hir;
      })

      .addCase(performCompileMir.pending, (state) => {
        state.focus = Focus.Mir;
      })

      .addCase(performFormat.pending, (state) => {
        state.focus = Focus.Format;
      })

      .addCase(performFormat.fulfilled, (state, action) => {
        if (action.payload.success) {
          state.focus = undefined;
        }
      });
  },
});

export const { changeFocus } = slice.actions;

export default slice.reducer;
