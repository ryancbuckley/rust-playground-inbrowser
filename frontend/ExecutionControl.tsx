import React, { useCallback } from 'react';

import { Button, ButtonSet } from './ButtonSet';
import { useAppDispatch, useAppSelector } from './hooks';
import { executeKillCurrent } from './reducers/output/execute';
import { isExecutingSelector } from './selectors';

import * as styles from './ExecutionControl.module.css';

// Where the Rust Playground has standard input: programs here have none
// (it is empty), so this only stops them.
const ExecutionControl: React.FC = () => {
  const dispatch = useAppDispatch();
  const executing = useAppSelector(isExecutingSelector);
  const runLimit = useAppSelector((state) => state.configuration.runLimit);

  const stop = useCallback(() => dispatch(executeKillCurrent()), [dispatch]);

  return (
    <div className={styles.container} data-test-id="execution-control" data-executing={executing}>
      <span className={styles.note}>
        {runLimit ? `Programs are stopped after ${runLimit} s.` : 'Programs run without a limit.'}
      </span>
      <ButtonSet className={styles.buttons}>
        <Button
          isSmall
          type="button"
          onClick={stop}
          disabled={!executing}
          title="Stop the compiler or the program"
        >
          Stop
        </Button>
      </ButtonSet>
    </div>
  );
};

export default ExecutionControl;
