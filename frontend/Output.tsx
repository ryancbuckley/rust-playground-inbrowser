import React, { useCallback } from 'react';

import { changeFocus } from './reducers/output/meta';
import { Focus } from './types';

import Execute from './Output/Execute';
import Share from './Output/Share';
import SimplePane from './Output/SimplePane';
import PaneWithMir from './Output/PaneWithMir';
import * as selectors from './selectors';
import { useAppDispatch, useAppSelector } from './hooks';

import * as styles from './Output.module.css';
import ExecutionControl from './ExecutionControl';

const Tab: React.FC<TabProps> = ({ kind, focus, label, onClick, tabProps }) => {
  if (selectors.hasProperties(tabProps) || focus === kind) {
    return (
      <button className={focus === kind ? styles.tabSelected : styles.tab}
        onClick={onClick}>
        {label}
      </button>
    );
  } else {
    return null;
  }
};

interface TabProps {
  kind: Focus;
  focus?: Focus;
  label: string;
  onClick: () => void;
  tabProps: object;
}

const Output: React.FC = () => {
  const somethingToShow = useAppSelector(selectors.getSomethingToShow);
  const { meta: { focus }, execute, format, clippy, macroExpansion, mir, hir } =
    useAppSelector((state) => state.output);

  const dispatch = useAppDispatch();
  const focusClose = useCallback(() => dispatch(changeFocus()), [dispatch]);
  const focusExecute = useCallback(() => dispatch(changeFocus(Focus.Execute)), [dispatch]);
  const focusFormat = useCallback(() => dispatch(changeFocus(Focus.Format)), [dispatch]);
  const focusClippy = useCallback(() => dispatch(changeFocus(Focus.Clippy)), [dispatch]);
  const focusMacroExpansion = useCallback(() => dispatch(changeFocus(Focus.MacroExpansion)), [dispatch]);
  const focusMir = useCallback(() => dispatch(changeFocus(Focus.Mir)), [dispatch]);
  const focusHir = useCallback(() => dispatch(changeFocus(Focus.Hir)), [dispatch]);
  const focusShare = useCallback(() => dispatch(changeFocus(Focus.Share)), [dispatch]);

  if (!somethingToShow) {
    return null;
  }

  let close: React.ReactElement | null = null;
  let body: React.ReactElement | null = null;
  if (focus) {
    close = <button className={styles.tabClose} onClick={focusClose}>Close</button>;

    body = (
      <>
        <div className={styles.body}>
          {focus === Focus.Execute && <Execute />}
          {focus === Focus.Format && <SimplePane {...format} kind="format" />}
          {focus === Focus.Clippy && <SimplePane {...clippy} kind="clippy" />}
          {focus === Focus.MacroExpansion && <SimplePane {...macroExpansion} kind="macro-expansion" />}
          {focus === Focus.Mir && <PaneWithMir {...mir} kind="mir" />}
          {focus === Focus.Hir && <PaneWithMir {...hir} kind="hir" />}
          {focus === Focus.Share && <Share />}
        </div>
        {focus === Focus.Execute && (
          <div className={styles.stdin}>
            <ExecutionControl />
          </div>
        )}
      </>
    );
  }

  return (
    <div className={styles.container} data-test-id="output">
      <div className={styles.tabs}>
        <Tab kind={Focus.Execute} focus={focus}
          label="Execution"
          onClick={focusExecute}
          tabProps={execute} />
        <Tab kind={Focus.Format} focus={focus}
          label="Format"
          onClick={focusFormat}
          tabProps={format} />
        <Tab kind={Focus.Clippy} focus={focus}
          label="Clippy"
          onClick={focusClippy}
          tabProps={clippy} />
        <Tab kind={Focus.MacroExpansion} focus={focus}
          label="Macro expansion"
          onClick={focusMacroExpansion}
          tabProps={macroExpansion} />
        <Tab kind={Focus.Mir} focus={focus}
          label="MIR"
          onClick={focusMir}
          tabProps={mir} />
        <Tab kind={Focus.Hir} focus={focus}
          label="HIR"
          onClick={focusHir}
          tabProps={hir} />
        <Tab kind={Focus.Share} focus={focus}
          label="Share"
          onClick={focusShare}
          tabProps={{}} />
        {close}
      </div>
      { body }
    </div>
  );
};

export default Output;
