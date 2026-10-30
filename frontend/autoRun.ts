import { createListenerMiddleware } from '@reduxjs/toolkit';

import { performPrimaryAction } from './actions';
import { AppDispatch } from './configureStore';
import { State } from './reducers';
import { updateAnalysis } from './reducers/codeAnalysis';
import { changeAutoRun } from './reducers/configuration';
import { toolchainReady } from './reducers/toolchain';

export const autoRun = createListenerMiddleware();

const startAppListening = autoRun.startListening.withTypes<State, AppDispatch>();

const configurationChanged = (current: State, previous: State) =>
  current.configuration.mode !== previous.configuration.mode ||
  current.configuration.edition !== previous.configuration.edition ||
  current.configuration.clippyOnRun !== previous.configuration.clippyOnRun;

// With auto-run on, perform the primary action again after every change:
// once the code has been analyzed (which decides between running, building
// and testing), or the build configuration has changed. And once when the
// toolchain is ready. A new run replaces the one in progress.
startAppListening({
  predicate: (action, current, previous) =>
    current.configuration.autoRun &&
    current.toolchain.ready &&
    current.page === 'index' &&
    (updateAnalysis.match(action) ||
      toolchainReady.match(action) ||
      changeAutoRun.match(action) ||
      configurationChanged(current, previous)),

  effect: (_action, listenerApi) => {
    listenerApi.dispatch(performPrimaryAction());
  },
});
