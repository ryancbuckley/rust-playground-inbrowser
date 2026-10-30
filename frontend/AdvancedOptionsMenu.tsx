import React, { useCallback } from 'react';

import { Either as EitherConfig, Select as SelectConfig } from './ConfigElement';
import MenuAside from './MenuAside';
import MenuGroup from './MenuGroup';
import { useAppDispatch, useAppSelector } from './hooks';
import * as config from './reducers/configuration';
import * as selectors from './selectors';
import { Edition } from './types';

const RUN_LIMITS = [
  [5, '5 s'],
  [10, '10 s'],
  [30, '30 s'],
  [60, '1 min'],
  [0, 'None'],
] as const;

const AdvancedOptionsMenu: React.FC = () => {
  const isEditionDefault = useAppSelector(selectors.isEditionDefault);
  const edition = useAppSelector((state) => state.configuration.edition);
  const autoRun = useAppSelector((state) => state.configuration.autoRun);
  const runLimit = useAppSelector((state) => state.configuration.runLimit);
  const clippyOnRun = useAppSelector((state) => state.configuration.clippyOnRun);

  const dispatch = useAppDispatch();

  const changeEdition = useCallback((e: Edition) => dispatch(config.changeEdition(e)), [dispatch]);
  const changeAutoRun = useCallback(
    (v: string) => dispatch(config.changeAutoRun(v === 'on')),
    [dispatch],
  );
  const changeRunLimit = useCallback(
    (v: string) => dispatch(config.changeRunLimit(Number(v))),
    [dispatch],
  );
  const changeClippyOnRun = useCallback(
    (v: string) => dispatch(config.changeClippyOnRun(v === 'on')),
    [dispatch],
  );

  return (
    <>
      <MenuGroup title="Advanced options">
        <SelectConfig
          name="Edition"
          value={edition}
          isDefault={isEditionDefault}
          onChange={changeEdition}
        >
          <option value={Edition.Rust2015}>2015</option>
          <option value={Edition.Rust2018}>2018</option>
          <option value={Edition.Rust2021}>2021</option>
          <option value={Edition.Rust2024}>2024</option>
        </SelectConfig>

        <EitherConfig
          id="clippy-on-run"
          name="Clippy lints"
          a="on"
          b="off"
          aLabel="On"
          bLabel="Off"
          value={clippyOnRun ? 'on' : 'off'}
          isDefault={clippyOnRun}
          onChange={changeClippyOnRun}
          aside={<MenuAside>Add Clippy&rsquo;s lints to the compiler&rsquo;s warnings.</MenuAside>}
        />
      </MenuGroup>

      <MenuGroup title="Running">
        <EitherConfig
          id="auto-run"
          name="Auto-run"
          a="on"
          b="off"
          aLabel="On"
          bLabel="Off"
          value={autoRun ? 'on' : 'off'}
          isDefault={autoRun}
          onChange={changeAutoRun}
          aside={<MenuAside>Run the code again after every change.</MenuAside>}
        />

        <SelectConfig
          name="Run limit"
          value={String(runLimit)}
          isDefault={runLimit === 10}
          onChange={changeRunLimit}
          aside={<MenuAside>Stop programs that run longer. Compiling has no limit.</MenuAside>}
        >
          {RUN_LIMITS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectConfig>
      </MenuGroup>
    </>
  );
};

export default AdvancedOptionsMenu;
