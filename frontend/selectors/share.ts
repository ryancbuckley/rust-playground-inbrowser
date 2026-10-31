import { createSelector } from '@reduxjs/toolkit';

import { baseUrlSelector, codeOrFilesSelector } from '.';
import { encodeFile } from '../domain/shareLink';
import { State } from '../reducers';

// A link to the playground with the code in it: nothing is saved anywhere.
// The multiple-file view's files are each a parameter of their own
// (domain/shareLink.ts), and open in that view.
export const codeUrlSelector = createSelector(
  baseUrlSelector,
  (state: State) => state.configuration.mode,
  (state: State) => state.configuration.edition,
  codeOrFilesSelector,
  (baseUrl, mode, edition, code) => {
    const u = new URL(baseUrl);
    const params = new URLSearchParams({ mode, edition });
    if (typeof code === 'string') {
      params.set('code', code);
    } else {
      for (const f of code) {
        params.append('file', encodeFile(f));
      }
    }
    u.search = params.toString();
    return u.href;
  },
);
