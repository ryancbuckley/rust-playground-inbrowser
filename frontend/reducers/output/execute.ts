import { Draft, PayloadAction, createSlice } from '@reduxjs/toolkit';

import { ThunkAction } from '../../actions';
import {
  currentExecutionSequenceNumberSelector,
  executeRequestPayloadSelector,
} from '../../selectors';
import * as toolchain from '../../toolchain';

const initialState: State = {
  requestsInProgress: 0,
};

interface State {
  sequenceNumber?: number;
  requestsInProgress: number;
  stdout?: string;
  stderr?: string;
  error?: string;
}

type SequencedAction<P> = PayloadAction<P, string, { sequenceNumber: number }>;

const withSequenceNumber = <P>(payload: P, sequenceNumber: number) => ({
  payload,
  meta: { sequenceNumber },
});

// Output of a run that has since been replaced is dropped.
const sequenceNumberMatches =
  <P>(whenMatch: (state: Draft<State>, payload: P) => void) =>
  (state: Draft<State>, action: SequencedAction<P>) => {
    if (action.meta.sequenceNumber === state.sequenceNumber) {
      whenMatch(state, action.payload);
    }
  };

const slice = createSlice({
  name: 'output/execute',
  initialState,
  reducers: {
    executeBegin: (state, action: PayloadAction<number>) => {
      state.sequenceNumber = action.payload;
      state.requestsInProgress = 1; // Only tracking one request
      state.stdout = '';
      state.stderr = '';
      delete state.error;
    },
    executeStdout: {
      reducer: sequenceNumberMatches<string>((state, payload) => {
        state.stdout += payload;
      }),
      prepare: withSequenceNumber<string>,
    },
    executeStderr: {
      reducer: sequenceNumberMatches<string>((state, payload) => {
        state.stderr += payload;
      }),
      prepare: withSequenceNumber<string>,
    },
    executeEnd: {
      reducer: sequenceNumberMatches<{ error?: string }>((state, payload) => {
        state.requestsInProgress = 0;
        delete state.sequenceNumber;
        if (payload.error) {
          state.error = payload.error;
        }
      }),
      prepare: withSequenceNumber<{ error?: string }>,
    },
  },
});

const { executeBegin, executeStdout, executeStderr, executeEnd } = slice.actions;

export { executeBegin };

const seconds = (ms: number) => `${(ms / 1000).toFixed(2)}s`;

/** Compile and run the code, replacing the run in progress. The compiler's
 *  steps are reported the way Cargo reports them. */
export const performCommonExecute =
  (crateType: string, tests: boolean): ThunkAction =>
  (dispatch, getState) => {
    const state = getState();
    const body = executeRequestPayloadSelector(state, { crateType, tests });

    const previous = currentExecutionSequenceNumberSelector(state);
    if (previous !== undefined) {
      toolchain.cancel(previous);
    }

    const profile =
      body.mode === 'release' ? '`release` profile [optimized]' : '`dev` profile [unoptimized]';
    const id = toolchain.run(body, {
      output: (stream, text) =>
        dispatch(stream === 'stdout' ? executeStdout(text, id) : executeStderr(text, id)),
      compiled: ({ code, ms, runs }) => {
        if (code === 0) {
          dispatch(executeStderr(`    Finished ${profile} target(s) in ${seconds(ms)}\n`, id));
        }
        if (runs) {
          dispatch(executeStderr(`     Running \`${tests ? 'tests' : 'playground'}\`\n`, id));
        } else {
          dispatch(executeEnd({}, id));
        }
      },
      exited: ({ code, ms, timedOut, cancelled }) => {
        let error;
        if (cancelled) {
          error = 'Stopped.';
        } else if (timedOut) {
          error = `Stopped at the run limit, after ${seconds(ms)}.`;
        } else if (code !== 0) {
          error = `Exited with status ${code}.`;
        }
        dispatch(executeEnd({ error }, id));
      },
      error: (text) => dispatch(executeEnd({ error: text }, id)),
    });

    dispatch(executeBegin(id));
    dispatch(executeStderr(`   Compiling playground (${tests ? 'tests' : crateType})\n`, id));
  };

/** Stop the run in progress. */
export const executeKillCurrent = (): ThunkAction => (_dispatch, getState) => {
  const sequenceNumber = currentExecutionSequenceNumberSelector(getState());
  if (sequenceNumber !== undefined) {
    toolchain.cancel(sequenceNumber);
  }
};

export default slice.reducer;
