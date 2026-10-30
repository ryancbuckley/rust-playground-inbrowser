import { PayloadAction, createAsyncThunk, createSlice } from '@reduxjs/toolkit';

import * as toolchain from '../toolchain';
import { CratesStatus } from '../toolchain';
import { Crate } from '../types';

// The compiler in this browser (toolchain.ts), in place of the server's
// connection and versions.

interface State {
  status: string;
  ready: boolean;
  error?: string;
  version?: string;
  crates?: CratesStatus;
}

const initialState: State = {
  status: 'Loading the Rust toolchain…',
  ready: false,
};

export const performVersionLoad = createAsyncThunk('toolchain/version', toolchain.version);

const slice = createSlice({
  name: 'toolchain',
  initialState,
  reducers: {
    toolchainStatus: (state, action: PayloadAction<string>) => {
      state.status = action.payload;
    },
    toolchainReady: (state, _action: PayloadAction<Crate[]>) => {
      state.ready = true;
    },
    toolchainCrates: (state, action: PayloadAction<CratesStatus>) => {
      state.crates = action.payload;
    },
    toolchainError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(performVersionLoad.fulfilled, (state, action) => {
      state.version = action.payload;
    });
  },
});

export const { toolchainStatus, toolchainReady, toolchainCrates, toolchainError } = slice.actions;

export default slice.reducer;
