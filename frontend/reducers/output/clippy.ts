import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

import { State as RootState } from '../../reducers';
import { clippyRequestSelector } from '../../selectors';
import { CompileResult, compile } from '../../toolchain';

const sliceName = 'output/clippy';

const initialState: State = {
  requestsInProgress: 0,
};

interface State {
  requestsInProgress: number;
  stdout?: string;
  stderr?: string;
  error?: string;
}

// Clippy is built into rustc.wasm: it checks the crate with Clippy's lints.
export const performClippy = createAsyncThunk<CompileResult, void, { state: RootState }>(
  sliceName,
  (_arg: void, { getState, signal }) =>
    compile({ ...clippyRequestSelector(getState()), emit: 'metadata', clippy: true }, signal),
);

const slice = createSlice({
  name: sliceName,
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(performClippy.pending, (state) => {
        state.requestsInProgress += 1;
      })
      .addCase(performClippy.fulfilled, (state, action) => {
        state.requestsInProgress -= 1;
        const { stdout, stderr } = action.payload;
        Object.assign(state, { stdout, stderr });
        delete state.error;
      })
      .addCase(performClippy.rejected, (state, action) => {
        state.requestsInProgress -= 1;
        state.error = action.error.message;
      });
  },
});

export default slice.reducer;
