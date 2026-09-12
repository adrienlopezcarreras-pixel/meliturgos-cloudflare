import { onRequestGet as renderMvp } from './mvp-interface.js';

export async function onRequestGet(context){
  return renderMvp(context);
}
