import mod from '../_lib/fetch-sheet.js';
import { run } from '../_lib/adapt.js';
export const onRequest = (ctx) => run(mod, ctx);
