import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

import { State as RootState } from '../../reducers';
import { formatRequestSelector } from '../../selectors';
import { FormatResult, format } from '../../toolchain';

const sliceName = 'output/format';

const initialState: State = {
  requestsInProgress: 0,
};

interface State {
  requestsInProgress: number;
  stdout?: string;
  stderr?: string;
  error?: string;
}

// rustfmt is built into rustc.wasm.
export const performFormat = createAsyncThunk<FormatResult, void, { state: RootState }>(
  sliceName,
  (_arg: void, { getState, signal }) => format(formatRequestSelector(getState()), signal),
);

const slice = createSlice({
  name: sliceName,
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(performFormat.pending, (state) => {
        state.requestsInProgress += 1;
      })
      .addCase(performFormat.fulfilled, (state, action) => {
        state.requestsInProgress -= 1;
        const { stdout, stderr } = action.payload;
        Object.assign(state, { stdout, stderr });
        delete state.error;
      })
      .addCase(performFormat.rejected, (state, action) => {
        state.requestsInProgress -= 1;
        state.error = action.error.message;
      });
  },
});

export default slice.reducer;
