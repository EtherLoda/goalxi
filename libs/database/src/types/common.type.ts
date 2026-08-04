import { Branded } from './types';

export type Uuid = Branded<string, 'Uuid'>;
export type PlayerId = Branded<number, 'PlayerId'>;
