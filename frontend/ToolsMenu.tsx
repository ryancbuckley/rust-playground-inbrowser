import React, { useCallback } from 'react';

import ButtonMenuItem from './ButtonMenuItem';
import MenuGroup from './MenuGroup';
import MenuAside from './MenuAside';

import * as selectors from './selectors';
import { useAppDispatch } from './hooks';
import { performClippy } from './reducers/output/clippy';
import { performFormat } from './reducers/output/format';
import { performMacroExpansion } from './reducers/output/macroExpansion';
import { useAppSelector } from './hooks';

interface ToolsMenuProps {
  close: () => void;
}

const ToolsMenu: React.FC<ToolsMenuProps> = props => {
  const nightlyVersion = useAppSelector(selectors.toolchainVersionText);

  const dispatch = useAppDispatch();
  const format = useCallback(() => {
    dispatch(performFormat());
    props.close();
  }, [dispatch, props]);
  const clippy = useCallback(() => {
    dispatch(performClippy());
    props.close();
  }, [dispatch, props]);
  const expandMacros = useCallback(() => {
    dispatch(performMacroExpansion());
    props.close();
  }, [dispatch, props]);

  return (
    <MenuGroup title="Tools">
      <ButtonMenuItem
        name="Rustfmt"
        onClick={format}>
        <div>Format this code with Rustfmt.</div>
        <MenuAside>Built into the compiler ({nightlyVersion})</MenuAside>
      </ButtonMenuItem>
      <ButtonMenuItem
        name="Clippy"
        onClick={clippy}>
        <div>Catch common mistakes and improve the code using the Clippy linter.</div>
        <MenuAside>Built into the compiler ({nightlyVersion})</MenuAside>
      </ButtonMenuItem>
      <ButtonMenuItem
        name="Expand macros"
        onClick={expandMacros}>
        <div>
          Expand macros in code using the nightly compiler.
        </div>
        <MenuAside>{nightlyVersion}</MenuAside>
      </ButtonMenuItem>
    </MenuGroup>
  );
};

export default ToolsMenu;
