export interface Bottle {
  name: string;
  // The backend hands some of these back as strings ("50") depending on
  // what the admin screen last saved - always go through Number() when
  // doing maths on them.
  capacity: number | string;
  originalCapacity?: number | string;
  serving: number | string;
}

export interface Ingredient {
  name: string;
  serving: number;
  manual?: boolean;
  wait?: number;
}

export interface Recipe {
  name?: string; // stable id, assigned once saved
  friendlyname: string;
  ingredients: Ingredient[];
  imageUrl?: string;
  // Optional, both set from the admin Recipes tab: what to add by hand
  // after pouring ("lime wedge"), and a hex colour that overrides the one
  // guessed from the ingredients (src/drinkColor.ts).
  garnish?: string;
  // UI-only line shown under the name instead of the ingredient list (shot mode).
  subtitle?: string;
  color?: string;
}

// Strength steps from issue #19. Only "regular" is pourable until the
// backend applies the factor itself - see src/features.ts.
export type Strength = 'mocktail' | 'light' | 'regular' | 'strong';

export interface PourResult {
  success: boolean;
  pourTime: number;
  error?: string;
  // Returned once show mode exists on the backend (issue #4). Absent today.
  show?: {track?: string; bpm?: number; startedAt?: number};
}

export interface ServoStateEvent {
  servos?: boolean[];
  bottles?: Bottle[];
  drinks?: Recipe[];
  buttonsDisabled?: boolean;
  // Emitted by a future /api/estop (issue #9). Never sent today.
  estop?: boolean;
}
