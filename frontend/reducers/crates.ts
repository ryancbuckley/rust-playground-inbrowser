import { createSlice } from '@reduxjs/toolkit';
import { sortBy } from 'lodash-es';

import { Crate } from '../types';
import { toolchainReady } from './toolchain';

const sliceName = 'crates';

const initialState: State = [];

type State = Crate[];

// The prebuilt crates programs can use, which the toolchain names when it
// is ready.
const slice = createSlice({
  name: sliceName,
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(toolchainReady, (_state, action) => sortBy(action.payload, (c) => c.id));
  },
});

export default slice.reducer;
