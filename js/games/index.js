import farkle from './farkle.js';
import yacht from './yacht.js';
import draw from './draw.js';
import streak from './streak.js';
import rush from './rush.js';
import faces from './faces.js';

export const GAME_LIST = [farkle, yacht, draw, streak, rush, faces];
export const GAMES = Object.fromEntries(GAME_LIST.map((g) => [g.id, g]));
