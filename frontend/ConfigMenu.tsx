/* global ACE_KEYBINDINGS:false, ACE_THEMES:false */

import React from 'react';

import { Either as EitherConfig, Select as SelectConfig } from './ConfigElement';
import CratesConfig from './CratesConfig';
import MenuGroup from './MenuGroup';
import SimpleButtonMenuItem from './SimpleButtonMenuItem';
import { useAppDispatch, useAppSelector } from './hooks';
import * as client from './reducers/client';
import * as config from './reducers/configuration';
import {
  Editor,
  FileView,
  Orientation,
  PairCharacters,
  Theme,
} from './types';
import * as selectors from './selectors';
import MenuAside from './MenuAside';
import { preserveContentAndChangeFileView } from './actions';

const MONACO_THEMES = [
  'vs', 'vs-dark', 'vscode-dark-plus',
];

const MultifileAside = () => <MenuAside>All files will be prefixed with their name and concatenated if <code>Single</code> is selected.</MenuAside>;

const MultifileConfig: React.FC = () => {
  'use memo';

  const allowMultipleFiles = useAppSelector(selectors.allowMultipleFiles);
  const fileView = useAppSelector((state) => state.configuration.fileView);

  const dispatch = useAppDispatch();

  if (!allowMultipleFiles) {
    return null;
  }

  const aside = (fileView === FileView.Multiple) ? <MultifileAside /> : undefined;

  return (
    <EitherConfig
      id="editor-file-view"
      aside={aside}
      name="Edit files"
      a={FileView.Single}
      b={FileView.Multiple}
      value={fileView}
      onChange={(v) => dispatch(preserveContentAndChangeFileView(v))} />
  );
}

const ConfigMenu: React.FC = () => {
  'use memo';

  const keybinding = useAppSelector((state) => state.configuration.ace.keybinding);
  const aceTheme = useAppSelector((state) => state.configuration.ace.theme);
  const monacoTheme = useAppSelector((state) => state.configuration.monaco.theme);
  const theme = useAppSelector((state) => state.configuration.theme);
  const orientation = useAppSelector((state) => state.configuration.orientation);
  const editorStyle = useAppSelector((state) => state.configuration.editor);
  const pairCharacters = useAppSelector((state) => state.configuration.ace.pairCharacters);

  const dispatch = useAppDispatch();

  return (
    <>
      <MenuGroup title="Editor">
        <MultifileConfig />
        <SelectConfig
          name="Editor"
          value={editorStyle}
          onChange={(e) => dispatch(config.changeEditor(e))}
        >
          {[Editor.Simple, Editor.Ace, Editor.Monaco]
            .map(k => <option key={k} value={k}>{k}</option>)}
        </SelectConfig>
        {editorStyle === Editor.Ace && (
          <>
            <SelectConfig
              name="Keybinding"
              value={keybinding}
              onChange={(k) => dispatch(config.changeKeybinding(k))}
            >
              {ACE_KEYBINDINGS.map(k => <option key={k} value={k}>{k}</option>)}
            </SelectConfig>

            <SelectConfig
              name="Theme"
              value={aceTheme}
              onChange={(t) => dispatch(config.changeAceTheme(t))}
            >
              {ACE_THEMES.map(t => <option key={t} value={t}>{t}</option>)}
            </SelectConfig>

            <EitherConfig
              id="editor-pair-characters"
              name="Pair Characters"
              a={PairCharacters.Enabled}
              b={PairCharacters.Disabled}
              value={pairCharacters}
              onChange={(p) => dispatch(config.changePairCharacters(p))} />
          </>
        )}
        {editorStyle === Editor.Monaco && (
          <>
            <SelectConfig
              name="Theme"
              value={monacoTheme}
              onChange={(t) => dispatch(config.changeMonacoTheme(t))}
            >
              {MONACO_THEMES.map(t => <option key={t} value={t}>{t}</option>)}
            </SelectConfig>
          </>
        )}
      </MenuGroup>

      <MenuGroup title="UI">
        <SelectConfig name="Theme" value={theme} onChange={(t) => dispatch(config.changeTheme(t))}>
          <option value={Theme.System}>System</option>
          <option value={Theme.Light}>Light</option>
          <option value={Theme.Dark}>Dark</option>
        </SelectConfig>

        <SelectConfig
          name="Orientation"
          value={orientation}
          onChange={(o) => dispatch(config.changeOrientation(o))}
        >
          <option value={Orientation.Automatic}>Automatic</option>
          <option value={Orientation.Horizontal}>Horizontal</option>
          <option value={Orientation.Vertical}>Vertical</option>
        </SelectConfig>
      </MenuGroup>

      <CratesConfig />

      <MenuGroup title="Reset">
        <SimpleButtonMenuItem onClick={() => dispatch(client.showConfigReset())}>
          Reset all code and configuration to default values
        </SimpleButtonMenuItem>
      </MenuGroup>
    </>
  );
};

export default ConfigMenu;
