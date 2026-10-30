import React, { useState } from 'react';

import { ClipboardIcon } from '../Icon';
import { useAppSelector } from '../hooks';
import * as selectors from '../selectors/share';
import Section from './Section';

import * as styles from './Share.module.css';

const Share: React.FC = () => (
  <div data-test-id="output-share">
    <Links />
  </div>
);

interface CopiedProps {
  children: React.ReactNode;
  href: string;
}

const Copied: React.FC<CopiedProps> = ({ children, href }) => {
  'use memo';

  const [copied, setCopied] = useState(false);

  const startCopy = () => {
    setCopied(true);
    window.navigator.clipboard.writeText(href);

    setTimeout(() => {
      setCopied(false);
    }, 1000);
  };

  return (
    <p className={copied ? styles.active : styles.container}>
      <a href={href}>{children}</a>
      <button className={styles.button} type="button" onClick={startCopy} title="Copy link">
        <ClipboardIcon />
      </button>
      <span className={styles.text}>Copied!</span>
    </p>
  );
};

const Links: React.FC = () => {
  'use memo';

  const codeUrl = useAppSelector(selectors.codeUrlSelector);

  return (
    <>
      <Copied href={codeUrl}>Embedded code in link</Copied>
      <Section kind="info" label="Nothing is uploaded">
        The link contains the code itself. Anyone who opens it compiles the code in their own
        browser.
      </Section>
    </>
  );
};

export default Share;
