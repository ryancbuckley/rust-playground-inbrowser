import React from 'react';
import { Reducer, UnknownAction } from '@reduxjs/toolkit';

import { createBrowserHistory as createHistory, Path, Location } from 'history';
import { createRouter, PlainOrThunk, RouterObject, StoreArg } from './uss-router';
import UssRouter from './uss-router/Router';

import qs from 'qs';

import * as actions from './actions';
import { State } from './reducers';
import { Edition, Mode, Page } from './types';

// The page is a static file, served from any directory: the routes are
// relative to the page's own path, and help is a query (?help) rather than
// a path the server would have to know.
const basePath = new URL('.', window.location.href).pathname;

interface Substate {
  page: Page;
  configuration: {
    mode: Mode;
    edition: Edition;
  };
}

const stateSelector = ({ page, configuration: { mode, edition } }: State): Substate => ({
  page,
  configuration: {
    mode,
    edition,
  },
});

const stateToLocation = ({ page, configuration }: Substate): Partial<Path> => {
  switch (page) {
    case 'help': {
      return {
        pathname: `${basePath}?help`,
      };
    }

    default: {
      const query = {
        mode: configuration.mode,
        edition: configuration.edition,
      };
      return {
        pathname: `${basePath}?${qs.stringify(query)}`,
      };
    }
  }
};

const locationToAction = (location: Location): PlainOrThunk<State, UnknownAction> | null => {
  if (location.pathname !== basePath && location.pathname !== `${basePath}index.html`) {
    return null;
  }

  const query = qs.parse(location.search.slice(1));

  if ('help' in query) {
    return actions.helpPageLoad();
  }

  return actions.indexPageLoad(query);
};

export default class Router extends React.Component<RouterProps> {
  private router: RouterObject<UnknownAction>;

  public constructor(props: RouterProps) {
    super(props);

    const history = createHistory();

    const { store, reducer } = props;

    this.router = createRouter({
      store, reducer,
      history, stateSelector, locationToAction, stateToLocation,
    });
  }

  public render() {
    return <UssRouter router={this.router}>{this.props.children}</UssRouter>;
  }
}

interface RouterProps {
  children: React.ReactNode;
  store: StoreArg<State, UnknownAction>;
  reducer: Reducer<State>;
}
