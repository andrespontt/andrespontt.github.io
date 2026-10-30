// Dev scenario registry. To add one: create a file in this folder exporting
// { id, title, create(ctx) } (see README.md here) and list it below.
import locomotion from './locomotion.js';
import startStop from './start-stop.js';
import aim from './aim.js';
import jump from './jump.js';
import balls from './balls.js';
import rope from './rope.js';
import easing from './easing-lanes.js';
import city from './city.js';
import safehousePine from './safehouse-pine.js';
import safehouseLoft from './safehouse-loft.js';

export default [city, safehousePine, safehouseLoft, locomotion, startStop, aim, jump, balls, rope, easing];
