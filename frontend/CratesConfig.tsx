import React from 'react';

import { Button, ButtonSet } from './ButtonSet';
import MenuAside from './MenuAside';
import MenuGroup from './MenuGroup';
import MenuItem from './MenuItem';
import { useAppSelector } from './hooks';
import * as toolchain from './toolchain';

import * as styles from './CratesConfig.module.css';

const mb = (bytes: number) => `${(bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0)} MB`;

// The crates are downloaded as programs use them, and kept by the browser;
// or all at once, here.
const CratesConfig: React.FC = () => {
  const count = useAppSelector((state) => state.crates.length);
  const status = useAppSelector((state) => state.toolchain.crates);

  if (!status) {
    return null;
  }

  const { cacheable, total, saved, downloading, failed } = status;
  const all = saved >= total;

  let text;
  if (!cacheable) {
    text = `This browser can't keep the ${count} crates (a private window, perhaps): each is downloaded when a program first uses it.`;
  } else if (downloading) {
    text = `Downloading: ${mb(saved)} of ${mb(total)}…`;
  } else if (all) {
    text = `This browser keeps all ${count} crates (${mb(total)}).`;
  } else {
    text = `Each of the ${count} crates is downloaded when a program first uses it, and kept by this browser`;
    text += saved ? ` (it keeps ${mb(saved)} of ${mb(total)}).` : '.';
  }
  if (failed && !downloading) {
    text += ` ${failed === -1 ? 'The download failed' : `${failed} files could not be downloaded`}: try again.`;
  }

  const download = () => {
    // Ask the browser not to clear them when space runs low.
    navigator.storage?.persist?.().catch(() => {});
    toolchain.downloadCrates();
  };

  return (
    <MenuGroup title="Crates">
      <MenuItem>
        <p className={styles.text} data-test-id="crates-status">
          {text}
        </p>
        {downloading && <progress className={styles.progress} value={saved} max={total} />}
        {cacheable && (
          <div className={styles.buttons}>
            <ButtonSet>
              <Button isSmall type="button" onClick={download} disabled={downloading || all}>
                Download all ({mb(total - saved)})
              </Button>
            </ButtonSet>
            <ButtonSet>
              <Button
                isSmall
                type="button"
                onClick={toolchain.removeCrates}
                disabled={downloading || saved === 0}
              >
                Remove
              </Button>
            </ButtonSet>
          </div>
        )}
        <MenuAside>
          A program downloads the crates it uses (tokio, for example, takes about 23 MB with its
          dependencies). Download all of them ahead of time to never wait.
        </MenuAside>
      </MenuItem>
    </MenuGroup>
  );
};

export default CratesConfig;
