import assert from 'node:assert/strict';
import {moveInCabin} from './movement.mjs';
const p={x:0,z:2};moveInCabin(p,0,-30);assert(p.z>=-7.82);
moveInCabin(p,0,-30,true);assert(p.z>=-12.05&&p.z< -11.9);
moveInCabin(p,0,30,true);assert(p.z<=3.87&&p.z>3.7);
const q={x:0,z:-5};moveInCabin(q,10,0,true);assert(q.x<.68);moveInCabin(q,-20,0,true);assert(q.x>-.63);
const wall={x:1,z:-7};moveInCabin(wall,0,-4,true);assert(wall.z>-7.83);
console.log('Passed: closed door blocks entry, open door permits room traversal, partition and furniture collision, large-step movement.');
