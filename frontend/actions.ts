import { ThunkAction as ReduxThunkAction, UnknownAction } from '@reduxjs/toolkit';

import { SharedFile } from './domain/shareLink';
import { State } from './reducers';
import { editSingleCode } from './reducers/code';
import {
  changeEdition,
  changeFileView,
  changeFileViewAutomatically,
  changeMode,
  changePrimaryAction,
} from './reducers/configuration';
import * as files from './reducers/files';
import { seenMultipleFiles } from './reducers/notifications';
import { performCommonExecute } from './reducers/output/execute';
import { performCompileToHirOnly } from './reducers/output/hir';
import { performCompileToMirOnly } from './reducers/output/mir';
import { navigateToHelp, navigateToIndex } from './reducers/page';
import {
  activeFileHasMainFunctionSelector,
  allowMultipleFiles,
  getCrateType,
  linearCodeSelector,
  linearizeCode,
  runAsTest,
} from './selectors';
import {
  Edition,
  FileView,
  Mode,
  PrimaryAction,
  PrimaryActionAuto,
  PrimaryActionCore,
  parseEdition,
  parseMode,
} from './types';

export type ThunkAction<T = void> = ReduxThunkAction<T, State, unknown, UnknownAction>;

export const editCode =
  (code: string): ThunkAction =>
  (dispatch, getState) => {
    const state = getState();
    if (state.configuration.fileView === FileView.Single) {
      dispatch(editSingleCode(code));
    } else {
      dispatch(files.editActiveFile(code));
    }
  };

function performAutoOnly(): ThunkAction {
  return function (dispatch, getState) {
    const state = getState();
    const crateType = getCrateType(state);
    const tests = runAsTest(state);

    return dispatch(performCommonExecute(crateType, tests));
  };
}

const performExecuteOnly = (): ThunkAction => performCommonExecute('bin', false);
const performCompileOnly = (): ThunkAction => performCommonExecute('lib', false);
const performTestOnly = (): ThunkAction => (dispatch, getState) => {
  const state = getState();
  const crateType = getCrateType(state);
  return dispatch(performCommonExecute(crateType, true));
};

const PRIMARY_ACTIONS: { [index in PrimaryAction]: () => ThunkAction } = {
  [PrimaryActionCore.Compile]: performCompileOnly,
  [PrimaryActionCore.Execute]: performExecuteOnly,
  [PrimaryActionCore.Test]: performTestOnly,
  [PrimaryActionAuto.Auto]: performAutoOnly,
  [PrimaryActionCore.Hir]: performCompileToHirOnly,
  [PrimaryActionCore.Mir]: performCompileToMirOnly,
};

export const performPrimaryAction = (): ThunkAction => (dispatch, getState) => {
  const state = getState();
  const primaryAction = PRIMARY_ACTIONS[state.configuration.primaryAction];
  dispatch(primaryAction());
};

const performAndSwitchPrimaryAction =
  (inner: () => ThunkAction, id: PrimaryAction) => (): ThunkAction => (dispatch) => {
    dispatch(changePrimaryAction(id));
    dispatch(inner());
  };

export const performExecute = performAndSwitchPrimaryAction(
  performExecuteOnly,
  PrimaryActionCore.Execute,
);
export const performCompile = performAndSwitchPrimaryAction(
  performCompileOnly,
  PrimaryActionCore.Compile,
);
export const performTest = performAndSwitchPrimaryAction(performTestOnly, PrimaryActionCore.Test);
export const performCompileToMir = performAndSwitchPrimaryAction(
  performCompileToMirOnly,
  PrimaryActionCore.Mir,
);
export const performCompileToHir = performAndSwitchPrimaryAction(
  performCompileToHirOnly,
  PrimaryActionCore.Hir,
);

export function indexPageLoad({
  code,
  files: sharedFiles = [],
  mode: modeString,
  edition: editionString,
}: {
  code?: string;
  files?: SharedFile[];
  mode?: string;
  edition?: string;
}): ThunkAction {
  return function (dispatch, getState) {
    const mode = parseMode(modeString) || Mode.Debug;
    let maybeEdition = parseEdition(editionString);

    dispatch(navigateToIndex());

    if (code) {
      // We need to ensure that any links that predate the existence
      // of editions will *forever* pick 2015. However, if we aren't
      // loading code, then allow the edition to remain the default.
      if (!maybeEdition) {
        maybeEdition = Edition.Rust2015;
      }
    }

    const edition = maybeEdition || Edition.Rust2024;

    if (sharedFiles.length > 0) {
      // A link from the multiple-file view opens in it, or as one file
      // where that view is turned off (?features=false).
      if (allowMultipleFiles(getState())) {
        // Without a notice: the files are what the link is for, and the
        // view shows them as they were shared. (Nor the one offering to
        // stay in single file mode.)
        dispatch(changeFileView(FileView.Multiple));
        dispatch(files.initializeWithFiles(sharedFiles));
        dispatch(seenMultipleFiles());
      } else {
        dispatch(changeFileViewAutomatically(FileView.Single));
        dispatch(editCode(linearizeCode(sharedFiles)));
      }
    } else if (code) {
      dispatch(changeFileViewAutomatically(FileView.Single));
      dispatch(editCode(code));
    }

    dispatch(changeMode(mode));
    dispatch(changeEdition(edition));
  };
}

export const helpPageLoad = navigateToHelp;

export function showExample(code: string): ThunkAction {
  return function (dispatch) {
    dispatch(navigateToIndex());
    dispatch(changeMode(Mode.Debug));
    dispatch(changeEdition(Edition.Rust2024));
    dispatch(editCode(code));
  };
}

export function preserveContentAndChangeFileView(fv: FileView): ThunkAction {
  return function (dispatch, getState) {
    const state = getState();
    dispatch(changeFileView(fv));
    if (fv === FileView.Single) {
      const code = linearCodeSelector(state);
      dispatch(files.deleteAll());
      dispatch(editSingleCode(code));
    } else {
      const content = state.code;
      const hasMain = activeFileHasMainFunctionSelector(state);
      const name = hasMain ? 'src/main.rs' : 'src/lib.rs';
      dispatch(files.initializeWith({ name, content }));
    }
  };
}
