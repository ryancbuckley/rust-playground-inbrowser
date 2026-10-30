import { createSelector } from '@reduxjs/toolkit';

import { State } from '../reducers';
import {
  Edition,
  Focus,
  Orientation,
  PrimaryActionAuto,
  PrimaryActionCore,
  FileView,
  Code,
} from '../types';
import { Emit } from '../toolchain';

const MS_PER_S = 1000;

const featureFlags = (state: State) => state.featureFlags;
const clientFeatureFlagThreshold = (state: State) => state.client.featureFlagThreshold;

const createFeatureFlagSelector = (ff: (state: State) => number) =>
  createSelector(clientFeatureFlagThreshold, ff, (c, ff) => c <= ff);

const allowMultipleFilesThreshold = createSelector(featureFlags, ff => ff.multifileThreshold);
export const allowMultipleFiles = createFeatureFlagSelector(allowMultipleFilesThreshold);

const codeSelector = (state: State) => state.code;
const filesSelector = (state: State) => state.files.files;
const filesActiveSelector = (state: State) => state.files.active;

const multifileEnabledSelector = createSelector(
  allowMultipleFiles,
  (state: State) => state.configuration.fileView,
  (allowed, selected) => allowed && selected === FileView.Multiple,
);

export const codeOrFilesSelector = createSelector(
  multifileEnabledSelector,
  codeSelector,
  filesSelector,
  (multifileEnabled, single, multiple) => {
    if (multifileEnabled) {
      return multiple;
    } else {
      return single;
    }
  }
);

export const linearizeCode = (code: Code) => {
  if (typeof code === 'string') {
    return code;
  } else {
    const f = [...code];
    f.sort((a, b) => a.name.localeCompare(b.name));
    return f.reduce((acc, f) => acc + `// ${f.name}` + '\n\n' + f.content + '\n', '');
  }
};

export const linearCodeSelector = createSelector(codeOrFilesSelector, linearizeCode);

export const activeCodeSelector = createSelector(
  multifileEnabledSelector,
  codeSelector,
  filesActiveSelector,
  filesSelector,
  (multifileEnabled, code, activeFile, files) => {
    if (multifileEnabled) {
      return files.find((f) => f.id === activeFile)?.content;
    } else {
      return code;
    }
  }
);

export const SINGLE_FILE_ID = -1;

export const activeFileIdSelector = createSelector(
  multifileEnabledSelector,
  filesActiveSelector,
  (multifileEnabled, active) => {
    if (multifileEnabled) {
      return active;
    } else {
      return SINGLE_FILE_ID;
    }
  }
);

export const fileIdsSelector = createSelector(
  multifileEnabledSelector,
  filesSelector,
  (multifileEnabled, files) => {
    if (multifileEnabled) {
      return files.map((f) => f.id)
    } else {
      return [SINGLE_FILE_ID]
    }
  }
)

export const positionSelector = (state: State) => state.position;
export const selectionSelector = (state: State) => state.selection;

const analysisSelector = (state: State) => state.codeAnalysis;

const hasTestsSelector = createSelector(
  fileIdsSelector,
  analysisSelector,
  (fileIds, as) => fileIds.some((id) => as[id]?.hasTests),
);

export const activeFileHasMainFunctionSelector = createSelector(
  activeFileIdSelector,
  analysisSelector,
  (id, as) => {
    if (id === null) { return false }
    return as[id]?.hasMain ?? false;
  }
)

const hasMainFunctionSelector = createSelector(
  multifileEnabledSelector,
  activeFileHasMainFunctionSelector,
  filesSelector,
  (multifileEnabled, activeHasMain, files) => {
    if (multifileEnabled) {
      return files.some((f) => f.name === 'src/main.rs');
    } else {
      return activeHasMain;
    }
  }
);

const crateTypeSelector = createSelector(
  multifileEnabledSelector,
  analysisSelector,
  filesSelector,
  (multifileEnabled, as, files) => {
    if (multifileEnabled) {
      const file = files.find((f) => f.name === 'src/lib.rs');
      if (!file) { return undefined; }
      return as[file.id]?.crateType;
    } else {
      return as[SINGLE_FILE_ID]?.crateType;
    }
  }
);

const autoPrimaryActionSelector = createSelector(
  crateTypeSelector,
  hasTestsSelector,
  hasMainFunctionSelector,
  (crateType, hasTests, hasMainFunction) => {
    if (crateType && crateType !== 'proc-macro') {
      if (crateType === 'bin') {
        return PrimaryActionCore.Execute;
      } else {
        return PrimaryActionCore.Compile;
      }
    } else {
      if (hasTests) {
        return PrimaryActionCore.Test;
      } else if (hasMainFunction) {
        return PrimaryActionCore.Execute;
      } else {
        return PrimaryActionCore.Compile;
      }
    }
  },
);

export const runAsTest = createSelector(
  autoPrimaryActionSelector,
  primaryAction => primaryAction === PrimaryActionCore.Test,
);

export const getCrateType = createSelector(
  crateTypeSelector,
  autoPrimaryActionSelector,
  (crateType, primaryAction) => {
    if (crateType) {
      return crateType;
    } else if (primaryAction === PrimaryActionCore.Execute) {
      return 'bin';
    } else {
      return 'lib';
    }
  },
);

const rawPrimaryActionSelector = (state: State) => state.configuration.primaryAction;

export const isAutoBuildSelector = createSelector(
  rawPrimaryActionSelector,
  autoPrimaryActionSelector,
  (primaryAction, autoPrimaryAction) => (
    primaryAction === PrimaryActionAuto.Auto && autoPrimaryAction === PrimaryActionCore.Compile
  ),
);

const primaryActionSelector = createSelector(
  rawPrimaryActionSelector,
  autoPrimaryActionSelector,
  (primaryAction, autoPrimaryAction): PrimaryActionCore => (
    primaryAction === PrimaryActionAuto.Auto ? autoPrimaryAction : primaryAction
  ),
);

const LABELS: { [index in PrimaryActionCore]: string } = {
  [PrimaryActionCore.Compile]: 'Build',
  [PrimaryActionCore.Execute]: 'Run',
  [PrimaryActionCore.Hir]: 'Show HIR',
  [PrimaryActionCore.Mir]: 'Show MIR',
  [PrimaryActionCore.Test]: 'Test',
};

export const getExecutionLabel = createSelector(primaryActionSelector, primaryAction => LABELS[primaryAction]);

export const toolchainVersionText = (state: State) => state.toolchain.version ?? 'nightly';

const editionSelector = (state: State) => state.configuration.edition;

export const getModeLabel = (state: State) => {
  const { configuration: { mode } } = state;
  return `${mode}`;
};

export const isEditionDefault = createSelector(
  editionSelector,
  edition => edition === Edition.Rust2024,
);

const isAutoRunDefault = (state: State) => state.configuration.autoRun;
const isRunLimitDefault = (state: State) => state.configuration.runLimit === 10;
const isClippyOnRunDefault = (state: State) => state.configuration.clippyOnRun;

export const getAdvancedOptionsSet = createSelector(
  isEditionDefault, isAutoRunDefault, isRunLimitDefault, isClippyOnRunDefault,
  (...areDefault) => !areDefault.every(n => n),
);

export const hasProperties = (obj: object) => Object.values(obj).some(val => !!val);

const getOutputs = createSelector(
  (state: State) => state,
  (state) => [
    state.output.clippy,
    state.output.execute,
    state.output.format,
    state.output.mir,
    state.output.hir,
    state.output.macroExpansion,
  ],
);

// The Share tab has nothing to load, so it shows when it has the focus.
export const getSomethingToShow = createSelector(
  getOutputs,
  (state: State) => state.output.meta.focus,
  (a, focus) => focus === Focus.Share || a.some(hasProperties),
);

export const baseUrlSelector = (state: State) =>
  state.globalConfiguration.baseUrl;

export const currentExecutionSequenceNumberSelector = (state: State) =>
  state.output.execute.sequenceNumber;

export const isExecutingSelector = (state: State) =>
  state.output.execute.requestsInProgress > 0;

const oldConfigurationThresholdSSelector = (state: State) =>
  state.globalConfiguration.oldConfigurationThresholdS;

const oldConfigurationThresholdMsSelector = createSelector(
  oldConfigurationThresholdSSelector,
  (t) => t * MS_PER_S,
);

export const resetConfigurationSelector = (state: State) => state.client.showConfigReset;

const parseMaybeISO = (s?: string): Date | undefined => {
  if (!s) {
    return undefined;
  }
  try {
    return new Date(s);
  } catch {
    return undefined;
  }
};

const lastVisitStrSelector = (state: State) => state.client.lastVisitedAt;
const currVisitStrSelector = (state: State) => state.client.visitedAt;

const lastVisitSelector = createSelector(lastVisitStrSelector, parseMaybeISO);
const currVisitSelector = createSelector(currVisitStrSelector, parseMaybeISO);

export const resetOldConfigurationSelector = createSelector(
  lastVisitSelector,
  currVisitSelector,
  oldConfigurationThresholdMsSelector,
  (last, current, thresholdMs) => {
    if (last && current) {
      const deltaTimeMs = current.getTime() - last.getTime();
      return deltaTimeMs > thresholdMs;
    } else {
      return false;
    }
  }
);

const notificationsSelector = (state: State) => state.notifications;

export const showMultipleFilesSelector = createSelector(
  allowMultipleFiles,
  notificationsSelector,
  (allowed, notifications) => allowed && !notifications.seenMultipleFiles,
);

const fileModeAutomaticallyChangedSelector = createSelector(
  (state: State) => state.configuration.fileViewAutomaticallyChangedFrom,
  (state: State) => state.configuration.fileView,
  (previous, current) => previous !== undefined && previous !== current,
)

export const anyNotificationsToShowSelector = createSelector(
  showMultipleFilesSelector,
  resetConfigurationSelector,
  resetOldConfigurationSelector,
  fileModeAutomaticallyChangedSelector,
  (...allNotifications) => allNotifications.some(n => n),
);

const modeSelector = (state: State) => state.configuration.mode;

export const clippyRequestSelector = createSelector(
  modeSelector,
  getCrateType,
  editionSelector,
  runAsTest,
  codeOrFilesSelector,
  (mode, crateType, edition, tests, code) => ({ mode, crateType, edition, tests, code }),
);

export const formatRequestSelector = createSelector(
  editionSelector,
  codeOrFilesSelector,
  (edition, code) => ({ edition, code }),
);

export const macroExpansionRequestSelector = createSelector(
  modeSelector,
  getCrateType,
  editionSelector,
  runAsTest,
  codeOrFilesSelector,
  (mode, crateType, edition, tests, code) => ({ mode, crateType, edition, tests, code })
);

const focus = (state: State) => state.output.meta.focus;
export const isOutputFocused = createSelector(
  focus,
  (focus) => !!focus,
);

const orientationConfig = (state: State) => state.configuration.orientation;
const browserWidthIsSmall = (state: State) => state.browser.isSmall;

export const orientation = createSelector(
  orientationConfig,
  browserWidthIsSmall,
  (orientation, widthIsSmall) => {
    if (orientation == Orientation.Automatic) {
      if (widthIsSmall) { return Orientation.Horizontal } else { return Orientation.Vertical }
    } else {
      return orientation;
    }
  }
)

const aceConfig = (s: State) => s.configuration.ace;
export const aceKeybinding = createSelector(aceConfig, c => c.keybinding);
export const acePairCharacters = createSelector(aceConfig, c => c.pairCharacters);
export const aceTheme = createSelector(aceConfig, c => c.theme);

export const offerCrateAutocompleteOnUse = createSelector(
  editionSelector,
  (edition) => edition !== Edition.Rust2015,
);

export const executeRequestPayloadSelector = createSelector(
  codeOrFilesSelector,
  (state: State) => state.configuration,
  (_state: State, args: { crateType: string, tests: boolean }) => args,
  (code, configuration, { crateType, tests }) => ({
    mode: configuration.mode,
    edition: configuration.edition,
    crateType,
    tests,
    code,
    clippy: configuration.clippyOnRun,
    timeoutMs: configuration.runLimit * MS_PER_S || undefined,
  }),
);

export const compileRequestPayloadSelector = createSelector(
  codeOrFilesSelector,
  (state: State) => state.configuration,
  getCrateType,
  runAsTest,
  (_state: State, args: { target: Emit }) => args,
  (code, configuration, crateType, tests, { target }) => ({
    mode: configuration.mode,
    edition: configuration.edition,
    crateType,
    tests,
    code,
    emit: target,
  }),
);

export const themeSelector = createSelector(
  (state: State) => state,
  (state) => state.configuration.theme,
);
