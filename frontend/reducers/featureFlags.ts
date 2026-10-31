import { createSlice } from '@reduxjs/toolkit';

interface State {
  forced: boolean;
  multifileThreshold: number;
}

const ENABLED = 1.0;
const DISABLED = -1.0;

const initialState: State = {
  forced: false,
  multifileThreshold: ENABLED,
};

// No server sends thresholds here: features are on unless ?features=false.
const slice = createSlice({
  name: 'featureFlags',
  initialState,
  reducers: {
    forceEnableAll: (state) => {
      state.forced = true;
      state.multifileThreshold = ENABLED;
    },
    forceDisableAll: (state) => {
      state.forced = true;
      state.multifileThreshold = DISABLED;
    },
  },
});

export const {
  forceEnableAll: featureFlagsForceEnableAll,
  forceDisableAll: featureFlagsForceDisableAll,
} = slice.actions;

export default slice.reducer;
