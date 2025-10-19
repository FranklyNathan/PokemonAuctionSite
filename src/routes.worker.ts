import { Env } from './index';

// js files in `clientModules` are bundled as text, so this import is actually a string
//   so that it can be sent in a Response to the client. see `rules` in `wrangler.toml`.
import playersTableMod from './clientModules/playersTable.js';
import CountDownTimerMod from './clientModules/CountDownTimer.js';
import teamSelectionModalMod from './clientModules/teamSelectionModal.js';
import confettiMod from './clientModules/confetti.js';
import onMessageMod from './clientModules/onMessage.js';
import htmlMod from './clientModules/html.js';
import clientActionsMod from './clientModules/clientActions.js';
import exclamationTriangle from '../assets/generic/exclamation-triangle.svg';
import infoCircle from '../assets/generic/info-circle.svg';

import agGrid from '../node_modules/ag-grid-community/dist/ag-grid-community.min.js';
import confetti from '../node_modules/canvas-confetti/dist/confetti.browser.js';
import papaparse from '../node_modules/papaparse/papaparse.min.js';

export async function handleNewAuction(request: Request, env: Env): Promise<Response> {
  // this is a form submit with data for a new auction
  // generate new auction ID and saves the auction setup parameters in the form to the new auction
  let dId = env.AUCTION.newUniqueId();
  let stub = env.AUCTION.get(dId);
  return await stub.fetch(request);
}

export async function handleModule(_: Request, path: string[]): Promise<Response> {
  if (!path[1]) {
    console.error('Request to get a module did not specify the module name!');
    return new Response('404 Not Found', { status: 404 });
  }

  let script: any;
  switch (path[1]) {
    case 'playersTable.js':
      script = playersTableMod;
      break;
    case 'CountDownTimer.js':
      script = CountDownTimerMod;
      break;
    case 'teamSelectionModal.js':
      script = teamSelectionModalMod;
      break;
    case 'confetti.js':
      script = confettiMod;
      break;
    case 'onMessage.js':
      script = onMessageMod;
      break;
    case 'html.js':
      script = htmlMod;
      break;
    case 'clientActions.js':
      script = clientActionsMod;
      break;
    default:
      return new Response('404 Not Found', { status: 404 });
  }
  return new Response(script, { headers: { 'Content-Type': 'text/javascript;charset=UTF-8' } });
}

export async function handleIcon(_: Request, path: string[]): Promise<Response> {
  let icon;
  switch (path[2]) {
    case 'exclamation-triangle.svg':
      icon = exclamationTriangle;
      break;
    case 'info-circle.svg':
      icon = infoCircle;
      break;
    default:
      return new Response('404 Not Found', { status: 404 });
  }
  return new Response(icon, { headers: { 'Content-Type': 'image/svg+xml' } });
}

export async function handleVendor(_: Request, path: string[]): Promise<Response> {
  let lib;
  switch (path[path.length - 1]) {
    case 'ag-grid.js':
      lib = agGrid;
      break;
    case 'confetti.js':
      lib = confetti;
      break;
    case 'papaparse.js':
      lib = papaparse;
      break;
    default:
      return new Response('404 Not Found', { status: 404 });
  }
  return new Response(lib, { headers: { 'Content-Type': 'text/javascript;charset=UTF-8' } });
}

export async function handleDO(request: Request, env: Env, path: string[]): Promise<Response> {
  try {
    let dId: DurableObjectId = env.AUCTION.idFromString(path[0]);
    let stub: DurableObjectStub = env.AUCTION.get(dId);
    // We call `fetch()` on the stub to send a request to the Durable Object instance
    // The Durable Object instance will invoke its fetch handler to handle the request
    return await stub.fetch(request);
  } catch (_) {
    return new Response(`Invalid auction ID (${path[0]})`, { status: 404 });
  }
}
