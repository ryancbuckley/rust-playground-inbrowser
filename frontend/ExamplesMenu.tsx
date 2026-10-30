import React from 'react';

import ButtonMenuItem from './ButtonMenuItem';
import MenuGroup from './MenuGroup';
import { showExample } from './actions';
import { EXAMPLES } from './examples';
import { useAppDispatch } from './hooks';

interface ExamplesMenuProps {
  close: () => void;
}

const ExamplesMenu: React.FC<ExamplesMenuProps> = ({ close }) => {
  const dispatch = useAppDispatch();

  return (
    <MenuGroup title="Examples &mdash; Replace the code">
      {EXAMPLES.map(({ name, description, code }) => (
        <ButtonMenuItem
          key={name}
          name={name}
          onClick={() => {
            dispatch(showExample(code));
            close();
          }}
        >
          {description}
        </ButtonMenuItem>
      ))}
    </MenuGroup>
  );
};

export default ExamplesMenu;
