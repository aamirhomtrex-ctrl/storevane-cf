import mod from '../_lib/store-think.js';
import { run } from '../_lib/adapt.js';
export const onRequest = (ctx) => run(mod, ctx);
