import {createContext} from 'react';

// How far Stage has turned the UI (0 when the viewport is already portrait).
// Touch coordinates stay in screen space, so a swipe along the portrait
// "horizontal" arrives as vertical movement; gesture code needs this to map it back.
export const StageRotation = createContext<0 | 90 | 270>(0);
