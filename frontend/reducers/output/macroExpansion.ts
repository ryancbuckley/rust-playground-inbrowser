import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

import { State as RootState } from '../../reducers';
import { macroExpansionRequestSelector } from '../../selectors';
import { compile } from '../../toolchain';

const sliceName = 'output/macroExpansion';

const initialState: State = {
  requestsInProgress: 0,
};

interface State {
  requestsInProgress: number;
  stdout?: string;
  stderr?: string;
  error?: string;
}

// The expanded code is rustc's -Zunpretty=expanded, shown as the output.
export const performMacroExpansion = createAsyncThunk<
  { success: boolean; stdout: string; stderr: string },
  void,
  { state: RootState }
>(sliceName, async (_arg: void, { getState, signal }) => {
  const result = await compile(
    { ...macroExpansionRequestSelector(getState()), emit: 'expanded' },
    signal,
  );
  return { success: result.success, stdout: result.code, stderr: result.stderr };
});

const slice = createSlice({
  name: sliceName,
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(performMacroExpansion.pending, (state) => {
        state.requestsInProgress += 1;
      })
      .addCase(performMacroExpansion.fulfilled, (state, action) => {
        state.requestsInProgress -= 1;
        Object.assign(state, action.payload);
        delete state.error;
      })
      .addCase(performMacroExpansion.rejected, (state, action) => {
        state.requestsInProgress -= 1;
        state.error = action.error.message;
      });
  },
});

export default slice.reducer;
