import { combineReducers } from '@reduxjs/toolkit';

import clippy from './clippy';
import execute from './execute';
import format from './format';
import hir from './hir';
import macroExpansion from './macroExpansion';
import meta from './meta';
import mir from './mir';

const output = combineReducers({
  meta,
  format,
  clippy,
  macroExpansion,
  mir,
  hir,
  execute,
});

export default output;
