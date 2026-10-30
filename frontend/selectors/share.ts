import { createSelector } from '@reduxjs/toolkit';

import { baseUrlSelector, linearCodeSelector } from '.';
import { State } from '../reducers';

// A link to the playground with the code in it: nothing is saved anywhere.
export const codeUrlSelector = createSelector(
  baseUrlSelector,
  (state: State) => state.configuration.mode,
  (state: State) => state.configuration.edition,
  linearCodeSelector,
  (baseUrl, mode, edition, code) => {
    const u = new URL(baseUrl);
    u.search = new URLSearchParams({ mode, edition, code }).toString();
    return u.href;
  },
);
