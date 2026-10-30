import React, { useCallback } from 'react';

import ButtonMenuItem from './ButtonMenuItem';
import MenuGroup from './MenuGroup';
import * as actions from './actions';
import { useAppDispatch } from './hooks';

import * as styles from './BuildMenu.module.css';

interface BuildMenuProps {
  close: () => void;
}

const useAppDispatchAndClose = (action: () => actions.ThunkAction, close: () => void) => {
  const dispatch = useAppDispatch();

  return useCallback(() => {
    dispatch(action());
    close();
  }, [action, close, dispatch]);
};

const BuildMenu: React.FC<BuildMenuProps> = (props) => {
  const compile = useAppDispatchAndClose(actions.performCompile, props.close);
  const compileToMir = useAppDispatchAndClose(actions.performCompileToMir, props.close);
  const compileToHir = useAppDispatchAndClose(actions.performCompileToHir, props.close);
  const execute = useAppDispatchAndClose(actions.performExecute, props.close);
  const test = useAppDispatchAndClose(actions.performTest, props.close);

  return (
    <MenuGroup title="What do you want to do?">
      <ButtonMenuItem name="Run" onClick={execute}>
        Build and run the code, showing the output. Equivalent to <Code>cargo run</Code>.
      </ButtonMenuItem>
      <ButtonMenuItem name="Build" onClick={compile}>
        Build the code without running it. Equivalent to <Code>cargo build</Code>.
      </ButtonMenuItem>
      <ButtonMenuItem name="Test" onClick={test}>
        Build the code and run all the tests. Equivalent to <Code>cargo test</Code>.
      </ButtonMenuItem>
      <ButtonMenuItem name="MIR" onClick={compileToMir}>
        Build and show the resulting MIR, Rust’s control-flow-based intermediate representation.
      </ButtonMenuItem>
      <ButtonMenuItem name="HIR" onClick={compileToHir}>
        Build and show the resulting HIR, Rust’s syntax-based intermediate representation.
      </ButtonMenuItem>
    </MenuGroup>
  );
};

const Code: React.FC<{ children: string }> = ({ children }) => (
  <code className={styles.code}>{children}</code>
);

export default BuildMenu;
