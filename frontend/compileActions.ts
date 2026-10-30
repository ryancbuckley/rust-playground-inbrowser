import { AsyncThunk, createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkAction } from './actions';
import { compileRequestPayloadSelector } from './selectors';
import { CompileResult, Emit, RunRequest, compile } from './toolchain';

type CompileRequestBody = RunRequest;

interface Props {
  sliceName: string;
  target: Emit;
}

interface CompileActions {
  action: AsyncThunk<CompileResult, CompileRequestBody, object>;
  performCompile: (overrides?: Partial<CompileRequestBody>) => ThunkAction;
}

export const makeCompileActions = ({ sliceName, target }: Props): CompileActions => {
  const action = createAsyncThunk(sliceName, (payload: CompileRequestBody, { signal }) =>
    compile(payload, signal),
  );

  // A new request replaces the one in progress, which is cancelled.
  let inProgress: { abort: () => void } | undefined;

  const performCompile =
    (overrides?: Partial<CompileRequestBody>): ThunkAction =>
    (dispatch, getState) => {
      const state = getState();
      const defaultBody = compileRequestPayloadSelector(state, { target });
      const body = { ...defaultBody, ...overrides };
      inProgress?.abort();
      inProgress = dispatch(action(body));
    };

  return { action, performCompile };
};
