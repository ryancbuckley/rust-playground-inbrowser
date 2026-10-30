import React, { Fragment } from 'react';

import MenuAside from './MenuAside';
import MenuGroup from './MenuGroup';
import SelectableMenuItem from './SelectableMenuItem';

import * as selectors from './selectors';
import { useAppSelector } from './hooks';

import * as styles from './ChannelMenu.module.css';

interface ChannelMenuProps {
  close: () => void;
}

// One channel: the compiler that runs in the browser is built from a nightly.
const ChannelMenu: React.FC<ChannelMenuProps> = props => {
  const nightlyVersion = useAppSelector(selectors.toolchainVersionText);

  return (
    <Fragment>
      <MenuGroup title="Channel &mdash; Choose the rust version">
        <SelectableMenuItem name="Nightly channel" selected onClick={props.close}>
          <Desc>Build using the Nightly version: {nightlyVersion}</Desc>
          <MenuAside>
            The compiler runs in your browser, built for WebAssembly from this nightly with the
            playground&rsquo;s patches. Stable and Beta are not available.
          </MenuAside>
        </SelectableMenuItem>
      </MenuGroup>
    </Fragment>
  );
};

const Desc: React.FC<React.PropsWithChildren<unknown>> = ({ children }) => (
  <p className={styles.description}>{children}</p>
);

export default ChannelMenu;
